import { ChartAccess, ChartFocus } from './chart-access';
import { allocation, chartPoints, type ChartSeries } from './chart-data';
import { categoryDescription, categoryTable, chartValue } from '../../../shared/chart-description';
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
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, hasMarketValuation, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { interval, Subject, startWith, takeUntil } from 'rxjs';
import { closedMarketWarning, localOpeningTime, marketStatusLabel, marketStatusText } from './market-status-api';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { AccountSettings } from './account-settings';
import { ToastService, Toasts } from './toasts';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { MarketTicker } from './market-ticker';
import { tradingClients } from './trading-clients';
import type { UserProfile } from './auth-api';
import { CashActivityClient, formatMoney } from './activity-api';
import { PortfolioChart } from './portfolio-chart';
import {
  CHART_PERIODS, CashEvent, ChartPeriod, ChartRange, PricePoint, ValuePoint, barStep, chartRange, portfolioSeries, portfolioEvents, ledgerMatches, startValue, portfolioPeriodLabel, historyCoverage,
} from './portfolio-history';
import { centralDay, centralTime } from './app-time';
import { AccessibilitySettings } from './accessibility-settings';
import { KeyboardShortcuts, isShortcutsKey } from './keyboard-shortcuts';
import { BriefingButton, BriefingSource } from './briefing-button';
import { chartSummary } from './chart-speech';
import { orderReadBack } from './order-read-back';
import { spokenCompany } from './briefing';
import { SwitchScanService } from '../../../shared/switch-scan';
import { FocusAfterChange } from './focus-after-change';

/** How often the portfolio-value chart re-reads its history. */
export const CHART_REFRESH_MS = 60000;
/** Sidebar sizes in pixels: icon strip, below which labels hide, default, and widest. */
const SIDEBAR_MIN = 64;
const SIDEBAR_COMPACT = 150;
const SIDEBAR_DEFAULT = 224;
const SIDEBAR_MAX = 360;
const SIDEBAR_KEY = 'nexttrade.novice.sidebarWidth';
function clampSidebar(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));
}
function storedSidebarWidth(): number {
  try {
    const saved = Number(globalThis.localStorage?.getItem(SIDEBAR_KEY));
    return saved ? clampSidebar(saved) : SIDEBAR_DEFAULT;
  } catch {
    return SIDEBAR_DEFAULT;
  }
}
const SECTOR_COLORS = Array.from({ length: 7 }, (_, i) => `var(--sector-${i + 1})`);
/** How often prices, and so the overview chart's live line, refresh on the novice dashboard. */
export const NOVICE_REFRESH_MS = 3000;
/** Live values kept for the chart: a day of three-second updates. */
const LIVE_POINTS = 28800;


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
    AccessibilitySettings, KeyboardShortcuts, BriefingButton, ChartAccess, ChartFocus, FocusAfterChange, AccountSettings,
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
  /** Sidebar width in pixels; drag its edge to resize, from an icon strip up to a wide panel. Remembered per browser. */
  readonly sidebarWidth = signal(storedSidebarWidth());
  /** Narrow enough that only icons fit, so labels are hidden. */
  readonly sidebarCollapsed = computed(() => this.sidebarWidth() < SIDEBAR_COMPACT);
  /** True while the edge is being dragged, so the width follows the pointer without easing. */
  readonly resizingSidebar = signal(false);
  readonly sidebarMin = SIDEBAR_MIN;
  readonly sidebarMax = SIDEBAR_MAX;
  /** The width to return to when a double-click on the edge re-opens the sidebar. */
  #openSidebarWidth = SIDEBAR_DEFAULT;

  /** Double-click on the edge: shrink to icons, or re-open at the last open width. */
  toggleSidebar(): void {
    if (this.sidebarCollapsed()) {
      this.#setSidebarWidth(this.#openSidebarWidth);
    } else {
      this.#openSidebarWidth = this.sidebarWidth();
      this.#setSidebarWidth(SIDEBAR_MIN);
    }
  }

  /** Drags the sidebar's edge; letting go in the icon-only range snaps to the icon strip. */
  startSidebarResize(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const shell = (event.currentTarget as HTMLElement).closest('.novice-shell') as HTMLElement | null;
    const left = shell?.getBoundingClientRect().left ?? 0;
    this.resizingSidebar.set(true);
    const move = (moved: PointerEvent): void => this.sidebarWidth.set(clampSidebar(moved.clientX - left));
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.resizingSidebar.set(false);
      if (this.sidebarCollapsed()) {
        this.#setSidebarWidth(SIDEBAR_MIN);
      } else {
        this.#openSidebarWidth = this.sidebarWidth();
        this.#setSidebarWidth(this.sidebarWidth());
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** Keyboard resizing on the edge: arrows step 16px, Home collapses, End opens fully. */
  resizeSidebarWithKeys(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -16, ArrowRight: 16 };
    if (event.key in steps) {
      event.preventDefault();
      this.#setSidebarWidth(this.sidebarWidth() + steps[event.key]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.#setSidebarWidth(event.key === 'Home' ? SIDEBAR_MIN : SIDEBAR_MAX);
    } else {
      // Other keys retain their native browser behavior.
    }
  }

  #setSidebarWidth(width: number): void {
    const next = clampSidebar(width);
    this.sidebarWidth.set(next);
    try {
      globalThis.localStorage?.setItem(SIDEBAR_KEY, String(next));
    } catch {
      // Storage can be unavailable (private windows); the width just isn't remembered.
    }
  }
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
  /** "Good Morning" / "Good Afternoon" / "Good Evening" by the client's own clock (PS-06). */
  readonly greeting = computed(() => {
    const hour = this.marketClock().getHours();
    if (hour < 12) {
      return 'Good Morning';
    }
    return hour < 18 ? 'Good Afternoon' : 'Good Evening';
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
  readonly allocationReady = signal(false);
  /** Today's move across holdings, from each stock's change since the day's first quote. */
  readonly todayReturn = signal(0);
  readonly todayReturnPercent = signal(0);
  /** The portfolio-value chart: its period, the span it covers and the value at each moment. */
  readonly chartPeriod = signal<ChartPeriod>('1D');
  readonly chartSpan = signal<ChartRange | null>(null);
  readonly chartHistory = signal<ValuePoint[]>([]);
  readonly chartLoading = signal(false);
  readonly chartError = signal('');
  #portfolioRequest = 0;
  #orderRequest = 0;
  readonly chartNotice = signal('');
  readonly chartSeries = computed<ChartSeries>(() => ({ id: 'portfolio:' + (this.selectedAccount()?.account_id ?? 'all'),
    label: 'Portfolio value', unit: 'USD', points: this.chartLoading() || this.chartError() ? [] : chartPoints(this.chartPoints(), p => p.at, p => p.value),
    coverage: historyCoverage(this.chartSpan(), this.chartLoading() || this.chartError() ? [] : this.chartPoints()),
    status: this.chartLoading() ? 'loading' : this.chartError() ? 'error' : this.chartPoints().length ? 'ready' : 'unavailable',
    note: this.chartError() || this.chartNotice() }));
  /** A stock as it is said aloud: "Google", not "GOOGL" (shown as the symbol and full name). */
  readonly spokenStock = spokenCompany;
  /** The last chart summary said aloud, for screen readers (a polite live region). */
  readonly chartAnnouncement = signal('');
  readonly #switchScan = inject(SwitchScanService, { optional: true });
  /** The chart point under the cursor; the value above the chart follows it while it is set. */
  readonly chartScrub = signal<ValuePoint | null>(null);
  /** The big number: the scrubbed point's value, otherwise the live total. */
  readonly headerValue = computed(() => this.chartScrub()?.value ?? this.portfolioValue());
  readonly chartChangeAvailable = computed(() => !this.chartLoading() && !this.chartError() && this.chartPoints().length >= 2);
  /**
   * The line under the big number: how much the value moved over the chosen period (or up to the
   * scrubbed point). The template waits for a usable history before displaying a change.
   */
  readonly headerChange = computed(() => {
    const points = this.chartPoints();
    if (points.length < 2) {
      return { amount: 0, percent: 0, label: 'Change unavailable' };
    }
    // A real zero balance at the range start must not be replaced by a later deposit.
    const start = startValue(points);
    const scrub = this.chartScrub();
    const amount = Math.round(((scrub ?? points.at(-1)!).value - start) * 100) / 100;
    const span = this.chartSpan();
    let label = portfolioPeriodLabel(this.chartPeriod(), span, points);
    if (span?.session && centralDay(span.session.open) !== centralDay(this.marketClock())) {
      // Before today's open: the last session's move, named by its day.
      label = centralTime(span.session.open, { weekday: 'long' });
    }
    if (scrub) {
      label = `${centralTime(scrub.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`;
    }
    return { amount, percent: start > 0 ? (amount / start) * 100 : null, label };
  });
  /** "+$1.30 (+0.01%)" / "−$0.90 (−0.00%)". */
  readonly headerChangeText = computed(() => {
    const { amount, percent } = this.headerChange();
    if (percent === null) { return `${formatMoney(amount, true)} (percentage unavailable)`; }
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
  /** Stocks' share of the total, unrounded, so even small holdings retain their arc. */
  readonly stocksShare = computed(() => {
    const { total, stocksValue } = this.assetAllocation();
    return this.allocationReady() && total > 0 ? stocksValue / total * 100 : 0;
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
    if (!this.portfolioLoaded()) { return history; }
    const range = this.chartSpan();
    // Quotes keep arriving outside order-execution hours. Keep their actual times instead of
    // moving the closing point's price while its timestamp (and the viewport) stays frozen.
    let live = this.chartLive().filter((p) => p.at >= (history[0]?.at ?? range?.start ?? 0));
    if (range && this.chartPeriod() !== '1D') {
      // Longer periods retain the last live observation per price bar.
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
  /**
   * The trade window's price chart for the stock being bought or sold: the same chart, periods, hover
   * readout and day detail as the Overview's portfolio chart, but drawn from that stock's recorded
   * prices and then every live price while the window is open.
   */
  readonly stockChartPeriod = signal<ChartPeriod>('1D');
  readonly stockChartSpan = signal<ChartRange | null>(null);
  readonly stockChartHistory = signal<ValuePoint[]>([]);
  readonly stockChartLive = signal<ValuePoint[]>([]);
  readonly stockChartLoading = signal(false);
  readonly stockChartError = signal('');
  readonly stockChartChangeAvailable = computed(() => !this.stockChartLoading() && !this.stockChartError() && this.stockChartPoints().length >= 2);
  readonly stockChartScrub = signal<ValuePoint | null>(null);
  #stockChartRequest = 0;
  #stockChartTimer: ReturnType<typeof setTimeout> | undefined;
  readonly stockChartPoints = computed(() => {
    const history = this.stockChartHistory();
    const range = this.stockChartSpan();
    let live = this.stockChartLive().filter((p) => p.at >= (history[0]?.at ?? range?.start ?? 0));
    if (range && this.stockChartPeriod() !== '1D') {
      live = lastPerBar(live, barStep(range).ms);
    }
    return live.length ? [...history.filter((p) => p.at < live[0].at), ...live] : history;
  });
  /** The price above the chart: the hovered point's, otherwise the live price. */
  readonly stockChartPrice = computed(() => this.stockChartScrub()?.value ?? this.tradeQuote().price);
  /** How the stock moved over the chosen period, or up to the hovered point. */
  readonly stockChartChange = computed(() => {
    const points = this.stockChartPoints();
    const scrub = this.stockChartScrub();
    if (points.length < 2) {
      return { amount: 0, percent: null, label: 'Change unavailable' };
    }
    // Measured from the same starting value the chart draws its dotted baseline at, as on Overview.
    const start = startValue(points);
    const amount = Math.round(((scrub ?? points.at(-1)!).value - start) * 100) / 100;
    const label = scrub
      ? `${centralTime(scrub.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`
      : portfolioPeriodLabel(this.stockChartPeriod(), this.stockChartSpan(), points);
    return { amount, percent: start > 0 ? (amount / start) * 100 : null, label };
  });
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
  /**
   * The Overview's allocation card: invested money split by industry sector, built from whatever the
   * account holds right now (each stock's sector comes with its live price). Largest sector first; past
   * the sixth, the rest are grouped as "Other sectors". Cash is reported beside it, not in the ring.
   */
  readonly sectorAllocation = computed(() => {
    const sectorOf = new Map(this.feed.quotes().map((q) => [q.symbol, q.sector?.trim() || 'Other']));
    const bySector = new Map<string, { value: number; symbols: string[] }>();
    for (const holding of this.holdings()) {
      if (holding.value <= 0) {
        continue;
      }
      const sector = sectorOf.get(holding.symbol) ?? 'Other';
      const entry = bySector.get(sector) ?? { value: 0, symbols: [] };
      entry.value += holding.value;
      entry.symbols.push(holding.symbol);
      bySector.set(sector, entry);
    }
    const invested = [...bySector.values()].reduce((sum, s) => sum + s.value, 0);
    let rows = [...bySector.entries()]
      .map(([name, s]) => ({ name, value: s.value, symbols: s.symbols }))
      .sort((a, b) => b.value - a.value);
    if (rows.length > SECTOR_COLORS.length) {
      const rest = rows.slice(SECTOR_COLORS.length - 1);
      rows = [...rows.slice(0, SECTOR_COLORS.length - 1), {
        name: 'Other sectors',
        value: rest.reduce((sum, r) => sum + r.value, 0),
        symbols: rest.flatMap((r) => r.symbols),
      }];
    }
    let start = 0;
    const sectors = rows.map((row, i) => {
      const share = invested > 0 ? (row.value / invested) * 100 : 0;
      // Round caps reach half the 3.8 stroke past each end of an arc, so the gap covers both caps
      // plus about 0.9 of clear space between neighbours (the circle is 100 units around).
      const gap = rows.length > 1 ? 4.7 : 0;
      const length = Math.max(share - gap, 0.01);
      const segment = {
        ...row,
        color: SECTOR_COLORS[i],
        share,
        percent: Math.round(share),
        dash: `${length.toFixed(2)} ${(100 - length).toFixed(2)}`,
        offset: (25 - start - gap / 2).toFixed(2),
      };
      start += share;
      return segment;
    });
    return { invested, cash: this.buyingPower(), sectors };
  });
  /** Screen-reader summary of the sector ring. */
  readonly sectorSummary = computed(() => {
    const { sectors } = this.sectorAllocation();
    return sectors.length
      ? 'Investments by sector: ' + sectors.map((s) => `${s.name} ${s.percent} percent`).join(', ')
      : 'No investments yet';
  });
  readonly allocationSeries = computed<readonly ChartSeries[]>(() => this.allocationReady() ? this.allocationCategories().map(c => ({
    id: 'allocation:' + c.label, label: c.label, unit: 'USD', status: 'ready', points: [{ time: this.feed.now(), value: c.value }],
  })) : []);
  readonly allocationCategories = computed(() => {
    return this.sectorAllocation().sectors.map(s => ({ label: s.name, value: s.value, percent: s.percent }));
  });
  readonly allocationDescription = computed(() => !this.portfolioLoaded() ? 'Asset allocation. Balances have not loaded yet.' : !this.allocationReady() ? 'Asset allocation unavailable until all holdings have market quotes.' : categoryDescription('Allocation by sector', this.allocationCategories(), !this.showBalance()) + (this.showBalance() ? ' Shares are percentages of invested money. Cash, not invested: ' + chartValue(this.sectorAllocation().cash, { currency: 'USD' }) + '.' : ''));
  readonly allocationTable = computed(() => {
    if (!this.portfolioLoaded() || !this.allocationReady()) { return {
      columns: ['Sector', 'Value (USD)', 'Share of investments'], rows: [],
      note: !this.portfolioLoaded() ? 'Balances have not loaded yet.' : 'Allocation is unavailable until all holdings have market quotes.',
    }; }
    return { ...categoryTable(this.allocationCategories(), !this.showBalance()),
      columns: ['Sector', 'Value (USD)', 'Share of investments'],
      references: this.showBalance() ? [{ label: 'Cash, not invested', value: chartValue(this.sectorAllocation().cash, { currency: 'USD' }) }] : [],
    };
  });
  readonly assetAllocation = computed(() => allocation(
    this.holdings().reduce((sum, h) => sum + h.value, 0), this.buyingPower(),
  ));

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
    this.stockMenuOpen.set(false);
    clearTimeout(this.#stockChartTimer);
    ++this.#stockChartRequest;
    this.stockChartScrub.set(null);
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
    this.#resetStockChart();
  }

  /** Shows another period of the trade window's stock chart. */
  setStockChartPeriod(period: ChartPeriod): void {
    this.stockChartPeriod.set(period);
    this.stockChartScrub.set(null);
    void this.loadStockChart();
  }

  /** A new stock (or a fresh window): clear the old line and load this one's history. */
  #resetStockChart(): void {
    this.stockChartScrub.set(null);
    this.stockChartLive.set([]);
    this.stockChartHistory.set([]);
    this.stockChartSpan.set(null);
    this.stockChartError.set('');
    void this.loadStockChart();
  }

  /**
   * Loads the trade stock's recorded prices for the chosen period, at the same bar sizes as the
   * portfolio chart, and re-reads them every minute while the window stays open.
   */
  async loadStockChart(): Promise<void> {
    const request = ++this.#stockChartRequest;
    clearTimeout(this.#stockChartTimer);
    const quote = this.tradeQuote();
    const id =
      this.instruments().find((i) => i.symbol === quote.symbol)?.instrumentId ??
      this.feed.quotes().find((q) => q.symbol === quote.symbol)?.instrumentId;
    if (!quote.symbol || !id) {
      this.stockChartHistory.set([]);
      this.stockChartLoading.set(false);
      this.stockChartError.set('Price history is unavailable for this stock.');
      return;
    }
    this.stockChartLoading.set(true);
    try {
      const now = Date.now();
      // A stock has no "opening" date like an account; ALL reaches back five years.
      const range = chartRange(this.stockChartPeriod(), now, now - 5 * 365 * 24 * 60 * 60 * 1000);
      range.fromOpening = false;
      const { interval, limit } = barStep(range);
      const closes = await this.feed.client.closes(id, interval, limit, now);
      if (request !== this.#stockChartRequest || this.destroyed) {
        return;
      }
      this.stockChartSpan.set(range);
      this.stockChartHistory.set(chartPoints(closes, p => p.at, p => p.price).filter(p => p.time >= range.start && p.time <= range.end).map(p => ({ at: p.time, value: p.value })));
      this.stockChartError.set('');
    } catch {
      if (request === this.#stockChartRequest) {
        this.stockChartError.set(`${quote.symbol}'s price history could not be loaded right now. It will try again shortly.`);
      }
    } finally {
      if (request === this.#stockChartRequest) {
        this.stockChartLoading.set(false);
        if (!this.destroyed && this.dialog()?.nativeElement.open && this.modal() === 'trade') {
          this.#stockChartTimer = setTimeout(() => void this.loadStockChart(), CHART_REFRESH_MS);
        }
      }
    }
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
  /** The ticket's stock list: a menu that always opens downwards, unlike a native select near the screen's bottom. */
  readonly stockMenuOpen = signal(false);
  /** The highlighted row while the menu is open (arrow keys move it, Enter picks it). */
  readonly stockMenuIndex = signal(0);

  toggleStockMenu(): void {
    if (this.stockMenuOpen()) {
      this.stockMenuOpen.set(false);
      return;
    }
    const index = this.tradableQuotes().findIndex((q) => q.symbol === this.tradeQuote().symbol);
    this.stockMenuIndex.set(Math.max(index, 0));
    this.stockMenuOpen.set(true);
  }

  pickStock(symbol: string): void {
    this.chooseTradeSymbol(symbol);
    this.stockMenuOpen.set(false);
  }

  stockMenuKey(event: KeyboardEvent): void {
    const options = this.tradableQuotes();
    if (!this.stockMenuOpen()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.toggleStockMenu();
      }
      return;
    }
    const last = options.length - 1;
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (event.key in moves) {
      event.preventDefault();
      this.stockMenuIndex.set(Math.min(last, Math.max(0, this.stockMenuIndex() + moves[event.key])));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.stockMenuIndex.set(event.key === 'Home' ? 0 : last);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[this.stockMenuIndex()];
      if (option) {
        this.pickStock(option.symbol);
      }
    } else if (event.key === 'Escape') {
      // Close just the menu, not the whole dialog.
      event.preventDefault();
      event.stopPropagation();
      this.stockMenuOpen.set(false);
    } else if (event.key === 'Tab') {
      this.stockMenuOpen.set(false);
    } else {
      // Other keys retain their native browser behavior.
    }
  }

  chooseTradeSymbol(symbol: string): void {
    const quote = this.quotes().find((q) => q.symbol === symbol);
    if (!quote) {
      return;
    }
    const changed = quote.symbol !== this.tradeQuote().symbol;
    this.tradeQuote.set(quote);
    this.reviewing.set(false);
    this.tradeMessage.set('');
    if (changed) {
      this.#resetStockChart();
    }
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
      this.#readBack();
    }
  }

  /**
   * Says the order aloud before it can be confirmed (PS-23), cutting in on whatever switch control
   * was saying. Only on starting a review, so confirming does not repeat it; editing and reviewing
   * again reads the new details.
   */
  #readBack(): void {
    const quote = this.tradeQuote();
    this.#switchScan?.announce(orderReadBack({
      side: this.side() === 'Sell' ? 'Sell' : 'Buy',
      quantity: Number(this.quantity()),
      symbol: quote.symbol,
      name: quote.name,
      total: this.tradeTotal(),
      closedWarning: this.closedWarning(),
      priceDelayed: this.tradePriceDelayed(),
    }), true);
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
    // The overview chart takes a new point at every price refresh; novice asks for one every 3 seconds.
    this.#stopFeed = this.feed.start(NOVICE_REFRESH_MS);
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
    clearTimeout(this.#stockChartTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
  /** Reloads buying power and holdings; prices come from the shared feed. A failure keeps the last values. */
  async refreshPortfolio(): Promise<void> {
    const request = ++this.#portfolioRequest;
    const accountId = this.selectedAccount()?.account_id;
    try {
      const portfolio = await this.portfolioClient.load(accountId);
      if (this.destroyed || request !== this.#portfolioRequest) { return; }
      this.applyPortfolio(portfolio);
      this.serviceDown.set(false);
    } catch {
      if (request !== this.#portfolioRequest || this.destroyed) { return; }
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
    const request = ++this.#orderRequest;
    clearTimeout(this.#ordersTimer);
    let rows: OrderHistoryRow[];
    try {
      rows = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
    } catch {
      return;
    }
    if (this.destroyed) { return; }
    if (request !== this.#orderRequest) { return; }
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
      partial: historyCoverage(this.chartSpan(), points).status === 'partial',
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
    const period = this.chartPeriod();
    const filters = account ? { accountId: account.account_id } : {};
    this.chartLoading.set(true);
    try {
      const [movements, orders] = await Promise.all([this.cashActivityClient.list(filters), this.orderHistoryClient.list(filters)]);
      if (request !== this.#chartRequest || this.destroyed) { return; }
      const now = Date.now();
      const { cash, shares: fills } = portfolioEvents(movements, orders);
      const range = chartRange(period, now, fundedAt(account?.created_at, cash));
      const prices = await this.#closes([...new Set(fills.map((f) => f.symbol))], range, now);
      if (request !== this.#chartRequest || this.destroyed) {
        return;
      }
      this.chartSpan.set(range);
      const complete = ledgerMatches(this.#portfolio, cash, fills);
      const points = complete ? portfolioSeries(range, cash, fills, prices) : [];
      this.chartHistory.set(points);
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
  /** Historical bids, never today's spread applied to old midpoints. Raw recent quotes
   * supplement coarse bid closes without replacing older observations. */
  async #closes(symbols: string[], range: ChartRange, now: number): Promise<Map<string, PricePoint[]>> {
    const { interval, limit } = barStep(range);
    const ids = new Map([
      ...this.instruments().map(i => [i.symbol, i.instrumentId] as const),
      ...this.feed.quotes().map(q => [q.symbol, q.instrumentId] as const),
    ]);
    const entries = await Promise.all(symbols.map(async symbol => {
      const id = ids.get(symbol);
      if (!id) { return [symbol, [] as PricePoint[]] as const; }
      const [bars, recent] = await Promise.allSettled([
        this.feed.client.closes(id, interval, limit, now, 'bid'),
        Promise.resolve().then(() => this.feed.client.history(id, 1000, 'bid')),
      ]);
      const points = [...(bars.status === 'fulfilled' ? bars.value : []), ...(recent.status === 'fulfilled' ? recent.value : [])];
      return [symbol, chartPoints(points, p => p.at, p => p.price).map(p => ({ at: p.time, price: p.value }))] as const;
    }));
    return new Map(entries);
  }
  #scheduleOrderWatch(): void {
    clearTimeout(this.#ordersTimer);
    if (!this.destroyed) {
      this.#ordersTimer = setTimeout(() => void this.watchOrders(), QUOTE_REFRESH_MS);
    }
  }
  #render(): void {
    const valuation = valuePortfolio(this.#portfolio, this.#bids, this.#dayChanges);
    this.allocationReady.set(hasMarketValuation(this.#portfolio, this.#bids));
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
    if (this.#liveRecording && this.allocationReady()) {
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
    this.chartHistory.set([]);
    this.chartScrub.set(null);
    this.portfolioLoaded.set(false);
    this.allocationReady.set(false);
    const request = ++this.#chartRequest;
    clearTimeout(this.#chartTimer);
    this.chartLoading.set(true);
    void this.refreshPortfolio().then(() => {
      if (!this.destroyed && request === this.#chartRequest) { void this.loadChart(); }
    });
    void this.watchOrders();
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
    if (current) {
      this.tradeQuote.set(current);
      // Every live price while the trade window is open joins its stock chart.
      if (current.price > 0 && this.modal() === 'trade' && this.dialog()?.nativeElement.open) {
        const at = Math.max(Date.now(), (this.stockChartLive().at(-1)?.at ?? 0) + 1);
        this.stockChartLive.update((points) => [...points.slice(-(LIVE_POINTS - 1)), { at, value: current.price }]);
      }
    }
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
