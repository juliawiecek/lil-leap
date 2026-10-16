import { ApiHttpClient } from '@lilleap/session-core/angular';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit, inject } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { OrderHistory } from './order-history';
import { OrderSubmissionClient, OrderSubmissionError, Instrument } from './order-submission-api';
import { AccountSwitcher } from './account-switcher';
import { AccountsService } from './accounts.service';
import { canTrade } from './accounts-api';
import {
  FINAL_ORDER_STATUSES,
  ORDER_TRACK_INTERVAL_MS,
  ORDER_TRACK_LIMIT_MS,
  OrderHistoryClient,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { interval, Subject, startWith, takeUntil } from 'rxjs';
import { closedMarketWarning, localOpeningTime, marketStatusText } from './market-status-api';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { ToastService, Toasts } from './toasts';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { MarketTicker } from './market-ticker';
import { tradingClients } from './trading-clients';

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
  imports: [CurrencyPipe, DatePipe, DecimalPipe, DashboardIcon, OrderHistory, AccountSwitcher, MarketTicker, Toasts, PriceProtectionSettings],
  templateUrl: './novice-dashboard.html',
  styleUrl: './novice-dashboard.scss',
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
  readonly marketOpen = computed(() => this.marketStatus()?.open ?? false);
  /** Shown on the ticket before submitting while the market is closed (PS-02). */
  readonly closedWarning = computed(() => closedMarketWarning(this.marketStatus(), this.marketClock()));
  /** The ticket's price is older than the orders service accepts (TS-14.7 AC3). */
  readonly tradePriceDelayed = computed(() => !!this.tradeQuote().price && isDelayed(this.tradeQuote().quotedAt, this.feed.now()));
  readonly #stopFeed: () => void;
  /** Corner messages when an order fills or is rejected (PS-15). */
  readonly toasts = inject(ToastService, { optional: true }) ?? new ToastService();
  declare readonly orderStatusClient: OrderStatusClient;
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
  #priceTimer: ReturnType<typeof setTimeout> | undefined;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  #bids = new Map<string, number>();
  private readonly destroy$ = new Subject<void>();
  private routing?: PageBinding;
  private destroyed = false;
  readonly symbol = signal('AAPL');
  readonly name = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('NOVICE');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  readonly activeTab = signal('Overview');
  readonly navigation = [
    { label: 'Overview', icon: 'home' },
    { label: 'Watchlist', icon: 'star' },
    { label: 'Portfolio', icon: 'chart' },
    { label: 'Orders', icon: 'orders' },
    { label: 'Settings', icon: 'settings' },
  ];
  readonly query = signal('');
  readonly period = signal('1D');
  readonly periods = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
  readonly showBalance = signal(true);
  readonly investmentTab = signal('Holdings');
  readonly notifications = signal(false);
  /** Balances and holdings, loaded from the backend and reloaded after each fill. */
  readonly portfolioValue = signal(0);
  readonly portfolioValueHistory = signal<number[]>([]);
  readonly buyingPower = signal(0);
  readonly invested = signal(0);
  readonly holdings = signal<Holding[]>([]);
  /** Every tradable stock from the backend, at its live price (TS-14.7 AC1). */
  readonly quotes = signal<Quote[]>([]);
  readonly watched = signal(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']);
  readonly watchlist = computed(() => this.quotes().filter((q) => this.watched().includes(q.symbol)));
  readonly results = computed(() =>
    this.quotes().filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly markets = [
    { name: 'S&P 500', value: '5,071.17', change: '+1.21%' },
    { name: 'Nasdaq', value: '15,611.76', change: '+1.43%' },
    { name: 'Dow Jones', value: '38,501.22', change: '+0.93%' },
  ];
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
  readonly todayReturn = computed(() => this.holdings().reduce((sum, h) => sum + h.today, 0));
  readonly todayReturnPercent = computed(() => {
    const invested = this.invested();
    return invested > 0 ? (this.todayReturn() / invested) * 100 : 0;
  });
  readonly totalReturn = computed(() => this.holdings().reduce((sum, h) => sum + h.total, 0));
  readonly totalReturnPercent = computed(() => {
    const invested = this.invested();
    return invested > 0 ? (this.totalReturn() / invested) * 100 : 0;
  });
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
  readonly chartTimes = computed(
    () =>
      ({
        '1D': ['9:30 AM', '11:00 AM', '12:30 PM', '2:00 PM', '4:00 PM'],
        '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        '1M': ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Today'],
        '3M': ['Feb', '', 'Mar', '', 'Apr'],
        '1Y': ['May', 'Aug', 'Nov', 'Feb', 'Apr'],
        ALL: ['2021', '2022', '2023', '2024', '2025'],
      })[this.period()] || [],
  );

  makePath(width: number, height: number, seed = 0, down = false): string {
    const knots = [
      0.9, 0.76, 0.78, 0.65, 0.73, 0.59, 0.49, 0.68, 0.58, 0.45, 0.51, 0.35, 0.23, 0.31, 0.26, 0.25,
      0.22, 0.1,
    ];
    return Array.from({ length: 230 }, (_, i) => {
      const t = i / 229,
        k = t * (knots.length - 1),
        low = Math.floor(k);
      let y = knots[low] + (knots[Math.min(low + 1, knots.length - 1)] - knots[low]) * (k - low);
      y +=
        Math.sin(i * 1.83 + seed) * 0.014 +
        Math.cos(i * 0.67 + seed * 2) * 0.023 +
        Math.sin(i * 0.2 + seed) * 0.022;
      if (down) {
        y = 1 - y;
      }
      return `${i ? 'L' : 'M'}${(t * width).toFixed(1)},${(y * height + 5).toFixed(1)}`;
    }).join(' ');
  }
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
        this.tradeMessage.set(`${action} ${shares} ${row.symbol} at $${row.fillPrice?.toFixed(2)}. You can see it under Orders.`);
        this.toasts.show('filled', `Order filled: ${shares} ${row.symbol} at $${row.fillPrice?.toFixed(2)}`);
        return;
      }
      const reason = await this.#rejectionReason(orderId);
      this.tradeMessage.set(`Your order was not filled. ${reason}`);
      this.toasts.show('rejected', `Order rejected: ${row.quantity} ${row.symbol}`, reason);
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) {
      this.tradeMessage.set('Your order is still being processed. Check Orders for its status.');
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
      { key: 'q', value: this.query }, { key: 'period', value: this.period, allowed: this.periods },
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
    clearTimeout(this.#priceTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }
  /**
   * Reloads buying power and holdings, prices them, and keeps re-pricing them while any are
   * held. A failure keeps the last values shown.
   */
  async refreshPortfolio(): Promise<void> {
    try {
      const portfolio = await this.portfolioClient.load(this.selectedAccount()?.account_id);
      if (this.destroyed) { return; }
      this.applyPortfolio(portfolio);
    } catch {
      // The trade dialog already reports order problems; balances refresh again after the next fill.
      return;
    }
    await this.refreshPrices();
    this.#schedulePrices();
  }
  /** Shows a loaded portfolio, valued at the latest bids already known. */
  applyPortfolio(portfolio: Portfolio): void {
    this.#portfolio = portfolio;
    this.#render();
  }
  /** Re-values holdings at their latest bids; a failed quote keeps the last price. */
  async refreshPrices(): Promise<void> {
    const ids = this.#portfolio.holdings.map((h) => h.instrumentId);
    if (!ids.length) {
      return;
    }
    try {
      const bids = await this.portfolioClient.latestBids(ids);
      for (const [id, bid] of bids) {
        this.#bids.set(id, bid);
      }
      this.#render();
    } catch {
      // Keep showing the last known values; the next tick retries.
    }
  }
  #schedulePrices(): void {
    if (this.destroyed) { return; }
    clearTimeout(this.#priceTimer);
    if (!this.#portfolio.holdings.length) {
      return;
    }
    this.#priceTimer = setTimeout(async () => {
      await this.refreshPrices();
      this.#schedulePrices();
    }, QUOTE_REFRESH_MS);
  }
  #render(): void {
    const valuation = valuePortfolio(this.#portfolio, this.#bids);
    this.holdings.set(
      valuation.holdings.map((h) => ({
        symbol: h.symbol,
        name: h.instrumentName,
        value: h.value,
        shares: h.quantity,
        average: h.averageCost,
        today: h.gain,
        change: h.gainPercent,
        total: h.gain,
        totalPercent: h.gainPercent,
        logo: LOGOS[h.symbol] ?? '',
      })),
    );
    this.buyingPower.set(valuation.cash);
    this.invested.set(valuation.holdingsValue);
    this.portfolioValue.set(valuation.total);
    this.portfolioValueHistory.update(history => [...history, valuation.total].slice(-60));
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
  }

  /** Another account was picked, or cash moved between accounts: show its balances and holdings. */
  #accountChanged(): void {
    if (!this.#started || this.destroyed) { return; }
    this.reviewing.set(false);
    this.tradeMessage.set('');
    void this.refreshPortfolio();
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
    this.navigate('History');
  }

  /** Shows the feed's latest prices and keeps the open ticket on its stock's live price. */
  #applyFeed(): void {
    this.quotes.set(
      this.feed.quotes().map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, change: q.change, quotedAt: q.quotedAt })),
    );
    const symbol = this.tradeQuote().symbol || this.symbol();
    const live = this.quotes().find((q) => q.symbol === symbol);
    if (live) { this.tradeQuote.set(live); }
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
