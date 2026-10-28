import { ChartAccess, ChartFocus } from './chart-access';
import { allocation, type ChartSeries } from './chart-data';
import { centralClock, centralDay, centralHour, centralTime } from './app-time';
import { SidebarResize } from './sidebar-resize';
import { categoryDescription, categoryTable, comparisonDescription, comparisonTable } from '../../../shared/chart-description';
import { PriceFlash } from './price-flash';
import { FinancialChange } from './financial-change';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, afterNextRender, inject, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { AdvancedTicket } from './advanced-ticket';
import { AdvancedChart } from './advanced-chart';
import { ActivityFeed } from './activity-feed';
import { OrderSubmissionClient, OrderSubmissionError, Instrument } from './order-submission-api';
import { AccountSwitcher } from './account-switcher';
import { AccountsService } from './accounts.service';
import { canTrade } from './accounts-api';
import {
  FINAL_ORDER_STATUSES,
  ORDER_TRACK_INTERVAL_MS,
  ORDER_TRACK_LIMIT_MS,
  OrderHistoryClient,
  OrderHistoryRow,
  newlyFilled,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, hasMarketValuation, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { closedMarketWarning, localOpeningTime, marketBadgeText, marketStatusText } from './market-status-api';
import { MarketTicker } from './market-ticker';
import { PortfolioChart } from './portfolio-chart';
// The same chart helpers novice uses, so both dashboards draw the portfolio line identically.
import { CHART_REFRESH_MS, fundedAt, lastPerBar } from './novice-dashboard';
/** Most live values kept on the portfolio line (as in novice). */
const LIVE_POINTS = 28800;
import { CashActivityClient } from './activity-api';
import { chartPoints } from './chart-data';
import {
  ChartPeriod, ChartRange, PricePoint as HistoryPricePoint, ValuePoint, barStep, chartRange, portfolioSeries, portfolioEvents, ledgerMatches, startValue, portfolioPeriodLabel,
} from './portfolio-history';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { AccountSettings } from './account-settings';
import { ToastService, Toasts } from './toasts';
import { tradingClients } from './trading-clients';
import type { UserProfile } from './auth-api';
import { AccessibilitySettings } from './accessibility-settings';
import { KeyboardShortcuts, isShortcutsKey } from './keyboard-shortcuts';
import { briefingOrders } from './briefing';
import { BriefingButton, BriefingSource } from './briefing-button';
import { orderReadBack } from './order-read-back';
import { SwitchScanService } from '../../../shared/switch-scan';
import { liveAnnouncer } from './live-announcer';
import { speakable } from './speech-text';
import { OrderAnnouncements } from './order-announcements';
import { PriceWatch } from './price-watch';
import { spokenCompany } from './briefing';
import { spokenQuote } from './speech-text';
import { tradeMarks } from './trade-marks';

interface Quote {
  instrumentId: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  sector: string;
  quotedAt: string;
}
const NO_PRICE_ERROR = 'There is no live price for this stock yet. Try again in a moment.';
/** Shown until the first stock list arrives. */
const NO_QUOTE: Quote = { instrumentId: '', symbol: '', name: '', price: 0, change: 0, sector: '', quotedAt: '' };
interface Position {
  symbol: string;
  /** Latest bid, or average cost when no quote is available. */
  price: number;
  quantity: number;
  cost: number;
  value: number;
  /** Today's move in the position's value, from the stock's change since the day's first quote. */
  day: number;
  total: number;
  weight: number;
}
/** One sector's average move today across the listed stocks in it. */
interface SectorMove {
  name: string;
  change: number;
  /** Bar length, as % of the biggest move shown. */
  width: number;
}
/** One order from the backend's history, for tracking, toasts and the chart's trade markers. */
interface Order {
  id: string;
  time: string;
  symbol: string;
  side: string;
  quantity: number;
  /** Fill price; null until the order fills. */
  price: number | null;
  status: string;
  type: string;
}

@Component({
  selector: 'app-advanced-dashboard',
  imports: [FinancialChange, PriceFlash, MarketTicker, PortfolioChart, 
    CurrencyPipe, DecimalPipe, DashboardIcon, AdvancedTicket, AdvancedChart, ActivityFeed, AccountSwitcher, Toasts, PriceProtectionSettings,
    AccessibilitySettings, KeyboardShortcuts, BriefingButton, ChartAccess, ChartFocus, AccountSettings, PriceWatch,
  ],
  templateUrl: './advanced-dashboard.html',
  styleUrls: ['./advanced-dashboard.scss', './advanced-dashboard.refresh.scss', './advanced-dashboard.novice.scss', './advanced-settings.scss'],
  host: { '(document:keydown)': 'onShortcutKey($event)' },
})
export class AdvancedDashboard implements OnInit, OnDestroy {
  // The four API clients are assigned from tradingClients() in the constructor.
  declare readonly orderSubmissionClient: OrderSubmissionClient;
  declare readonly orderHistoryClient: OrderHistoryClient;
  declare readonly portfolioClient: PortfolioClient;
  declare readonly cashActivityClient: CashActivityClient;
  #chartTimer: ReturnType<typeof setTimeout> | undefined;
  /** Account and period the drawn history belongs to; a refresh of the same keeps the line on screen. */
  #chartDrawnFor = '';
  #chartRequest = 0;
  /** Live values are added to the portfolio chart only once the account's balances have loaded. */
  #liveRecording = false;
  #trackTimer: ReturnType<typeof setTimeout> | undefined;
  #clockTimer: ReturnType<typeof setInterval> | undefined;
  #ordersPollTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  #portfolioAccountId: string | undefined;
  /** Latest bid and today's % change per instrument, both from the shared feed (PS-10). */
  readonly #bids = new Map<string, number>();
  readonly #dayChanges = new Map<string, number>();
  /** The previous order read, so a fill seen by polling reloads balances (PS-10). */
  #lastOrderRows: OrderHistoryRow[] | null = null;
  readonly name = input('');
  readonly profile = input<UserProfile | null>(null);
  readonly profileLoading = input(false);
  readonly profileError = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('ADVANCED');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  private routing?: PageBinding;
  private destroyed = false;
  readonly symbol = signal('AAPL');
  readonly submitting = signal(false);
  readonly submittedOrderId = signal<string | null>(null);
  readonly clientReference = signal<string>('');
  /** The client's accounts; the header picker chooses which one this desk shows and trades from (PS-05). */
  readonly accountState = inject(AccountsService, { optional: true }) ?? new AccountsService();
  readonly accounts = computed(() => this.accountState.accounts());
  readonly instruments = signal<Instrument[]>([]);
  readonly selectedAccount = computed(() => this.accountState.selected());
  readonly #stopAccountWatch: () => void;
  #started = false;
  readonly loadingAccounts = signal(false);
  readonly loadingInstruments = signal(false);
  readonly dataReady = computed(() => this.accounts().length > 0 && this.instruments().length > 0);
  readonly nav = [
    { name: 'Overview', icon: 'home' },
    { name: 'Portfolio', icon: 'chart' },
    { name: 'Activity', icon: 'orders' },
    { name: 'Markets', icon: 'search' },
    { name: 'Settings', icon: 'settings' },
  ];
  readonly page = signal('Overview');
  /** Drag the sidebar's edge to resize it, from an icon strip up to a wide panel, like the novice dashboard. */
  readonly sidebar = new SidebarResize('nexttrade.advanced.sidebarWidth', { min: 62, compact: 120, default: 165, max: 320 }, '.pro-shell');
  readonly collapsed = this.sidebar.collapsed;
  readonly query = signal('');
  readonly notifications = signal(false);
  readonly bottomTab = signal('Holdings');
  readonly bottomTabs = ['Holdings', 'Asset classes'];
  /** Balances could not be read: the service is down or unreachable (PS-11). */
  readonly serviceDown = signal(false);
  readonly marketTab = signal('Sectors');
  readonly filter = signal('All stocks');
  readonly currentTime = signal(new Date());
  readonly formattedTime = computed(() => {
    const now = this.currentTime();
    return {
      time: centralClock(now, true),
      date: centralTime(now, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    };
  });
  /** Live prices and market status shared by every view (TS-14.7, PS-02). */
  readonly feed = inject(MarketFeed, { optional: true }) ?? new MarketFeed();
  /** Every tradable stock from the backend, at its live price (TS-14.7 AC1). */
  readonly quotes = signal<Quote[]>([]);
  /** The five biggest movers today, either direction. */
  readonly topMovers = computed(() =>
    [...this.quotes()].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5),
  );
  /** Which list the overview's left card shows: the watchlist, today's movers, or sector moves (display only). */
  readonly overviewList = signal<'Watchlist' | 'Movers' | 'Sectors'>('Watchlist');
  readonly marketBadge = computed(() => marketBadgeText(this.feed.status(), this.currentTime()));
  readonly marketOpen = computed(() => this.feed.status()?.open ?? false);
  /** Countdown line for the Overview heading, e.g. "Market closes in 5h 49m" (same wording as novice). */
  readonly marketText = computed(() => marketStatusText(this.feed.status(), this.currentTime()));
  /** The portfolio-value chart, the same one novice shows: its period, span and value at each moment. */
  readonly chartPeriod = signal<ChartPeriod>('1D');
  readonly chartSpan = signal<ChartRange | null>(null);
  readonly chartHistory = signal<ValuePoint[]>([]);
  readonly chartLoading = signal(false);
  readonly chartError = signal('');
  readonly chartNotice = signal('');
  /** The chart point under the cursor; the big value follows it while it is set. */
  readonly chartScrub = signal<ValuePoint | null>(null);
  /** The value at every live update since the page opened, so each rise and dip stays on the line. */
  readonly chartLive = signal<ValuePoint[]>([]);
  /** The big number: the scrubbed point's value, otherwise the live total. */
  readonly headerValue = computed(() => this.chartScrub()?.value ?? this.portfolio());
  readonly chartChangeAvailable = computed(() => !this.chartLoading() && !this.chartError() && this.chartPoints().length >= 2);
  /** How much the value moved over the chosen period (or up to the scrubbed point). */
  readonly headerChange = computed(() => {
    const points = this.chartPoints();
    if (points.length < 2) {
      return { amount: 0, percent: 0 as number | null, label: 'Change unavailable' };
    }
    const start = startValue(points);
    const scrub = this.chartScrub();
    const amount = Math.round(((scrub ?? points.at(-1)!).value - start) * 100) / 100;
    const span = this.chartSpan();
    let label = portfolioPeriodLabel(this.chartPeriod(), span, points);
    if (span?.session && centralDay(span.session.open) !== centralDay(this.currentTime())) {
      label = centralTime(span.session.open, { weekday: 'long' });
    }
    if (scrub) {
      label = `${centralTime(scrub.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`;
    }
    return { amount, percent: start > 0 ? (amount / start) * 100 : null, label };
  });
  /** Live prices have stopped reaching the chart: the service is down or a held stock's quote is stale. */
  readonly chartDelayed = computed(() => {
    if (this.serviceDown()) { return true; }
    const held = new Set(this.positions().map((p) => p.symbol));
    const now = this.feed.now();
    return this.feed.quotes().some((q) => held.has(q.symbol) && isDelayed(q.quotedAt, now));
  });
  /** The recorded history up to the first live value, then every live value after it. */
  readonly chartPoints = computed(() => {
    const history = this.chartHistory();
    if (!this.portfolioLoaded()) { return history; }
    const range = this.chartSpan();
    let live = this.chartLive().filter((p) => p.at >= (history[0]?.at ?? range?.start ?? 0));
    if (range && this.chartPeriod() !== '1D') {
      live = lastPerBar(live, barStep(range).ms);
    }
    if (!live.length) { return history; }
    return [...history.filter((p) => p.at < live[0].at), ...live];
  });
  /** "Good Morning" / "Good Afternoon" / "Good Evening" by the Central clock. */
  readonly greeting = computed(() => {
    const hour = centralHour(this.currentTime());
    return hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  });
  /** First name from the investor profile, for the greeting; empty when it is not known. */
  readonly firstName = computed(() => this.profile()?.firstName?.trim() ?? '');
  /** The sentence under the Overview greeting: today's move and the held stock that moved most. */
  readonly daySummary = computed(() => {
    const held = this.positions();
    if (!this.portfolioLoaded() || !held.length) {
      return null;
    }
    const amount = this.dayGain();
    const moves = held.map((p) => ({ symbol: p.symbol, change: this.quotes().find((q) => q.symbol === p.symbol)?.change ?? 0 }));
    const best = moves.reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a));
    const money = Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    return {
      amount,
      moveText: amount === 0 ? 'flat' : `${amount > 0 ? 'up' : 'down'} ${money}`,
      moveArrow: amount > 0 ? '▲ ' : amount < 0 ? '▼ ' : '',
      symbol: best.change !== 0 ? best.symbol : '',
      change: best.change,
    };
  });
  /** Open or closed for the briefing's market-open repeat; null until the status first loads (PS-18). */
  readonly marketKnownOpen = computed(() => this.feed.status()?.open ?? null);
  readonly #switchScan = inject(SwitchScanService, { optional: true });
  /** Screen reader announcements (PS-21). */
  readonly announcer = liveAnnouncer();
  readonly #orderNews = new OrderAnnouncements(this.announcer);
  /** The last check's complaint about the quantity, shown under the field while it is the message (PS-21). */
  readonly #validationError = signal('');
  /** The quantity's error, linked to the field with aria-describedby; empty once anything changes. */
  readonly validationField = computed(() => {
    const error = this.#validationError();
    return /limit price/i.test(error) ? 'pro-limit' : /^Take profit/.test(error) ? 'pro-profit' : /^Stop loss/.test(error) ? 'pro-stop' : 'pro-quantity';
  });
  fieldError(id: string): string {
    const error = this.#validationError();
    return id === this.validationField() && this.message() === error && this.validate() === error ? error : '';
  }
  readonly quantityError = computed(() => this.fieldError('pro-quantity'));
  readonly ticketStatus = computed(() => (this.fieldError(this.validationField()) ? '' : this.message()));
  /** Last move of a symbol's price, so its number can flash green or red as it changes (look only). */
  tickOf(symbol: string): { key: string; dir: 'up' | 'down' | null } {
    const live = this.feed.quotes().find((q) => q.symbol === symbol);
    return { key: symbol + '-' + (live?.version ?? 0), dir: live?.direction ?? null };
  }
  /** Shown on the ticket before submitting while the market is closed (PS-02). */
  readonly closedWarning = computed(() => {
    const status = this.feed.status();
    if (this.orderType() === 'LIMIT' && status && !status.open) {
      return `The market is closed. It opens at ${localOpeningTime(status.nextOpen, this.currentTime())}. Your limit order waits for the limit price or better.`;
    }
    return closedMarketWarning(status, this.currentTime());
  });
  /** Corner messages when an order fills or is rejected (PS-15). */
  readonly toasts = inject(ToastService, { optional: true }) ?? new ToastService();
  declare readonly orderStatusClient: OrderStatusClient;
  readonly #stopFeed: () => void;
  readonly #stopFeedUpdates: () => void;
  readonly selected = signal<Quote>(NO_QUOTE);
  /** The ticket's price is older than the orders service accepts (TS-14.7 AC3). */
  readonly priceDelayed = computed(() => !!this.selected().price && isDelayed(this.selected().quotedAt, this.feed.now()));
  /** One-line review before confirming (PS-15), e.g. "Buy 10 AAPL · about $2,274.00 · fills at up to …". */
  readonly reviewSummary = computed(() => {
    const status = this.feed.status();
    return orderReviewSummary({
      side: this.side() === 'Sell' ? 'Sell' : 'Buy',
      quantity: Number(this.quantity()) || 0,
      symbol: this.selected().symbol,
      price: this.marketEntryPrice(),
      ...(this.orderType() === 'LIMIT' ? { limitPrice: this.entryPrice() } : {}),
      tolerancePercent: this.tolerance(),
      opensAt: status && !status.open ? localOpeningTime(status.nextOpen, this.currentTime()) : '',
    });
  });
  readonly results = computed(() =>
    this.quotes().filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  /** Use the latest computed matches even if Angular has not painted the result list yet. */
  submitSearch(event: KeyboardEvent): void {
    const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (event.key !== 'Enter' || event.isComposing || modified) {
      return;
    }
    event.preventDefault();
    if (event.repeat || !this.query().trim()) {
      return;
    }
    const quote = this.results()[0];
    if (quote) {
      this.choose(quote);
    }
  }
  readonly screened = computed(() =>
    this.quotes().filter((q) => {
      const filter = this.filter();
      if (filter === 'Gainers') {
        return q.change > 0;
      }
      if (filter === 'Decliners') {
        return q.change < 0;
      }
      return true;
    }),
  );
  /** Positions, cash and total value, loaded from the backend and reloaded after each fill. */
  readonly positions = signal<Position[]>([]);
  readonly buyingPower = signal(0);
  readonly portfolio = signal(0);
  /** False until the first balances arrive, so placeholders never show as real zeroes (PS-06). */
  readonly portfolioLoaded = signal(false);
  readonly allocationReady = signal(false);
  /** Unrealised gain across positions at the latest bids, in USD and as % of cost. */
  readonly totalReturn = signal(0);
  readonly totalReturnPercent = signal(0);
  /** Today's move across positions, from each stock's change since the day's first quote. */
  readonly dayGain = signal(0);
  readonly dayGainPercent = signal(0);
  /** Cash and stocks as shares of the total, for the summary and the exposure panel. */
  readonly allocationSeries = computed<readonly ChartSeries[]>(() => this.allocationReady() ? this.exposureCategories().map(c => ({
    id: 'allocation:' + c.label, label: c.label, unit: 'USD', status: 'ready', points: [{ time: this.feed.now(), value: c.value }],
  })) : []);
  readonly exposureCategories = computed(() => {
    const a = this.exposure();
    return [{ label: 'Equities', value: a.equities, percent: a.equitiesPercent }, { label: 'Cash', value: a.cash, percent: a.cashPercent }];
  });
  readonly exposureDescription = computed(() => !this.portfolioLoaded() ? 'Portfolio exposure. Balances have not loaded yet.' : !this.allocationReady() ? 'Portfolio exposure unavailable until all holdings have market quotes.' : categoryDescription('Portfolio exposure', this.exposureCategories(), false));
  readonly exposureTable = computed(() => this.portfolioLoaded() && this.allocationReady() ? categoryTable(this.exposureCategories(), false) : { columns: ['Asset', 'Value (USD)', 'Share'], rows: [], note: 'Balances have not loaded yet.' });
  readonly exposure = computed(() => {
    const a = allocation(this.positions().reduce((sum, p) => sum + p.value, 0), this.buyingPower());
    return { total: a.total, equities: a.stocksValue, cash: a.cashValue,
      equitiesPercent: a.stocksPercent, cashPercent: a.cashPercent };
  });
  /** "$100K" / "$1.2M": the total short enough to fit inside the exposure ring. */
  readonly exposureLabel = computed(() =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(this.exposure().total),
  );
  /** Average move today of the listed stocks in each sector, biggest gain first (PS-06). */
  readonly sectors = computed<SectorMove[]>(() => {
    const bySector = new Map<string, number[]>();
    for (const q of this.quotes()) {
      if (q.sector && q.price) {
        bySector.set(q.sector, [...(bySector.get(q.sector) ?? []), q.change]);
      }
    }
    const moves = [...bySector].map(([name, changes]) => ({
      name, change: Math.round((changes.reduce((sum, c) => sum + c, 0) / changes.length) * 100) / 100,
    }));
    const biggest = Math.max(0.01, ...moves.map((m) => Math.abs(m.change)));
    moves.sort((a, b) => b.change - a.change);
    return moves.map((m) => ({ ...m, width: (Math.abs(m.change) / biggest) * 100 }));
  });
  readonly sectorCategories = computed(() => this.sectors().map(s => ({ label: s.name, value: s.change })));
  readonly sectorDescription = computed(() => comparisonDescription('Sector performance today', this.sectorCategories()) + ' Each sector is the equally weighted average move of the stocks NextTrade lists in that sector.');
  readonly sectorTable = computed(() => ({ ...comparisonTable(this.sectorCategories()), note: 'Equally weighted averages of the listed stocks in each sector, not an index or the entire market.' }));
  readonly heatMapQuotes = computed(() => this.quotes().slice(0, 9));
  readonly heatCategories = computed(() => this.heatMapQuotes().map(q => ({ label: q.symbol, value: q.change })));
  readonly heatDescription = computed(() => comparisonDescription('Listed stock performance today', this.heatCategories()) + ' Select a stock to open its chart and trade ticket.');
  readonly heatTable = computed(() => comparisonTable(this.heatCategories()));
  /** The signed-in user's orders, newest first, loaded from the backend. */
  readonly orders = signal<Order[]>([]);
  readonly side = signal('Buy');
  readonly orderType = signal<'MARKET' | 'LIMIT'>('MARKET');
  readonly limitPrice = signal('');
  readonly takeProfitEnabled = signal(false);
  readonly stopLossEnabled = signal(false);
  readonly exitUnit = signal<'price' | 'percent'>('price');
  readonly takeProfit = signal('');
  readonly stopLoss = signal('');
  readonly ticketQuote = computed(() => {
    const q = this.feed.quotes().find(q => q.symbol === this.selected().symbol);
    if (!q) {
      return null;
    }
    const priced = Number.isFinite(q.bid) && Number.isFinite(q.ask) && q.bid > 0;
    if (!priced || q.ask < q.bid) {
      return null;
    }
    return { bid: q.bid, ask: q.ask, spread: q.ask - q.bid, spreadPercent: (q.ask - q.bid) / ((q.ask + q.bid) / 2) * 100 };
  });
  readonly marketEntryPrice = computed(() => {
    if (this.selected().price <= 0) {
      return 0;
    }
    const quote = this.ticketQuote();
    return quote ? (this.side() === 'Buy' ? quote.ask : quote.bid) : this.selected().price;
  });
  readonly entryPrice = computed(() => this.orderType() === 'LIMIT' ? Number(this.limitPrice()) : this.marketEntryPrice());
  readonly exitPrice = (kind: 'profit' | 'loss'): number => {
    const value = Number(kind === 'profit' ? this.takeProfit() : this.stopLoss());
    if (this.exitUnit() === 'price') {
      return value;
    }
    const direction = (this.side() === 'Buy' ? 1 : -1) * (kind === 'profit' ? 1 : -1);
    return Math.round(this.entryPrice() * (1 + direction * value / 100) * 100) / 100;
  };
  readonly reward = computed(() => Math.abs(this.exitPrice('profit') - this.entryPrice()) * Number(this.quantity()));
  readonly risk = computed(() => Math.abs(this.exitPrice('loss') - this.entryPrice()) * Number(this.quantity()));
  setOrderType(type: 'MARKET' | 'LIMIT'): void {
    this.orderType.set(type);
    if (type === 'LIMIT' && !this.limitPrice()) {
      this.limitPrice.set(this.marketEntryPrice() > 0 ? this.marketEntryPrice().toFixed(2) : '');
    }
    this.message.set('');
  }
  setExitUnit(unit: 'price' | 'percent'): void {
    if (unit === this.exitUnit()) {
      return;
    }
    const entry = this.entryPrice();
    for (const [kind, field] of [['profit', this.takeProfit], ['loss', this.stopLoss]] as const) {
      if (!field()) {
        continue;
      }
      const price = this.exitPrice(kind);
      field.set(unit === 'price' ? price.toFixed(2) : (entry > 0 ? Math.abs(price - entry) / entry * 100 : 0).toFixed(2));
    }
    this.exitUnit.set(unit);
  }
  sizeOrder(percent: number): void {
    const available = this.side() === 'Buy'
      ? Math.floor(this.buyingPower() / (this.entryPrice() * (this.orderType() === 'MARKET' ? 1 + this.tolerance() / 100 : 1)))
      : this.positions().find(p => p.symbol === this.selected().symbol)?.quantity ?? 0;
    this.quantity.set(String(Number.isFinite(available) ? Math.floor(available * percent / 100) : 0));
    this.message.set('');
  }
  readonly quantity = signal('1');
  readonly message = signal('');
  readonly modal = signal('review');
  /** Price protection (PS-12): the saved default and per-stock overrides. */
  readonly protection = inject(PriceProtectionStore, { optional: true }) ?? new PriceProtectionStore();
  /** A one-off percentage for the order being placed; null uses the saved setting for the stock. */
  readonly orderTolerance = signal<number | null>(null);
  readonly editingTolerance = signal(false);
  readonly tolerance = computed(() => this.orderTolerance() ?? this.protection.toleranceFor(this.selected().symbol));
  /** "Fills at up to $231.95 (2% above $227.40)" for the ticket's stock. */
  readonly protectionNote = computed(() => {
    const price = this.marketEntryPrice();
    return price > 0 ? protectionText(price, this.tolerance(), this.side() === 'Sell' ? 'Sell' : 'Buy') : '';
  });
  readonly listedSymbols = computed(() => this.quotes().map((q) => q.symbol));
  /** Sets price protection for this order only; an out-of-range value leaves it unchanged. */
  setOrderTolerance(value: unknown): void {
    const percent = validProtection(value);
    if (percent !== null) {
      this.orderTolerance.set(percent);
    }
  }
  /** Estimated cost at the live price; the orders service charges no fees. */
  readonly total = computed(() => Number(this.quantity()) * this.entryPrice());
  #portfolioRequest = 0;
  #orderRequest = 0;
  /** Order history rows, kept for the chart's trade markers (PS-13). */
  readonly historyRows = signal<OrderHistoryRow[]>([]);
  /** The client's fills of the charted stock, oldest first. */
  readonly tradeMarks = computed(() => tradeMarks(this.historyRows(), this.selected().symbol));
  /** Average cost of the charted stock while it is held; null otherwise. */
  readonly averageCost = computed(() => {
    const held = this.positions().find((p) => p.symbol === this.selected().symbol && p.quantity > 0);
    return held ? held.cost : null;
  });

  quote(symbol: string): Quote {
    return this.quotes().find((q) => q.symbol === symbol) ?? this.quotes()[0] ?? NO_QUOTE;
  }
  /** Shows another period of the portfolio-value chart. */
  setChartPeriod(period: ChartPeriod): void {
    this.chartPeriod.set(period);
    this.chartScrub.set(null);
    void this.loadChart();
  }
  /**
   * Rebuilds the portfolio-value chart for the chosen period from the account's real history
   * (deposits, fills and recorded prices), exactly as novice does. Re-reads every minute and after fills.
   */
  async loadChart(): Promise<void> {
    const request = ++this.#chartRequest;
    clearTimeout(this.#chartTimer);
    const account = this.selectedAccount();
    const period = this.chartPeriod();
    const filters = account ? { accountId: account.account_id } : {};
    const drawing = `${account?.account_id ?? ''}|${period}`;
    // "Loading" only for a first load, another period or another account; the minute refresh keeps the line.
    if (drawing !== this.#chartDrawnFor || !this.chartHistory().length) {
      this.chartLoading.set(true);
    }
    try {
      const [movements, orders] = await Promise.all([this.cashActivityClient.list(filters), this.orderHistoryClient.list(filters)]);
      if (request !== this.#chartRequest || this.destroyed) { return; }
      const now = Date.now();
      const { cash, shares: fills } = portfolioEvents(movements, orders);
      const range = chartRange(period, now, fundedAt(account?.created_at, cash));
      const prices = await this.#closes([...new Set(fills.map((f) => f.symbol))], range, now);
      if (request !== this.#chartRequest || this.destroyed) { return; }
      this.chartSpan.set(range);
      const complete = ledgerMatches(this.#portfolio, cash, fills);
      const points = complete ? portfolioSeries(range, cash, fills, prices) : [];
      this.chartHistory.set(points);
      this.#chartDrawnFor = drawing;
      this.chartNotice.set(!complete
        ? 'Historical transactions do not reconcile with current balances. Only values observed since this page opened are shown.'
        : !points.length || points[0].at > range.start
          ? 'Earlier valuations are unavailable because historical prices are missing. Only the supported portion is shown.'
          : 'Account value includes deposits and transfers.');
      this.chartError.set('');
    } catch {
      if (request === this.#chartRequest) {
        this.chartError.set('Your portfolio history could not be loaded right now. It will try again shortly.');
      }
    } finally {
      if (request === this.#chartRequest) {
        this.chartLoading.set(false);
        if (!this.destroyed) {
          this.#chartTimer = setTimeout(() => void this.loadChart(), CHART_REFRESH_MS);
        }
      }
    }
  }
  /** Historical bids for each held symbol over the chart's range, plus recent raw quotes. */
  async #closes(symbols: string[], range: ChartRange, now: number): Promise<Map<string, HistoryPricePoint[]>> {
    const { interval, limit } = barStep(range);
    const ids = new Map([
      ...this.instruments().map(i => [i.symbol, i.instrumentId] as const),
      ...this.feed.quotes().map(q => [q.symbol, q.instrumentId] as const),
    ]);
    const entries = await Promise.all(symbols.map(async symbol => {
      const id = ids.get(symbol);
      if (!id) { return [symbol, [] as HistoryPricePoint[]] as const; }
      const [bars, recent] = await Promise.allSettled([
        this.feed.client.closes(id, interval, limit, now, 'bid'),
        Promise.resolve().then(() => this.feed.client.history(id, 1000, 'bid')),
      ]);
      const points = [...(bars.status === 'fulfilled' ? bars.value : []), ...(recent.status === 'fulfilled' ? recent.value : [])];
      return [symbol, chartPoints(points, p => p.at, p => p.price).map(p => ({ at: p.time, price: p.value }))] as const;
    }));
    return new Map(entries);
  }
  /**
   * A holding's Trade button: load the stock on the chart and ticket, then bring the Buy/Sell
   * ticket into view and put focus on it, so the next step is right there.
   */
  tradeHolding(symbol: string): void {
    if (this.page() !== 'Overview') {
      // Another page: the Overview route builds a fresh dashboard. Leave this page as it is until
      // then (no flash of the Overview at the wrong scroll) and let the new one open at the ticket.
      pendingTicket = symbol;
      this.symbol.set(symbol);
      this.routing?.go('Overview');
      return;
    }
    this.choose(this.quote(symbol));
    setTimeout(() => this.#showTicket(true));
  }
  /** Brings the trade ticket under the sticky bars (gliding or instant) and puts focus on Buy/Sell. */
  #showTicket(glide: boolean): void {
    const ticket = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('app-advanced-dashboard .order-ticket');
    if (!ticket) { return; }
    scrollToTicket(ticket, glide);
    ticket.querySelector<HTMLElement>('.side-switch button.active, .side-switch button')?.focus({ preventScroll: true });
  }
  /** A ticker symbol was clicked: load it on the chart and ticket. */
  pickTicker(symbol: string): void {
    const quote = this.quotes().find((q) => q.symbol === symbol);
    if (quote) {
      this.choose(quote);
    }
  }
  /** A watchlist, mover or position row as voice mode says it: "Apple, 185 dollars, up 1.2 percent. Select to trade." (PS-22). */
  spokenRow(q: Pick<Quote, 'name' | 'symbol' | 'price' | 'change'>): string {
    return spokenQuote(spokenCompany(q.name, q.symbol), q.price, q.change);
  }
  choose(quote: Quote): void {
    if (quote.symbol !== this.selected().symbol) {
      this.limitPrice.set(quote.price > 0 ? quote.price.toFixed(2) : '');
      this.takeProfit.set(''); this.stopLoss.set('');
    }
    this.symbol.set(quote.symbol);
    this.orderTolerance.set(null);
    this.editingTolerance.set(false);
    this.setTicketQuote(quote);
    this.query.set('');
    this.message.set('');
    this.page.set('Overview');
    this.routing?.go('Overview');
  }
  private setTicketQuote(quote: Quote): void {
    this.selected.set(quote);
  }
  /**
   * Shows the feed's latest prices, re-values positions at the latest bids (PS-10: no separate
   * per-holding requests), and adds the charted stock's new price to its line.
   */
  #applyFeed(): void {
    const live = this.feed.quotes();
    if (live.length && !live.some((q) => q.price > 0)) {
      return;
    }
    this.quotes.set(
      live.map((q) => ({
        instrumentId: q.instrumentId, symbol: q.symbol, name: q.name, price: q.price,
        change: q.change, sector: q.sector, quotedAt: q.quotedAt,
      })),
    );
    for (const q of live) {
      if (q.bid > 0) {
        this.#bids.set(q.instrumentId, q.bid);
      }
      this.#dayChanges.set(q.instrumentId, q.change);
    }
    if (this.portfolioLoaded()) {
      this.#render();
    }
    const current = this.selected();
    const quote = this.quotes().find((q) => q.symbol === (current.symbol || this.symbol()));
    if (!quote) {
      return;
    }
    if (current.price) {
      this.selected.set(quote);
    } else {
      this.setTicketQuote(quote);
    }
  }
  /** A corner toast when a tracked order fills or is rejected, with the reason in plain words (PS-15). */
  async #announce(order: Order): Promise<void> {
    if (order.status === 'Filled') {
      const action = order.side === 'Sell' ? 'Sold' : 'Bought';
      this.message.set(`${action} ${order.quantity} ${order.symbol} at $${order.price?.toFixed(2)}. You can see it under Activity.`);
      this.toasts.show('filled', `Order filled: ${order.quantity} ${order.symbol} at $${order.price?.toFixed(2)}`, '', order.side === 'Sell' ? 'sell' : 'buy');
      this.#orderNews.say(order.id, 'filled', { ...order, fillPrice: order.price });
      return;
    }
    let reason = rejectionReason(null);
    try {
      reason = rejectionMessage(await this.orderStatusClient.status(order.id));
    } catch {
      // The generic reason still tells the client where to look.
    }
    this.message.set(`Your order was not filled. ${reason}`);
    this.toasts.show('rejected', `Order rejected: ${order.quantity} ${order.symbol}`, reason);
    this.#orderNews.say(order.id, 'rejected', { ...order, reason });
  }
  /** Opens the orders list from a toast. */
  viewOrders(): void {
    this.navigate('Activity');
  }
  /**
   * What the spoken briefing reads (PS-18): the summary panel's figures, today's move of each
   * position from the live feed, and this account's orders. A failed order load leaves orders out.
   */
  readonly briefingSource: BriefingSource = async () => {
    const accountId = this.selectedAccount()?.account_id;
    let orders: OrderHistoryRow[] = [];
    try {
      orders = await briefingOrders(this.orderHistoryClient.list({ accountId }));
    } catch {
      // The rest of the briefing is still worth hearing.
    }
    const now = new Date(this.feed.now());
    const live = new Map(this.feed.quotes().map((q) => [q.symbol, q]));
    const held = this.positions();
    return {
      accountId,
      now,
      market: this.feed.status(),
      balanceHidden: false,
      total: this.portfolio(),
      gain: this.totalReturn(),
      gainPercent: this.totalReturnPercent(),
      buyingPower: this.buyingPower(),
      holdings: held.map((p) => ({
        symbol: p.symbol,
        name: live.get(p.symbol)?.name ?? p.symbol,
        dayChangePercent: live.get(p.symbol)?.change ?? null,
      })),
      orders,
      pricesDelayed: held.some((p) => {
        const quote = live.get(p.symbol);
        return !!quote?.price && isDelayed(quote.quotedAt, now.getTime());
      }),
    };
  };
  navigate(page: string): void {
    this.page.set(page);
    this.routing?.go(page);
    if (page === 'Portfolio') {
      this.bottomTab.set('Holdings');
    }
  }
  openModal(kind: string): void {
    this.modal.set(kind);
    // Generate a new clientReference for this order intent, so retry uses the same one
    if (kind === 'review') {
      this.clientReference.set(OrderSubmissionClient.generateClientReference());
      this.submittedOrderId.set(null);
    }
    this.dialog()?.nativeElement.showModal();
  }
  closeModal(): void {
    this.dialog()?.nativeElement.close();
  }
  /** "?" opens Keyboard Shortcuts from anywhere, unless another dialog is already open (PS-17). */
  onShortcutKey(event: KeyboardEvent): void {
    if (isShortcutsKey(event) && !this.dialog()?.nativeElement.open) {
      event.preventDefault();
      this.openModal('shortcuts');
    }
  }
  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.closeModal();
    }
  }
  validate(): string {
    const count = Number(this.quantity()),
      price = this.selected().price;
    if (!Number.isSafeInteger(count) || count <= 0) {
      return 'Enter a whole number of shares greater than zero.';
    }
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(this.total())) {
      return NO_PRICE_ERROR;
    }
    if (this.orderType() === 'LIMIT' && (!Number.isFinite(this.entryPrice()) || this.entryPrice() <= 0)) {
      return 'Enter a limit price greater than zero.';
    }
    for (const [enabled, kind, label] of [[this.takeProfitEnabled(), 'profit', 'Take profit'], [this.stopLossEnabled(), 'loss', 'Stop loss']] as const) {
      if (!enabled) {
        continue;
      }
      const exit = this.exitPrice(kind);
      const raw = Number(kind === 'profit' ? this.takeProfit() : this.stopLoss());
      if (!Number.isFinite(exit) || exit <= 0 || !Number.isFinite(raw) || raw <= 0) {
        return `${label} must be greater than zero.`;
      }
      const above = (this.side() === 'Buy') === (kind === 'profit');
      if (above ? exit <= this.entryPrice() : exit >= this.entryPrice()) {
        return `${label} must be ${above ? 'above' : 'below'} the entry price.`;
      }
    }
    if (this.side() === 'Buy' && this.total() > this.buyingPower()) {
      return 'This order exceeds your buying power.';
    }
    if (
      this.side() === 'Sell' &&
      count > (this.positions().find((p) => p.symbol === this.selected().symbol)?.quantity || 0)
    ) {
      return 'You can only sell shares you hold.';
    }
    return '';
  }
  reviewOrder(): void {
    this.message.set(this.validate());
    this.#showInvalid(this.message());
    if (!this.message()) {
      this.openModal('review');
      // Screen readers hear the order once, then land on Confirm (PS-21).
      this.announcer.announce(speakable(this.reviewSummary()));
      this.#focusSoon('pro-confirm');
      // Says the order aloud before it can be confirmed (PS-23), cutting in on switch control.
      const quote = this.selected();
      this.#switchScan?.announce(orderReadBack({
        side: this.side() === 'Sell' ? 'Sell' : 'Buy',
        quantity: Number(this.quantity()),
        symbol: quote.symbol,
        name: quote.name,
        total: this.total(),
        closedWarning: this.closedWarning(),
        priceDelayed: this.priceDelayed(),
        ...(this.orderType() === 'LIMIT' ? { limitPrice: this.entryPrice() } : {}),
        ...(this.takeProfitEnabled() ? { takeProfit: this.exitPrice('profit') } : {}),
        ...(this.stopLossEnabled() ? { stopLoss: this.exitPrice('loss') } : {}),
      }), true);
    }
  }
  /**
   * A failed check (PS-21): a quantity problem is shown by the field, marked invalid, and focus
   * goes there, which reads the error as the field's description. Already on the field (Enter
   * pressed in it), or with no field to fix (no live price), the error is announced instead.
   */
  #showInvalid(error: string): void {
    const quantity = error && error !== NO_PRICE_ERROR ? error : '';
    this.#validationError.set(quantity);
    if (!error) {
      return;
    }
    const fieldId = this.validationField();
    const field = globalThis.document?.getElementById(fieldId);
    if (quantity && field && field !== globalThis.document.activeElement) {
      this.#focusSoon(fieldId);
    } else {
      this.announcer.announce(error, 'assertive');
    }
  }

  /**
   * Shows a ticket message and reads it to screen readers (PS-21): once when it changes, or every
   * time with `repeat` for the answer to a button press. Order steps are said by #orderNews instead,
   * so the ticket's own copy of them stays quiet.
   */
  #tell(text: string, repeat = false): void {
    if (repeat || text !== this.message()) {
      this.announcer.announce(text);
    }
    this.message.set(text);
  }

  /** Focuses an element by id once the page has drawn the change, unless switch control is steering focus. */
  #focusSoon(id: string): void {
    if (this.#switchScan?.settings().enabled) {
      return;
    }
    setTimeout(() => globalThis.document?.getElementById(id)?.focus(), 0);
  }

  async confirmOrder(): Promise<void> {
    const error = this.validate();
    const quote = this.selected();
    if (error) {
      this.message.set(error);
      this.closeModal();
      this.#showInvalid(error);
      return;
    }
    // Check data is loaded before submitting
    if (!this.dataReady()) {
      this.#tell('Loading accounts and instruments. Please wait.', true);
      return;
    }
    const instrument = this.instruments().find((item) => item.symbol === quote.symbol);
    if (!instrument) {
      this.#tell(`${quote.symbol} is not available to trade yet.`, true);
      return;
    }
    // Prevent double-click while submission is in flight
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      const count = Number(this.quantity());
      const account = this.selectedAccount();
      if (!account || !canTrade(account)) {
        this.#tell('No active account selected.', true);
        return;
      }
      // Some listed quotes have no backend instrument yet; the server would reject them.
      if (!this.instruments().some((i) => i.instrumentId === quote.instrumentId)) {
        this.#tell(`${quote.symbol} is not available to trade yet.`, true);
        return;
      }
      const response = await this.orderSubmissionClient.submit({
        accountId: account.account_id,
        instrumentId: instrument.instrumentId,
        side: this.side() === 'Buy' ? 'BUY' : 'SELL',
        quantity: count,
        orderType: this.orderType(),
        ...(this.orderType() === 'LIMIT' && { limitPrice: this.entryPrice() }),
        ...(this.takeProfitEnabled() && { takeProfitPrice: this.exitPrice('profit') }),
        ...(this.stopLossEnabled() && { stopLossPrice: this.exitPrice('loss') }),
        clientReference: this.clientReference(),
        bufferPercent: this.tolerance(),
      });
      this.orderTolerance.set(null);
      this.editingTolerance.set(false);
      // Store orderId for display
      this.submittedOrderId.set(response.orderId);
      this.#orderNews.say(response.orderId, 'sent', { side: this.side(), quantity: count, symbol: quote.symbol });
      // Plain words, as in novice: the order reference stays in Activity, not in the message.
      this.message.set('Order sent. Waiting for it to fill…');
      // Do NOT update local positions, buyingPower, or cash - let the backend and scheduler handle it
      // Close the modal after a brief delay so user sees the message
      setTimeout(() => this.closeModal(), 1500);
      void this.trackOrder(response.orderId);
    } catch (error) {
      const msg = error instanceof OrderSubmissionError ? error.userMessage : 'Submission failed. Please try again.';
      this.#tell(msg, true);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Reloads the client's orders from the backend; false when the load failed. Any order
   * that has filled since the last read also reloads balances, so cash and positions follow every
   * fill, including orders queued for the open (PS-10).
   */
  async refreshOrders(): Promise<boolean> {
    const request = ++this.#orderRequest;
    let rows: OrderHistoryRow[];
    try {
      rows = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
    } catch (error) {
      if (request !== this.#orderRequest || this.#destroyed) { return false; }
      this.#tell(error instanceof Error ? error.message : 'Could not load your orders.');
      return false;
    }
    if (request !== this.#orderRequest || this.#destroyed) { return false; }
    const fills = newlyFilled(this.#lastOrderRows, rows);
    this.#lastOrderRows = rows;
    this.orders.set(rows.map(toOrder));
    this.historyRows.set(rows);
    if (fills.length && this.#started && !this.#destroyed) {
      await this.refreshPortfolio();
      void this.loadChart();
    }
    return true;
  }
  /** Reloads cash and positions; prices come from the shared feed as they arrive. */
  async refreshPortfolio(): Promise<void> {
    const request = ++this.#portfolioRequest;
    const accountId = this.selectedAccount()?.account_id;
    if (accountId !== this.#portfolioAccountId) {
      this.#portfolioAccountId = accountId;
      this.portfolioLoaded.set(false);
    }
    try {
      const portfolio = await this.portfolioClient.load(accountId);
      if (this.destroyed || request !== this.#portfolioRequest || accountId !== this.selectedAccount()?.account_id) { return; }
      this.applyPortfolio(portfolio);
      this.serviceDown.set(false);
    } catch (error) {
      if (this.destroyed || request !== this.#portfolioRequest || accountId !== this.selectedAccount()?.account_id) { return; }
      this.serviceDown.set(true);
      this.#tell(error instanceof Error ? error.message : 'Could not load your balances.');
    }
  }
  /** Shows a loaded portfolio, valued at the latest bids already known. */
  applyPortfolio(portfolio: Portfolio): void {
    this.#portfolio = portfolio;
    this.#liveRecording = true;
    this.portfolioLoaded.set(true);
    this.#render();
  }
  #render(): void {
    const valuation = valuePortfolio(this.#portfolio, this.#bids, this.#dayChanges);
    this.allocationReady.set(hasMarketValuation(this.#portfolio, this.#bids));
    this.buyingPower.set(valuation.cash);
    this.portfolio.set(valuation.total);
    this.totalReturn.set(valuation.gain);
    this.totalReturnPercent.set(valuation.gainPercent);
    this.dayGain.set(valuation.dayGain);
    this.dayGainPercent.set(valuation.dayGainPercent);
    this.positions.set(
      valuation.holdings.map((h) => ({
        symbol: h.symbol,
        price: h.price,
        quantity: h.quantity,
        cost: h.averageCost,
        value: h.value,
        day: h.dayGain,
        total: h.gain,
        weight: valuation.total ? Math.round((h.value / valuation.total) * 1000) / 10 : 0,
      })),
    );
    if (this.#liveRecording && this.allocationReady()) {
      const at = Math.max(Date.now(), (this.chartLive().at(-1)?.at ?? 0) + 1);
      this.chartLive.update((points) => [...points.slice(-(LIVE_POINTS - 1)), { at, value: valuation.total }]);
    }
  }
  /**
   * Re-reads orders every few seconds until the submitted one is filled or rejected,
   * so its status moves from Submitted to Accepted to Filled without a page refresh.
   */
  async trackOrder(orderId: string, startedAt = Date.now()): Promise<void> {
    clearTimeout(this.#trackTimer);
    if (!(await this.refreshOrders())) {
      return;
    }
    const order = this.orders().find((o) => o.id === orderId);
    if (order && FINAL_ORDER_STATUSES.has(order.status.toUpperCase())) {
      // Reload balances first so a load error never replaces the fill message.
      if (order.status === 'Filled') {
        await this.refreshPortfolio();
      }
      await this.#announce(order);
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) {
      this.#tell('Your order is still being processed. Check Activity for its status.');
      return;
    }
    if (order?.status === 'Accepted') {
      this.#orderNews.say(order.id, 'accepted', order);
    }
    if (this.destroyed) { return; }
    this.#trackTimer = setTimeout(() => void this.trackOrder(orderId, startedAt), ORDER_TRACK_INTERVAL_MS);
  }

  private async pollOrdersUntilDestroyed(): Promise<void> {
    clearTimeout(this.#ordersPollTimer);
    await this.refreshOrders();
    // A refresh still in flight at destroy time must not re-arm the timer.
    if (this.#destroyed) {
      return;
    }
    this.#ordersPollTimer = setTimeout(() => {
      void this.pollOrdersUntilDestroyed();
    }, QUOTE_REFRESH_MS);
  }
  constructor(private readonly auth: AuthService) {
    this.routing = inject(PageState, { optional: true })?.connect(this.page, PAGE_PATHS, [
      { key: 'q', value: this.query }, { key: 'symbol', value: this.symbol }, { key: 'panel', value: this.bottomTab, allowed: this.bottomTabs }, { key: 'filter', value: this.filter, allowed: ['All stocks','Gainers','Decliners'] }, { key: 'marketTab', value: this.marketTab, allowed: ['Sectors','Top Movers'] }
    ], () => {
      // Until prices load there is nothing to check the linked symbol against; the feed selects it.
      if (!this.quotes().length) { return; }
      const quote = this.quote(this.symbol());
      if (this.selected() !== quote) { this.setTicketQuote(quote); }
      if (quote.symbol !== this.symbol()) { this.#tell('That symbol is unavailable.'); }
    });
    Object.assign(this, tradingClients(this.auth, inject(ApiHttpClient)));
    // Opened from a holding's Trade button on another page: start at the ticket, with no jump.
    if (pendingTicket) {
      afterNextRender(() => {
        if (!pendingTicket) { return; }
        pendingTicket = null;
        // The route's accessibility step focuses the page heading just after render, and the
        // summary above the ticket fills in as data arrives: place the ticket after the first,
        // then hold it in place while the page settles (unless the user scrolls meanwhile).
        // Hold it while the page fills in: re-place whenever the layout above it changes, for
        // a short while, and stop as soon as the user scrolls, clicks or types.
        const grid = document.querySelector<HTMLElement>('app-advanced-dashboard .pro-grid');
        let done = false;
        const stop = () => {
          done = true; observer?.disconnect();
          for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) { document.removeEventListener(type, stop, true); }
        };
        const observer = typeof ResizeObserver === 'function' && grid ? new ResizeObserver(() => { if (!done && !this.destroyed) { this.#showTicket(false); } }) : null;
        observer?.observe(grid!);
        for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) { document.addEventListener(type, stop, { capture: true, passive: true }); }
        for (const ms of [40, 200, 400, 700, 1100, 1600]) { setTimeout(() => { if (!done && !this.destroyed) { this.#showTicket(false); } }, ms); }
        setTimeout(stop, 2000);
      });
    }
    this.#stopAccountWatch = this.accountState.onChange(() => this.#accountChanged());
    this.#stopFeedUpdates = this.feed.onUpdate(() => this.#applyFeed());
    this.#stopFeed = this.feed.start();
    this.#applyFeed();
  }

  ngOnDestroy(): void {
    this.#destroyed = true;
    this.#stopAccountWatch();
    this.#stopFeedUpdates();
    this.#stopFeed();
    this.destroyed = true;
    this.routing?.destroy();
    clearTimeout(this.#trackTimer);
    clearTimeout(this.#ordersPollTimer);
    clearTimeout(this.#chartTimer);
    if (this.#clockTimer) { clearInterval(this.#clockTimer); }
  }

  ngOnInit(): void {
    this.#clockTimer = setInterval(() => this.currentTime.set(new Date()), 1000);
    void this.#start();
  }

  /** Accounts first, so the first balances and orders shown are already the selected account's. */
  async #start(): Promise<void> {
    await this.loadTradingData();
    this.#started = true;
    void this.pollOrdersUntilDestroyed();
    await this.refreshPortfolio();
    void this.loadChart();
  }

  /** Another account was picked, or cash moved between accounts: show its balances, positions and orders. */
  #accountChanged(): void {
    if (!this.#started || this.#destroyed) { return; }
    this.message.set('');
    this.#lastOrderRows = null;
    this.portfolioLoaded.set(false);
    this.allocationReady.set(false);
    this.historyRows.set([]);
    this.orders.set([]);
    this.positions.set([]);
    this.#liveRecording = false;
    this.chartLive.set([]);
    this.chartHistory.set([]);
    this.chartScrub.set(null);
    const request = ++this.#chartRequest;
    clearTimeout(this.#chartTimer);
    this.chartLoading.set(true);
    void this.refreshPortfolio().then(() => {
      if (!this.destroyed && request === this.#chartRequest) { void this.loadChart(); }
    });
    void this.refreshOrders();
  }

  async loadTradingData(): Promise<void> {
    try {
      this.loadingAccounts.set(true);
      this.accountState.use(await this.orderSubmissionClient.getAccounts());
    } catch (error) {
      console.error('Failed to load accounts:', error);
      this.#tell('Failed to load accounts.');
    } finally {
      this.loadingAccounts.set(false);
    }

    try {
      this.loadingInstruments.set(true);
      const instrumentsData = await this.orderSubmissionClient.getInstruments();
      this.instruments.set(instrumentsData);
    } catch (error) {
      console.error('Failed to load instruments:', error);
      this.#tell('Failed to load instruments.');
    } finally {
      this.loadingInstruments.set(false);
    }
  }
}

/** Maps a backend order-history row onto a dashboard row ("FILLED" → "Filled", "BUY" → "Buy"). */
function toOrder(row: OrderHistoryRow): Order {
  return {
    id: row.orderId,
    time: centralClock(new Date(row.submittedAt)),
    symbol: row.symbol,
    side: titleCase(row.side),
    quantity: row.quantity,
    price: row.fillPrice,
    status: titleCase(row.status),
    type: row.exitParentId ? 'Automatic exit' : titleCase(row.orderType ?? 'MARKET'),
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** A holding's symbol whose Trade button was pressed on another page; the next Overview opens at the ticket. */
let pendingTicket: string | null = null;
/** Clearance for the sticky top bar and price strip above the ticket. */
const TICKET_OFFSET = 128;
/** Scrolls the page so the trade ticket sits just under the sticky bars: a short ease-out glide, or an instant move. */
function scrollToTicket(ticket: HTMLElement, glide: boolean): void {
  let box: HTMLElement | null = ticket.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(box).overflowY))) { box = box.parentElement; }
  const scroller = box ?? (document.scrollingElement as HTMLElement);
  const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
  const from = scroller.scrollTop;
  const to = Math.max(0, from + ticket.getBoundingClientRect().top - top - TICKET_OFFSET);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!glide || reduce || Math.abs(to - from) < 2) { scroller.scrollTop = to; return; }
  const start = performance.now();
  const duration = 320;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    scroller.scrollTop = from + (to - from) * (1 - Math.pow(1 - t, 3));
    if (t < 1) { requestAnimationFrame(step); }
  };
  requestAnimationFrame(step);
  // If animation frames are held back (a background or throttled tab), still finish the move.
  setTimeout(() => { if (Math.abs(scroller.scrollTop - to) > 2) { scroller.scrollTop = to; } }, duration + 120);
}
