import { ChartAccess, ChartFocus } from './chart-access';
import { categoryDescription, categoryTable } from '../../../shared/chart-description';
import { FinancialChange } from './financial-change';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
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
  hasOpenOrders,
  newlyFilled,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { interval, Subject, startWith, takeUntil } from 'rxjs';
import { closedMarketWarning, localOpeningTime, marketStatusLabel, marketStatusText } from './market-status-api';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { ToastService, Toasts } from './toasts';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { MarketTicker } from './market-ticker';
import { tradingClients } from './trading-clients';
import type { UserProfile } from './auth-api';
import { CashActivityClient, formatMoney } from './activity-api';
import { PortfolioChart } from './portfolio-chart';
import {
  CHART_PERIODS, CashEvent, ChartPeriod, ChartRange, PricePoint, ValuePoint, barStep, chartRange, portfolioSeries, startValue, tradingSession,
} from './portfolio-history';
import { centralDay, centralTime } from './app-time';
import { AccessibilitySettings } from './accessibility-settings';
import { KeyboardShortcuts, isShortcutsKey } from './keyboard-shortcuts';
import { BriefingButton, BriefingSource } from './briefing-button';
import { chartSummary } from './chart-speech';
import { spokenCompany } from './briefing';
import { SwitchScanService } from './switch-scan';

/** How often the portfolio-value chart re-reads its history. */
export const CHART_REFRESH_MS = 60000;
/** Live values kept for the chart: a day of five-second updates. */
const LIVE_POINTS = 17280;
const PERIOD_LABELS: Record<ChartPeriod, string> = {
  '1D': 'Today', '1W': 'Past week', '1M': 'Past month', '3M': 'Past 3 months', '1Y': 'Past year', ALL: 'Since opening',
};

/**
 * When the account first held money: its first deposit, transfer or fill. Before that it was
 * worth nothing, so the chart starts there; with no activity yet, the account's opening time.
 */
export function fundedAt(createdAt: string | undefined, cash: readonly CashEvent[]): number | null {
  const first = cash.reduce((earliest, e) => Math.min(earliest, e.at), Number.POSITIVE_INFINITY);
  if (Number.isFinite(first)) {
    return first;
  }
  const opened = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(opened) ? opened : null;
}

/** The last of the values in each bar of `width` ms, in time order. */
export function lastPerBar(points: readonly ValuePoint[], width: number): ValuePoint[] {
  return points.filter((p, i) => i === points.length - 1 || Math.floor(points[i + 1].at / width) !== Math.floor(p.at / width));
}

/** Company logos the template knows how to draw. */
const LOGOS: Record<string, string> = { AAPL: 'apple', MSFT: 'microsoft', NVDA: 'nvidia' };

interface Holding {
  symbol: string;
  name: string;
  value: number;
  shares: number;
  average: number;
  today: number;
  change: number;
  total: number;
  totalPercent: number;
  logo: string;
}
interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  quotedAt: string;
}
/** Shown in the ticket until the first stock list arrives. */
const NO_QUOTE: Quote = { symbol: '', name: '', price: 0, change: 0, quotedAt: '' };

@Component({
  selector: 'app-novice-dashboard',
  imports: [
    FinancialChange,
    CurrencyPipe, DatePipe, DecimalPipe, DashboardIcon, ActivityFeed, AccountSwitcher, MarketTicker, Toasts, PriceProtectionSettings, PortfolioChart,
    AccessibilitySettings, KeyboardShortcuts, BriefingButton, ChartAccess, ChartFocus,
  ],
  templateUrl: './novice-dashboard.html',


  styleUrls: ['./novice-dashboard.scss', './novice-dashboard.refresh.scss', './novice-settings.scss', './novice-allocation.scss'],
})
export class NoviceDashboard implements OnInit, OnDestroy {
  // The four API clients are assigned from tradingClients() in the constructor.
  declare readonly orderSubmissionClient: OrderSubmissionClient;
  declare readonly orderHistoryClient: OrderHistoryClient;
  declare readonly portfolioClient: PortfolioClient;
  /** Live prices for every listed stock and the market's open/closed status, shared by all views (TS-14.7). */
  readonly feed = inject(MarketFeed, { optional: true }) ?? new MarketFeed();
  /** NYSE open/closed from the orders service (NEXT-212), counted down against the local clock. */
  readonly marketStatus = computed(() => this.feed.status());
  readonly marketClock = signal(new Date());
  readonly marketText = computed(() => marketStatusText(this.marketStatus(), this.marketClock()));
  /** The same text with Open/Closed spelled out once, for the dot beside it (PS-28). */
  readonly marketStatusLine = computed(() => marketStatusLabel(this.marketStatus(), this.marketClock()));
  readonly marketOpen = computed(() => this.marketStatus()?.open ?? false);
  readonly marketClosingSoon = computed(() => this.marketOpen() && !!this.marketStatus()?.nextClose);
  /** Open or closed for the briefing's market-open repeat; null until the status first loads (PS-18). */
  readonly marketKnownOpen = computed(() => this.marketStatus()?.open ?? null);
  /** Shown on the ticket before submitting while the market is closed (PS-02). */
  readonly closedWarning = computed(() => closedMarketWarning(this.marketStatus(), this.marketClock()));
  /** The ticket's price is older than the orders service accepts (TS-14.7 AC3). */
  readonly tradePriceDelayed = computed(() => !!this.tradeQuote().price && isDelayed(this.tradeQuote().quotedAt, this.feed.now()));
  readonly #stopFeed: () => void;
  /** Corner messages when an order fills or is rejected (PS-15). */
  readonly toasts = inject(ToastService, { optional: true }) ?? new ToastService();
  declare readonly orderStatusClient: OrderStatusClient;
  declare readonly cashActivityClient: CashActivityClient;
  /** One-line review shown before confirming (PS-15), e.g. "Buy 10 AAPL · about $2,274.00 · fills at up to …". */
  readonly reviewSummary = computed(() => {
    const status = this.marketStatus();
    return orderReviewSummary({
      side: this.side() === 'Sell' ? 'Sell' : 'Buy',
      quantity: Number(this.quantity()) || 0,
      symbol: this.tradeQuote().symbol,
      price: this.tradeQuote().price,
      tolerancePercent: this.tolerance(),
      opensAt: status && !status.open ? localOpeningTime(status.nextOpen, this.marketClock()) : '',
    });
  });
  readonly #stopFeedUpdates: () => void;
  #trackTimer: ReturnType<typeof setTimeout> | undefined;
  #ordersTimer: ReturnType<typeof setTimeout> | undefined;
  #chartTimer: ReturnType<typeof setTimeout> | undefined;
  /** Increments per chart load, so a slow earlier load never replaces a newer one. */
  #chartRequest = 0;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  /** Live values are added to the chart only once the shown account's balances have loaded. */
  #liveRecording = false;
  /** Latest bid and today's % change per instrument, both from the shared feed (PS-10). */
  readonly #bids = new Map<string, number>();
  readonly #dayChanges = new Map<string, number>();
  /** The previous order read, so a fill seen by polling reloads balances (PS-10). */
  #lastOrderRows: OrderHistoryRow[] | null = null;
  private readonly destroy$ = new Subject<void>();
  private routing?: PageBinding;
  private destroyed = false;
  readonly symbol = signal('AAPL');
  readonly name = input('');
  readonly profile = input<UserProfile | null>(null);
  readonly profileLoading = input(false);
  readonly profileError = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('NOVICE');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly activeTab = signal('Overview');
  readonly navigation = [
    { label: 'Overview', icon: 'home' },
    { label: 'Portfolio', icon: 'chart' },
    { label: 'Activity', icon: 'orders' },
    { label: 'Settings', icon: 'settings' },
  ];
  /** Balances could not be read: the service is down or unreachable (PS-11). */
  readonly serviceDown = signal(false);
  readonly query = signal('');
  readonly showBalance = signal(true);
  /** "Good morning" / "Good afternoon" / "Good evening" by the client's own clock (PS-06). */
  readonly greeting = computed(() => {
    const hour = this.marketClock().getHours();
    if (hour < 12) {
      return 'Good morning';
    }
    return hour < 18 ? 'Good afternoon' : 'Good evening';
  });
  /** First name from the investor profile, for the greeting; empty when it is not known. */
  readonly firstName = computed(() => this.profile()?.firstName?.trim() ?? '');
  /**
   * The sentence under the Overview greeting, from the live numbers: today's move and the held
   * stock that moved most (no stock when none moved). Null until holdings load.
   */
  readonly daySummary = computed(() => {
    const held = this.holdings();
    if (!this.portfolioLoaded() || !held.length) {
      return null;
    }
    const amount = this.todayReturn();
    const best = held.reduce((a, b) => (Math.abs(b.change) > Math.abs(a.change) ? b : a));
    const money = Math.abs(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    return {
      amount,
      moveText: amount === 0 ? 'flat' : `${amount > 0 ? 'up' : 'down'} ${money}`,
      /** Decorative cue beside the wording, so the sentence still reads as prose (PS-28). */
      moveArrow: amount > 0 ? '▲ ' : amount < 0 ? '▼ ' : '',
      symbol: best.change !== 0 ? best.symbol : '',
      change: best.change,
      changeText: `${best.change > 0 ? '+' : ''}${best.change.toFixed(2)}%`,
    };
  });
  readonly investmentTab = signal('Holdings');
  readonly notifications = signal(false);
  /** Balances and holdings, loaded from the backend and reloaded after each fill. */
  readonly portfolioValue = signal(0);
  readonly buyingPower = signal(0);
  readonly invested = signal(0);
  readonly holdings = signal<Holding[]>([]);
  /** False until the first balances arrive, so placeholders never show as real zeroes (PS-06). */
  readonly portfolioLoaded = signal(false);
  /** Today's move across holdings, from each stock's change since the day's first quote. */
  readonly todayReturn = signal(0);
  readonly todayReturnPercent = signal(0);
  /** The portfolio-value chart: its period, the span it covers and the value at each moment. */
  readonly chartPeriod = signal<ChartPeriod>('1D');
  readonly chartSpan = signal<ChartRange | null>(null);
  readonly chartHistory = signal<ValuePoint[]>([]);
  readonly chartLoading = signal(false);
  readonly chartError = signal('');
  /** A stock as it is said aloud: "Google", not "GOOGL" (shown as the symbol and full name). */
  readonly spokenStock = spokenCompany;
  /** The last chart summary said aloud, for screen readers (a polite live region). */
  readonly chartAnnouncement = signal('');
  readonly #switchScan = inject(SwitchScanService, { optional: true });
  /** The chart point under the cursor; the value above the chart follows it while it is set. */
  readonly chartScrub = signal<ValuePoint | null>(null);
  /** The big number: the scrubbed point's value, otherwise the live total. */
  readonly headerValue = computed(() => this.chartScrub()?.value ?? this.portfolioValue());
  /**
   * The line under the big number: how much the value moved over the chosen period (or up to the
   * scrubbed point), as brokerage apps show it. Before the chart loads, today's move.
   */
  readonly headerChange = computed(() => {
    const points = this.chartPoints();
    if (points.length < 2) {
      return { amount: this.todayReturn(), percent: this.todayReturnPercent(), label: 'Today' };
    }
    // Measured from when the account first held money, not from the $0 before it existed.
    const start = startValue(points);
    const scrub = this.chartScrub();
    const amount = Math.round(((scrub ?? points.at(-1)!).value - start) * 100) / 100;
    const span = this.chartSpan();
    let label = span?.fromOpening ? 'Since opening' : PERIOD_LABELS[this.chartPeriod()];
    if (span?.session && centralDay(span.session.open) !== centralDay(this.marketClock())) {
      // Before today's open: the last session's move, named by its day.
      label = centralTime(span.session.open, { weekday: 'long' });
    }
    if (scrub) {
      label = `${centralTime(scrub.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`;
    }
    return { amount, percent: start > 0 ? (amount / start) * 100 : 0, label };
  });
  /** "+$1.30 (+0.01%)" / "−$0.90 (−0.00%)". */
  readonly headerChangeText = computed(() => {
    const { amount, percent } = this.headerChange();
    let sign: string;
    if (amount > 0) {
      sign = '+';
    } else if (amount < 0) {
      sign = '−';
    } else {
      sign = '';
    }
    return `${formatMoney(amount, true)} (${sign}${Math.abs(percent).toFixed(2)}%)`;
  });
  /**
   * Live prices have stopped reaching the chart: the service is unreachable, or a held stock's
   * latest quote is older than the orders service accepts.
   */
  readonly chartDelayed = computed(() => {
    if (this.serviceDown()) {
      return true;
    }
    const held = new Set(this.holdings().map((h) => h.symbol));
    const now = this.feed.now();
    return this.feed.quotes().some((q) => held.has(q.symbol) && isDelayed(q.quotedAt, now));
  });
  /** Stocks' share of the total, unrounded, for the allocation ring. */
  readonly stocksShare = computed(() => {
    const { total, stocksValue } = this.assetAllocation();
    return total > 0 ? Math.min(100, Math.max(0, (stocksValue / total) * 100)) : 0;
  });
  /**
   * The value at every live update since the page opened (one per price update, about every five
   * seconds), so each rise and dip stays on the line instead of only its end moving.
   */
  readonly chartLive = signal<ValuePoint[]>([]);
  /**
   * The line: the recorded history up to the first live value, then every live value after it,
   * ending at the value shown above the chart so the two always agree.
   */
  readonly chartPoints = computed(() => {
    const history = this.chartHistory();
    if (history.length < 2 || !this.portfolioLoaded()) {
      return history;
    }
    const range = this.chartSpan();
    const session = range?.session;
    // Quotes keep arriving outside order-execution hours. Keep their actual times instead of
    // moving the closing point's price while its timestamp (and the viewport) stays frozen.
    let live = this.chartLive().filter((p) => p.at >= history[0].at);
    if (range && !session) {
      // Longer periods space points evenly, so live values are kept one per price bar, as the history is.
      live = lastPerBar(live, barStep(range).ms);
    }
    if (!live.length) {
      return history;
    }
    return [...history.filter((p) => p.at < live[0].at), ...live];
  });
  /** Every tradable stock from the backend, at its live price (TS-14.7 AC1). */
  readonly quotes = signal<Quote[]>([]);
  readonly watched = signal(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']);
  readonly watchlist = computed(() => this.quotes().filter((q) => this.watched().includes(q.symbol)));
  readonly results = computed(() =>
    this.quotes().filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly modal = signal('trade');
  readonly tradeQuote = signal<Quote>(NO_QUOTE);
  readonly side = signal('Buy');
  readonly quantity = signal('');
  readonly reviewing = signal(false);
  readonly tradeMessage = signal('');
  readonly submitting = signal(false);
  /** Idempotency key for the order being reviewed; a retried confirm reuses it. */
  readonly clientReference = signal('');
  /** The client's accounts; the header picker chooses which one this dashboard shows and trades from (PS-05). */
  readonly accountState = inject(AccountsService, { optional: true }) ?? new AccountsService();
  readonly selectedAccount = computed(() => this.accountState.selected());
  readonly #stopAccountWatch: () => void;
  #started = false;
  readonly instruments = signal<Instrument[]>([]);
  readonly tradeTotal = computed(() => Number(this.quantity()) * this.tradeQuote().price);
  /** Price protection (PS-12): the saved default and per-stock overrides. */
  readonly protection = inject(PriceProtectionStore, { optional: true }) ?? new PriceProtectionStore();
  /** A one-off percentage for the order being placed; null uses the saved setting for the stock. */
  readonly orderTolerance = signal<number | null>(null);
  readonly editingTolerance = signal(false);
  readonly tolerance = computed(() => this.orderTolerance() ?? this.protection.toleranceFor(this.tradeQuote().symbol));
  /** "Fills at up to $231.95 (2% above $227.40)" for the open ticket. */
  readonly protectionNote = computed(() => {
    const { price } = this.tradeQuote();
    return price > 0 ? protectionText(price, this.tolerance(), this.side() === 'Sell' ? 'Sell' : 'Buy') : '';
  });
  readonly listedSymbols = computed(() => this.quotes().map((q) => q.symbol));
  readonly totalReturn = computed(() => this.holdings().reduce((sum, h) => sum + h.total, 0));
  /** Total gain as a share of what the holdings cost. */
  readonly totalReturnPercent = computed(() => {
    const cost = this.invested() - this.totalReturn();
    return cost > 0 ? (this.totalReturn() / cost) * 100 : 0;
  });
  /** A plain description of how spread out the holdings are, from their real weights (PS-06). */
  readonly diversification = computed(() => {
    const holdings = this.holdings();
    const stocks = holdings.reduce((sum, h) => sum + h.value, 0);
    if (!holdings.length || stocks <= 0) {
      return { title: 'No investments yet', detail: 'Buy a stock to start building your portfolio.' };
    }
    const largest = Math.max(...holdings.map((h) => h.value)) / stocks;
    if (holdings.length === 1) {
      return { title: 'All in one company', detail: `Every invested dollar is in ${holdings[0].symbol}. Owning a few companies spreads the risk.` };
    }
    if (largest > 0.5) {
      return { title: 'Concentrated', detail: `${Math.round(largest * 100)}% of your stocks are in one company.` };
    }
    return { title: 'Spread across companies', detail: `${holdings.length} companies, none above ${Math.round(largest * 100)}% of your stocks.` };
  });
  readonly allocationCategories = computed(() => {
    const a = this.assetAllocation();
    return [{ label: 'Stocks', value: a.stocksValue, percent: a.stocksPercent }, { label: 'Cash', value: a.cashValue, percent: a.cashPercent }];
  });
  readonly allocationDescription = computed(() => !this.portfolioLoaded() ? 'Asset allocation. Balances have not loaded yet.' : categoryDescription('Asset allocation', this.allocationCategories(), !this.showBalance()));
  readonly allocationTable = computed(() => this.portfolioLoaded() ? categoryTable(this.allocationCategories(), !this.showBalance()) : { columns: ['Asset', 'Value (USD)', 'Share'], rows: [], note: 'Balances have not loaded yet.' });
  readonly assetAllocation = computed(() => {
    const stocksValue = this.holdings().reduce((sum, h) => sum + h.value, 0);
    const cashValue = this.buyingPower();
    const total = stocksValue + cashValue;
    if (total <= 0) {
      return { total: 0, stocksValue: 0, stocksPercent: 0, cashValue: 0, cashPercent: 100 };
    }
    return {
      total,
      stocksValue,
      stocksPercent: Math.round((stocksValue / total) * 100),
      cashValue,
      cashPercent: Math.round((cashValue / total) * 100),
    };
  });
  navigate(tab: string): void {
    this.activeTab.set(tab);
    this.routing?.go(tab);
    this.notifications.set(false);
  }
  openModal(kind: string): void {
    this.modal.set(kind);
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
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) {
      this.closeModal();
    }
  }
  /** Stocks the trade dialog offers: those the backend can trade, or every quote until instruments load. */
  readonly tradableQuotes = computed(() => {
    const symbols = new Set(this.instruments().map((i) => i.symbol));
    return symbols.size ? this.quotes().filter((q) => symbols.has(q.symbol)) : this.quotes();
  });
  /**
   * Opens the trade dialog. Without a symbol, a sell starts on the first stock the user holds
   * and a buy on the first tradable stock; the dialog's picker can change it.
   */
  openTrade(side = 'Buy', symbol?: string): void {
    const start = this.resolveTradeStartSymbol(side, symbol);
    this.tradeQuote.set(this.quotes().find((q) => q.symbol === start) ?? this.quotes()[0] ?? NO_QUOTE);
    this.symbol.set(this.tradeQuote().symbol);
    this.side.set(side);
    this.quantity.set('');
    this.reviewing.set(false);
    this.tradeMessage.set('');
    this.query.set('');
    this.orderTolerance.set(null);
    this.editingTolerance.set(false);
    this.openModal('trade');
  }

  /** Sets price protection for this order only; an out-of-range value leaves it unchanged. */
  setOrderTolerance(value: unknown): void {
    const percent = validProtection(value);
    if (percent !== null) {
      this.orderTolerance.set(percent);
      this.reviewing.set(false);
    }
  }

  private resolveTradeStartSymbol(side: string, symbol?: string): string | undefined {
    if (symbol) {
      return symbol;
    }
    if (side === 'Sell') {
      return this.holdings()[0]?.symbol;
    }
    return this.tradableQuotes()[0]?.symbol;
  }
  /** Switches the open trade to another stock and drops any review of the previous one. */
  chooseTradeSymbol(symbol: string): void {
    const quote = this.quotes().find((q) => q.symbol === symbol);
    if (!quote) {
      return;
    }
    this.tradeQuote.set(quote);
    this.reviewing.set(false);
    this.tradeMessage.set('');
  }
  toggleWatch(): void {
    const symbol = this.tradeQuote().symbol;
    this.watched.update((list) =>
      list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol],
    );
  }
  private tradeError(): string {
    const count = Number(this.quantity());
    const held = this.holdings().find((h) => h.symbol === this.tradeQuote().symbol)?.shares || 0;
    if (!Number.isSafeInteger(count) || count < 1) {
      return 'Enter a whole number of shares greater than zero.';
    }
    if (this.side() === 'Buy' && this.tradeTotal() > this.buyingPower()) {
      return 'This order exceeds your buying power.';
    }
    if (this.side() === 'Sell' && count > held) {
      return 'You can only sell shares you hold.';
    }
    return '';
  }
  reviewTrade(): void {
    const error = this.tradeError();
    const startingReview = !this.reviewing();

    this.tradeMessage.set(error);
    this.reviewing.set(!error);
    if (!error && startingReview) {
      this.clientReference.set(OrderSubmissionClient.generateClientReference());
    }
  }
  /**
   * Sends the reviewed order to the backend. Holdings and buying power are not changed
   * here: the backend fills the order, and its progress is shown until it settles.
   */
  async confirmTrade(): Promise<void> {
    this.reviewTrade();
    if (!this.reviewing() || this.submitting()) {
      return;
    }
    const quote = this.tradeQuote();
    const account = this.selectedAccount();
    const instrument = this.instruments().find((i) => i.symbol === quote.symbol);
    if (!account) {
      this.tradeMessage.set('We could not find an active trading account for you.');
      return;
    }
    if (!canTrade(account)) {
      this.tradeMessage.set('This account is not open for trading yet. Switch accounts at the top of the page.');
      return;
    }
    if (!instrument) {
      this.tradeMessage.set(`${quote.symbol} is not available to trade yet.`);
      return;
    }
    this.submitting.set(true);
    try {
      const response = await this.orderSubmissionClient.submit({
        accountId: account.account_id,
        instrumentId: instrument.instrumentId,
        side: this.side() === 'Buy' ? 'BUY' : 'SELL',
        quantity: Number(this.quantity()),
        orderType: 'MARKET',
        clientReference: this.clientReference(),
        bufferPercent: this.tolerance(),
      });
      this.reviewing.set(false);
      this.orderTolerance.set(null);
      this.editingTolerance.set(false);
      this.quantity.set('');
      this.tradeMessage.set('Order sent. Waiting for it to fill…');
      void this.trackOrder(response.orderId);
      this.#scheduleOrderWatch();
    } catch (error) {
      this.tradeMessage.set(
        error instanceof OrderSubmissionError ? error.userMessage : 'Your order could not be sent. Please try again.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /** Re-reads the order every few seconds and describes its progress until it fills or is rejected. */
  async trackOrder(orderId: string, startedAt = Date.now()): Promise<void> {
    clearTimeout(this.#trackTimer);
    let row;
    try {
      row = (await this.orderHistoryClient.list()).find((r) => r.orderId === orderId);
    } catch (error) {
      this.tradeMessage.set(error instanceof Error ? error.message : 'Could not check your order.');
      return;
    }
    if (row && FINAL_ORDER_STATUSES.has(row.status)) {
      if (row.status === 'FILLED') {
        await this.refreshPortfolio();
      }
      if (row.status === 'FILLED') {
        const action = row.side === 'SELL' ? 'Sold' : 'Bought';
        const shares = row.filledQuantity ?? row.quantity;
        this.tradeMessage.set(`${action} ${shares} ${row.symbol} at $${row.fillPrice?.toFixed(2)}. You can see it under Activity.`);
        this.toasts.show('filled', `Order filled: ${shares} ${row.symbol} at $${row.fillPrice?.toFixed(2)}`);
        return;
      }
      const reason = await this.#rejectionReason(orderId);
      this.tradeMessage.set(`Your order was not filled. ${reason}`);
      this.toasts.show('rejected', `Order rejected: ${row.quantity} ${row.symbol}`, reason);
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) {
      this.tradeMessage.set('Your order is still being processed. Check Activity for its status.');
      return;
    }
    if (row?.status === 'ACCEPTED') {
      this.tradeMessage.set('Order accepted. Waiting for it to fill…');
    }
    if (this.destroyed) { return; }
    this.#trackTimer = setTimeout(() => void this.trackOrder(orderId, startedAt), ORDER_TRACK_INTERVAL_MS);
  }
  constructor(private readonly auth: AuthService) {
    this.routing = inject(PageState, { optional: true })?.connect(this.activeTab, PAGE_PATHS, [
      { key: 'q', value: this.query }, { key: 'period', value: this.chartPeriod, allowed: [...CHART_PERIODS] },
      { key: 'symbol', value: this.symbol }, { key: 'panel', value: this.investmentTab, allowed: ['Holdings','Asset classes'] }
    ], () => {
      const quote = this.quotes().find(q => q.symbol === this.symbol());
      if (quote) { this.tradeQuote.set(quote); }
      else if (this.quotes().length) { this.tradeMessage.set('That symbol is unavailable.'); }
      else {
        // Prices have not loaded yet; the feed opens the linked stock once it is listed.
      }
    });
    Object.assign(this, tradingClients(this.auth, inject(ApiHttpClient)));
    this.#stopAccountWatch = this.accountState.onChange(() => this.#accountChanged());
    this.#stopFeedUpdates = this.feed.onUpdate(() => this.#applyFeed());
    this.#stopFeed = this.feed.start();
    this.#applyFeed();
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.#stopAccountWatch();
    this.#stopFeedUpdates();
    this.#stopFeed();
    this.routing?.destroy();
    clearTimeout(this.#trackTimer);
    clearTimeout(this.#ordersTimer);
    clearTimeout(this.#chartTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
  /** Reloads buying power and holdings; prices come from the shared feed. A failure keeps the last values. */
  async refreshPortfolio(): Promise<void> {
    try {
      const portfolio = await this.portfolioClient.load(this.selectedAccount()?.account_id);
      if (this.destroyed) { return; }
      this.applyPortfolio(portfolio);
      this.serviceDown.set(false);
    } catch {
      // A banner says so and offers a retry; the last values stay on screen.
      this.serviceDown.set(true);
    }
  }
  /** Shows a loaded portfolio, valued at the latest bids already known. */
  applyPortfolio(portfolio: Portfolio): void {
    this.#portfolio = portfolio;
    this.#liveRecording = true;
    this.portfolioLoaded.set(true);
    this.#render();
  }
  /**
   * Re-reads orders on the price interval while any is still open, and reloads balances when one
   * fills, so a fill from an order queued for the open shows without a page reload (PS-10).
   */
  async watchOrders(): Promise<void> {
    clearTimeout(this.#ordersTimer);
    let rows: OrderHistoryRow[];
    try {
      rows = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
    } catch {
      return;
    }
    if (this.destroyed) { return; }
    const fills = newlyFilled(this.#lastOrderRows, rows);
    this.#lastOrderRows = rows;
    if (fills.length) {
      await this.refreshPortfolio();
      void this.loadChart();
    }
    if (hasOpenOrders(rows)) {
      this.#scheduleOrderWatch();
    }
  }
  /** Shows another period of the portfolio-value chart. */
  setChartPeriod(period: ChartPeriod): void {
    this.chartPeriod.set(period);
    this.chartScrub.set(null);
    void this.loadChart().then(() => this.#announceChart(period));
  }

  /**
   * Says how the portfolio moved over the period just chosen, once its history has loaded:
   * "1 month. A month ago you had $24,000.00. Now you have $25,450.09, up 6.04 percent." Shown to
   * screen readers and read aloud by switch control. A period changed again meanwhile is not read.
   */
  #announceChart(period: ChartPeriod): void {
    if (this.destroyed || this.chartPeriod() !== period) {
      return;
    }
    const points = this.chartPoints();
    const text = chartSummary({
      period,
      start: points.length ? startValue(points) : 0,
      end: points.at(-1)?.value ?? this.portfolioValue(),
      // A period reaching back before the account had money starts from its first deposit.
      fromOpening: !!this.chartSpan()?.fromOpening || (points[0]?.value ?? 0) === 0,
      balanceHidden: !this.showBalance(),
      hasHistory: points.length >= 2 && !this.chartError(),
    });
    this.chartAnnouncement.set(text);
    this.#switchScan?.announce(text);
  }
  /**
   * Rebuilds the portfolio-value chart for the chosen period from the account's real history:
   * its deposits and transfers, its fills, and the recorded prices of every stock it has held.
   * It re-reads every minute so the line keeps up, and after any fill.
   */
  async loadChart(): Promise<void> {
    const request = ++this.#chartRequest;
    clearTimeout(this.#chartTimer);
    const account = this.selectedAccount();
    const filters = account ? { accountId: account.account_id } : {};
    this.chartLoading.set(true);
    try {
      const [movements, orders] = await Promise.all([this.cashActivityClient.list(filters), this.orderHistoryClient.list(filters)]);
      const now = Date.now();
      const fills = orders
        .filter((o) => o.status === 'FILLED' && o.fillPrice !== null && o.filledAt)
        .map((o) => ({
          at: Date.parse(o.filledAt!), symbol: o.symbol, price: o.fillPrice!,
          quantity: (o.side.toUpperCase() === 'SELL' ? -1 : 1) * (o.filledQuantity ?? o.quantity),
        }));
      const cash = [
        ...movements.map((m) => ({ at: Date.parse(m.occurredAt), amount: m.amount })),
        ...fills.map((f) => ({ at: f.at, amount: -f.quantity * f.price })),
      ].filter((e) => Number.isFinite(e.at));
      const session = tradingSession(now, this.feed.status()?.exchangeTimeZone);
      const range = chartRange(this.chartPeriod(), now, fundedAt(account?.created_at, cash), session);
      if (this.chartPeriod() === '1D') {
        // The demo quote feed runs after the regular session too; market hours gate fills,
        // not the history we display. Include those recorded quotes on reload as well.
        range.end = now;
      }
      const prices = await this.#closes([...new Set(fills.map((f) => f.symbol))], range, now);
      if (request !== this.#chartRequest || this.destroyed) {
        return;
      }
      this.chartSpan.set(range);
      this.chartHistory.set(portfolioSeries(range, cash, fills, prices));
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
  /**
   * Recorded prices of each stock over the range; a stock whose prices fail falls back to its fill
   * price. Recorded prices are midpoints while live values use the bid, so each is moved by the
   * stock's current bid-to-midpoint ratio, and the history meets the live line without a jump.
   */
  async #closes(symbols: string[], range: ChartRange, now: number): Promise<Map<string, PricePoint[]>> {
    const { interval, limit } = barStep(range);
    const ids = new Map([
      ...this.instruments().map((i) => [i.symbol, i.instrumentId] as const),
      ...this.feed.quotes().map((q) => [q.symbol, q.instrumentId] as const),
    ]);
    const prices = new Map<string, PricePoint[]>();
    await Promise.all(symbols.map(async (symbol) => {
      const id = ids.get(symbol);
      if (!id) {
        return;
      }
      const quote = this.feed.quotes().find((q) => q.symbol === symbol);
      const toBid = quote && quote.bid > 0 && quote.price > 0 ? quote.bid / quote.price : 1;
      try {
        const closes = await this.feed.client.closes(id, interval, limit, now);
        prices.set(symbol, closes.map((p) => ({ at: p.at, price: p.price * toBid })));
      } catch {
        // Valued at its last fill price instead.
      }
    }));
    return prices;
  }
  #scheduleOrderWatch(): void {
    clearTimeout(this.#ordersTimer);
    if (!this.destroyed) {
      this.#ordersTimer = setTimeout(() => void this.watchOrders(), QUOTE_REFRESH_MS);
    }
  }
  #render(): void {
    const valuation = valuePortfolio(this.#portfolio, this.#bids, this.#dayChanges);
    this.holdings.set(
      valuation.holdings.map((h) => ({
        symbol: h.symbol,
        name: h.instrumentName,
        value: h.value,
        shares: h.quantity,
        average: h.averageCost,
        today: h.dayGain,
        change: h.dayChangePercent,
        total: h.gain,
        totalPercent: h.gainPercent,
        logo: LOGOS[h.symbol] ?? '',
      })),
    );
    this.buyingPower.set(valuation.cash);
    this.invested.set(valuation.holdingsValue);
    this.portfolioValue.set(valuation.total);
    this.todayReturn.set(valuation.dayGain);
    this.todayReturnPercent.set(valuation.dayGainPercent);
    if (this.#liveRecording) {
      const at = Math.max(Date.now(), (this.chartLive().at(-1)?.at ?? 0) + 1);
      this.chartLive.update((points) => [...points.slice(-(LIVE_POINTS - 1)), { at, value: valuation.total }]);
    }
  }
  /** Loads the account and instrument ids an order needs; a failure surfaces when the user confirms. */
  ngOnInit(): void {
    // Keeps the market countdown current; prices and status come from the shared feed.
    interval(5000)
      .pipe(startWith(0), takeUntil(this.destroy$))
      .subscribe(() => this.marketClock.set(new Date()));

    void this.#start();
  }

  /** Accounts first, so the first portfolio load is already the selected account's. */
  async #start(): Promise<void> {
    await this.loadTradingData();
    this.#started = true;
    await this.refreshPortfolio();
    await this.watchOrders();
    void this.loadChart();
  }

  /** Another account was picked, or cash moved between accounts: show its balances and holdings. */
  #accountChanged(): void {
    if (!this.#started || this.destroyed) { return; }
    this.reviewing.set(false);
    this.tradeMessage.set('');
    this.#lastOrderRows = null;
    // The other account's live values start once its balances arrive.
    this.#liveRecording = false;
    this.chartLive.set([]);
    void this.refreshPortfolio();
    void this.watchOrders();
    void this.loadChart();
  }

  /** The plain-English reason an order was rejected; a generic one if it cannot be read. */
  async #rejectionReason(orderId: string): Promise<string> {
    try {
      return rejectionMessage(await this.orderStatusClient.status(orderId));
    } catch {
      return rejectionReason(null);
    }
  }

  /** Opens the orders list from a toast. */
  viewOrders(): void {
    this.navigate('Activity');
  }

  /**
   * What the spoken briefing reads (PS-18): the portfolio as shown, today's move of each holding
   * from the live feed, and this account's orders. A failed order load leaves orders out.
   */
  readonly briefingSource: BriefingSource = async () => {
    const accountId = this.selectedAccount()?.account_id;
    let orders: OrderHistoryRow[] = [];
    try {
      orders = await this.orderHistoryClient.list({ accountId });
    } catch {
      // The rest of the briefing is still worth hearing.
    }
    const now = new Date(this.feed.now());
    const live = new Map(this.feed.quotes().map((q) => [q.symbol, q]));
    const held = this.holdings();
    return {
      accountId,
      now,
      market: this.marketStatus(),
      balanceHidden: !this.showBalance(),
      total: this.portfolioValue(),
      gain: this.totalReturn(),
      gainPercent: this.totalReturnPercent(),
      buyingPower: this.buyingPower(),
      holdings: held.map((h) => ({ symbol: h.symbol, name: h.name, dayChangePercent: live.get(h.symbol)?.change ?? null })),
      orders,
      pricesDelayed: held.some((h) => {
        const quote = live.get(h.symbol);
        return !!quote?.price && isDelayed(quote.quotedAt, now.getTime());
      }),
    };
  };

  /**
   * Shows the feed's latest prices, re-values holdings at the latest bids (PS-10: no separate
   * per-holding requests), and keeps the open ticket on its stock's live price.
   */
  #applyFeed(): void {
    const live = this.feed.quotes();
    this.quotes.set(live.map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, change: q.change, quotedAt: q.quotedAt })));
    for (const q of live) {
      if (q.bid > 0) {
        this.#bids.set(q.instrumentId, q.bid);
      }
      this.#dayChanges.set(q.instrumentId, q.change);
    }
    if (this.portfolioLoaded()) {
      this.#render();
    }
    const symbol = this.tradeQuote().symbol || this.symbol();
    const current = this.quotes().find((q) => q.symbol === symbol);
    if (current) { this.tradeQuote.set(current); }
  }

  private async loadTradingData(): Promise<void> {
    try {
      this.accountState.use(await this.orderSubmissionClient.getAccounts());
      this.instruments.set(await this.orderSubmissionClient.getInstruments());
    } catch {
      // confirmTrade reports the missing account or instrument in plain words.
    }
  }
}
