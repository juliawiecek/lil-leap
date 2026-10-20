import { ApiHttpClient } from '@lilleap/session-core/angular';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, inject, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit } from '@angular/core';
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
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, dayGainOf, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { MarketFeed } from './market-feed.service';
import { PricePoint, isDelayed } from './market-feed-api';
import { MarketTicker } from './market-ticker';
import { closedMarketWarning, localOpeningTime, marketBadgeText } from './market-status-api';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { ToastService, Toasts } from './toasts';
import { tradingClients } from './trading-clients';
import type { UserProfile } from './auth-api';
import { BriefingButton, BriefingSource } from './briefing-button';
import { SwitchScanService } from './switch-scan';
import { SwitchScanSettings } from './switch-scan-settings';
import { periodWindow, plotMarks, priceLabels, pricePath, priceRange, priceY, timeLabels, tradeMarks } from './trade-marks';

interface Quote {
  instrumentId: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  sector: string;
  quotedAt: string;
}
/** Size of the price chart's drawing area, in SVG units. */
const CHART_WIDTH = 824;
const CHART_HEIGHT = 160;
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
  imports: [
    CurrencyPipe, DecimalPipe, DashboardIcon, AdvancedTicket, AdvancedChart, ActivityFeed, AccountSwitcher, MarketTicker, Toasts,
    PriceProtectionSettings, BriefingButton, SwitchScanSettings,
  ],
  templateUrl: './advanced-dashboard.html',
  styleUrl: './advanced-dashboard.scss',
})
export class AdvancedDashboard implements OnInit, OnDestroy {
  // The four API clients are assigned from tradingClients() in the constructor.
  declare readonly orderSubmissionClient: OrderSubmissionClient;
  declare readonly orderHistoryClient: OrderHistoryClient;
  declare readonly portfolioClient: PortfolioClient;
  #trackTimer: ReturnType<typeof setTimeout> | undefined;
  #clockTimer: ReturnType<typeof setInterval> | undefined;
  #ordersPollTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  /** Latest bid and today's % change per instrument, both from the shared feed (PS-10). */
  readonly #bids = new Map<string, number>();
  readonly #dayChanges = new Map<string, number>();
  /** The previous order read, so a fill seen by polling reloads balances (PS-10). */
  #lastOrderRows: OrderHistoryRow[] | null = null;
  /** Which stock's price history is loaded or loading, so a switch drops a stale response. */
  #historySymbol = '';
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
  readonly collapsed = signal(false);
  readonly query = signal('');
  readonly notifications = signal(false);
  readonly privateBalance = signal(false);
  readonly period = signal('1D');
  readonly periods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
  readonly bottomTab = signal('Positions');
  readonly bottomTabs = ['Positions', 'Balances', 'Performance'];
  /** Balances could not be read: the service is down or unreachable (PS-11). */
  readonly serviceDown = signal(false);
  readonly marketTab = signal('Sectors');
  readonly filter = signal('All stocks');
  readonly currentTime = signal(new Date());
  readonly formattedTime = computed(() => {
    const now = this.currentTime();
    return {
      time: now.toLocaleTimeString('en-US', { hour12: false }),
      date: now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
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
  readonly marketBadge = computed(() => marketBadgeText(this.feed.status(), this.currentTime()));
  readonly marketOpen = computed(() => this.feed.status()?.open ?? false);
  /** Open or closed for the briefing; null until the status first loads. */
  readonly marketKnownOpen = computed(() => this.feed.status()?.open ?? null);
  /** Switch control runs app-wide once turned on; injecting it here starts it after a reload. */
  readonly switchScan = inject(SwitchScanService, { optional: true }) ?? new SwitchScanService();
  /** Shown on the ticket before submitting while the market is closed (PS-02). */
  readonly closedWarning = computed(() => closedMarketWarning(this.feed.status(), this.currentTime()));
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
      price: this.selected().price,
      tolerancePercent: this.tolerance(),
      opensAt: status && !status.open ? localOpeningTime(status.nextOpen, this.currentTime()) : '',
    });
  });
  readonly results = computed(() =>
    this.quotes().filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
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
  /** Unrealised gain across positions at the latest bids, in USD and as % of cost. */
  readonly totalReturn = signal(0);
  readonly totalReturnPercent = signal(0);
  /** Today's move across positions, from each stock's change since the day's first quote. */
  readonly dayGain = signal(0);
  readonly dayGainPercent = signal(0);
  /** Cash and stocks as shares of the total, for the summary and the exposure panel. */
  readonly exposure = computed(() => {
    const total = this.portfolio();
    const equities = Math.max(0, Math.round((total - this.buyingPower()) * 100) / 100);
    const equitiesPercent = total > 0 ? Math.round((equities / total) * 1000) / 10 : 0;
    return { total, equities, cash: this.buyingPower(), equitiesPercent, cashPercent: total > 0 ? Math.round((100 - equitiesPercent) * 10) / 10 : 0 };
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
  /** The signed-in user's orders, newest first, loaded from the backend. */
  readonly orders = signal<Order[]>([]);
  readonly side = signal('Buy');
  /** The orders service fills MARKET orders only, so the ticket offers nothing else. */
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
    const { price } = this.selected();
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
  readonly total = computed(() => Number(this.quantity()) * this.selected().price);
  /** The charted stock's recorded prices, oldest first: its recent history plus each live tick (PS-06). */
  readonly priceHistory = signal<PricePoint[]>([]);
  /** Today's move of the charted stock in dollars, from its percent change since the day's first quote. */
  readonly selectedDayMove = computed(() => dayGainOf(this.selected().price, this.selected().change));
  /** Order history rows, kept for the chart's trade markers (PS-13). */
  readonly historyRows = signal<OrderHistoryRow[]>([]);
  /** The client's fills of the charted stock, oldest first. */
  readonly tradeMarks = computed(() => tradeMarks(this.historyRows(), this.selected().symbol));
  /** Average cost of the charted stock while it is held; null otherwise. */
  readonly averageCost = computed(() => {
    const held = this.positions().find((p) => p.symbol === this.selected().symbol && p.quantity > 0);
    return held ? held.cost : null;
  });
  /**
   * The chosen period, starting no earlier than the first recorded price: the quote history keeps
   * only recent prices, so a 1-day axis would otherwise squeeze them against the right edge.
   */
  readonly chartWindow = computed(() => {
    const period = periodWindow(this.period(), this.currentTime().getTime(), this.tradeMarks());
    const first = this.priceHistory()[0]?.at;
    return first && first > period.start && first < period.end ? { start: first, end: period.end } : period;
  });
  /** The recorded prices inside the chosen period. */
  readonly visibleHistory = computed(() => {
    const { start, end } = this.chartWindow();
    return this.priceHistory().filter((p) => p.at >= start && p.at <= end);
  });
  /** Price range covering the recorded prices, the live price, every fill and the average cost. */
  readonly chartRange = computed(() =>
    priceRange([
      this.selected().price, ...this.visibleHistory().map((p) => p.price),
      ...this.tradeMarks().map((m) => m.price), this.averageCost() ?? 0,
    ]),
  );
  /** The charted stock's price as one line across the period. */
  readonly priceLine = computed(() => {
    const range = this.chartRange();
    return range ? pricePath(this.visibleHistory(), this.chartWindow(), range, CHART_WIDTH, CHART_HEIGHT) : '';
  });
  /** When the recorded prices start, so a short history is explained rather than looking like a flat market. */
  readonly historyStart = computed(() => this.priceHistory()[0]?.at ?? null);
  readonly plottedTrades = computed(() => {
    const range = this.chartRange();
    return range ? plotMarks(this.tradeMarks(), this.chartWindow(), range, CHART_WIDTH, CHART_HEIGHT) : [];
  });
  /** Fills earlier than the chosen period, which are not drawn. */
  readonly tradesOutsidePeriod = computed(() => this.tradeMarks().length - this.plottedTrades().length);
  readonly averageCostY = computed(() => {
    const range = this.chartRange();
    const cost = this.averageCost();
    return range && cost ? priceY(cost, range, CHART_HEIGHT) : null;
  });
  readonly priceAxis = computed(() => {
    const range = this.chartRange();
    return range ? priceLabels(range) : [];
  });
  readonly chartTimes = computed(() => timeLabels(this.period(), this.chartWindow()));

  quote(symbol: string): Quote {
    return this.quotes().find((q) => q.symbol === symbol) ?? this.quotes()[0] ?? NO_QUOTE;
  }
  choose(quote: Quote): void {
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
    void this.#loadHistory(quote);
  }
  /**
   * Shows the feed's latest prices, re-values positions at the latest bids (PS-10: no separate
   * per-holding requests), and adds the charted stock's new price to its line.
   */
  #applyFeed(): void {
    const live = this.feed.quotes();
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
    if (this.#portfolio.holdings.length) {
      this.#render();
    }
    const current = this.selected();
    const quote = this.quotes().find((q) => q.symbol === (current.symbol || this.symbol()));
    if (!quote) {
      return;
    }
    if (current.price) {
      this.selected.set(quote);
      this.#addTick(quote);
    } else {
      this.setTicketQuote(quote);
    }
  }
  /** Loads the charted stock's recent prices; a failure leaves the line to build from live ticks. */
  async #loadHistory(quote: Quote): Promise<void> {
    if (!quote.instrumentId || quote.symbol === this.#historySymbol) {
      return;
    }
    this.#historySymbol = quote.symbol;
    this.priceHistory.set([]);
    try {
      const points = await this.feed.client.history(quote.instrumentId);
      if (this.#historySymbol === quote.symbol && !this.#destroyed) {
        this.priceHistory.update((ticks) => [...points, ...ticks.filter((t) => t.at > (points.at(-1)?.at ?? 0))]);
      }
    } catch {
      // The line still grows from live prices.
    }
  }
  /** Appends the latest price when it is newer than the last recorded one. */
  #addTick(quote: Quote): void {
    const at = Date.parse(quote.quotedAt);
    if (quote.symbol !== this.#historySymbol || !Number.isFinite(at) || !quote.price) {
      return;
    }
    this.priceHistory.update((points) => (points.length && points[points.length - 1].at >= at ? points : [...points, { at, price: quote.price }]));
  }
  /** A corner toast when a tracked order fills or is rejected, with the reason in plain words (PS-15). */
  async #announce(order: Order): Promise<void> {
    if (order.status === 'Filled') {
      this.toasts.show('filled', `Order filled: ${order.quantity} ${order.symbol} at $${order.price?.toFixed(2)}`);
      return;
    }
    let reason = rejectionReason(null);
    try {
      reason = rejectionMessage(await this.orderStatusClient.status(order.id));
    } catch {
      // The generic reason still tells the client where to look.
    }
    this.toasts.show('rejected', `Order rejected: ${order.quantity} ${order.symbol}`, reason);
  }
  /**
   * What the spoken briefing reads: the summary panel's figures, today's move of each position
   * from the live feed, and this account's orders. A failed order load leaves orders out.
   */
  readonly briefingSource: BriefingSource = async () => {
    let orders: OrderHistoryRow[] = [];
    try {
      orders = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
    } catch {
      // The rest of the briefing is still worth hearing.
    }
    const now = new Date(this.feed.now());
    const live = new Map(this.feed.quotes().map((q) => [q.symbol, q]));
    const held = this.positions();
    return {
      now,
      market: this.feed.status(),
      balanceHidden: this.privateBalance(),
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
  /** Opens the orders list from a toast. */
  viewOrders(): void {
    this.navigate('Activity');
  }
  navigate(page: string): void {
    this.page.set(page);
    this.routing?.go(page);
    if (page === 'Portfolio') {
      this.bottomTab.set('Positions');
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
      return 'There is no live price for this stock yet. Try again in a moment.';
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
    if (!this.message()) {
      this.openModal('review');
    }
  }
  async confirmOrder(): Promise<void> {
    const error = this.validate();
    const quote = this.selected();
    if (error) {
      this.message.set(error);
      this.closeModal();
      return;
    }
    // Check data is loaded before submitting
    if (!this.dataReady()) {
      this.message.set('Loading accounts and instruments. Please wait.');
      return;
    }
    const instrument = this.instruments().find((item) => item.symbol === quote.symbol);
    if (!instrument) {
      this.message.set(`${quote.symbol} is not available to trade yet.`);
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
        this.message.set('No active account selected.');
        return;
      }
      // Some listed quotes have no backend instrument yet; the server would reject them.
      if (!this.instruments().some((i) => i.instrumentId === quote.instrumentId)) {
        this.message.set(`${quote.symbol} is not available to trade yet.`);
        return;
      }
      const response = await this.orderSubmissionClient.submit({
        accountId: account.account_id,
        instrumentId: instrument.instrumentId,
        side: this.side() === 'Buy' ? 'BUY' : 'SELL',
        quantity: count,
        orderType: 'MARKET',
        clientReference: this.clientReference(),
        bufferPercent: this.tolerance(),
      });
      this.orderTolerance.set(null);
      this.editingTolerance.set(false);
      // Store orderId for display
      this.submittedOrderId.set(response.orderId);
      this.message.set(
        `Order ${response.orderId} submitted. Status: ${response.status}. Awaiting execution.`
      );
      // Do NOT update local positions, buyingPower, or cash - let the backend and scheduler handle it
      // Close the modal after a brief delay so user sees the message
      setTimeout(() => this.closeModal(), 1500);
      void this.trackOrder(response.orderId);
    } catch (error) {
      const msg = error instanceof OrderSubmissionError ? error.userMessage : 'Submission failed. Please try again.';
      this.message.set(msg);
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
    let rows: OrderHistoryRow[];
    try {
      rows = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not load your orders.');
      return false;
    }
    const fills = newlyFilled(this.#lastOrderRows, rows);
    this.#lastOrderRows = rows;
    this.orders.set(rows.map(toOrder));
    this.historyRows.set(rows);
    if (fills.length && this.#started && !this.#destroyed) {
      await this.refreshPortfolio();
    }
    return true;
  }
  /** Reloads cash and positions; prices come from the shared feed as they arrive. */
  async refreshPortfolio(): Promise<void> {
    try {
      const portfolio = await this.portfolioClient.load(this.selectedAccount()?.account_id);
      if (this.destroyed) { return; }
      this.applyPortfolio(portfolio);
      this.serviceDown.set(false);
    } catch (error) {
      this.serviceDown.set(true);
      this.message.set(error instanceof Error ? error.message : 'Could not load your balances.');
    }
  }
  /** Shows a loaded portfolio, valued at the latest bids already known. */
  applyPortfolio(portfolio: Portfolio): void {
    this.#portfolio = portfolio;
    this.portfolioLoaded.set(true);
    this.#render();
  }
  #render(): void {
    const valuation = valuePortfolio(this.#portfolio, this.#bids, this.#dayChanges);
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
      this.message.set(`Order ${orderId} ${order.status.toLowerCase()}.`);
      await this.#announce(order);
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) {
      this.message.set('Order is still processing. Status updates continue in Activity.');
      return;
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
      { key: 'q', value: this.query }, { key: 'period', value: this.period, allowed: this.periods },
      { key: 'symbol', value: this.symbol }, { key: 'panel', value: this.bottomTab, allowed: this.bottomTabs }, { key: 'filter', value: this.filter, allowed: ['All stocks','Gainers','Decliners'] }, { key: 'marketTab', value: this.marketTab, allowed: ['Sectors','Top Movers'] }
    ], () => {
      // Until prices load there is nothing to check the linked symbol against; the feed selects it.
      if (!this.quotes().length) { return; }
      const quote = this.quote(this.symbol());
      if (this.selected() !== quote) { this.setTicketQuote(quote); }
      if (quote.symbol !== this.symbol()) { this.message.set('That symbol is unavailable.'); }
    });
    Object.assign(this, tradingClients(this.auth, inject(ApiHttpClient)));
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
  }

  /** Another account was picked, or cash moved between accounts: show its balances, positions and orders. */
  #accountChanged(): void {
    if (!this.#started || this.#destroyed) { return; }
    this.message.set('');
    void this.refreshPortfolio();
    void this.refreshOrders();
  }

  async loadTradingData(): Promise<void> {
    try {
      this.loadingAccounts.set(true);
      this.accountState.use(await this.orderSubmissionClient.getAccounts());
    } catch (error) {
      console.error('Failed to load accounts:', error);
      this.message.set('Failed to load accounts.');
    } finally {
      this.loadingAccounts.set(false);
    }

    try {
      this.loadingInstruments.set(true);
      const instrumentsData = await this.orderSubmissionClient.getInstruments();
      this.instruments.set(instrumentsData);
    } catch (error) {
      console.error('Failed to load instruments:', error);
      this.message.set('Failed to load instruments.');
    } finally {
      this.loadingInstruments.set(false);
    }
  }
}

/** Maps a backend order-history row onto a dashboard row ("FILLED" → "Filled", "BUY" → "Buy"). */
function toOrder(row: OrderHistoryRow): Order {
  return {
    id: row.orderId,
    time: new Date(row.submittedAt).toLocaleTimeString('en-US', { hour12: false }),
    symbol: row.symbol,
    side: titleCase(row.side),
    quantity: row.quantity,
    price: row.fillPrice,
    status: titleCase(row.status),
    type: 'Market',
  };
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
