import { Component, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { NoviceLearn } from './novice-learn';
import { OrderHistory } from './order-history';
import { OrderSubmissionClient, OrderSubmissionError, Account, Instrument } from './order-submission-api';
import {
  FINAL_ORDER_STATUSES,
  ORDER_TRACK_INTERVAL_MS,
  ORDER_TRACK_LIMIT_MS,
  OrderHistoryClient,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';

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
}

@Component({
  selector: 'app-novice-dashboard',
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon, NoviceLearn, OrderHistory],
  templateUrl: './novice-dashboard.html',
  styleUrl: './novice-dashboard.scss',
})
export class NoviceDashboard implements OnInit, OnDestroy {
  orderSubmissionClient: OrderSubmissionClient;
  orderHistoryClient: OrderHistoryClient;
  portfolioClient: PortfolioClient;
  #trackTimer: ReturnType<typeof setTimeout> | undefined;
  #priceTimer: ReturnType<typeof setTimeout> | undefined;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  #bids = new Map<string, number>();
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
    { label: 'Learn', icon: 'learn' },
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
  readonly buyingPower = signal(0);
  readonly invested = signal(0);
  readonly holdings = signal<Holding[]>([]);
  readonly quotes: Quote[] = [
    { symbol: 'AAPL', name: 'Apple Inc.', price: 176.56, change: 1.98 },
    { symbol: 'TSLA', name: 'Tesla, Inc.', price: 142.2, change: -0.84 },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.34, change: 1.21 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 155.91, change: 0.62 },
    { symbol: 'META', name: 'Meta Platforms, Inc.', price: 521.48, change: -0.37 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', price: 276.57, change: 1.98 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 278.09, change: 5.34 },
  ];
  readonly watched = signal(['AAPL', 'TSLA', 'AMZN', 'GOOGL', 'META']);
  readonly watchlist = computed(() => this.quotes.filter((q) => this.watched().includes(q.symbol)));
  readonly results = computed(() =>
    this.quotes.filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly markets = [
    { name: 'S&P 500', value: '5,071.17', change: '+1.21%' },
    { name: 'Nasdaq', value: '15,611.76', change: '+1.43%' },
    { name: 'Dow Jones', value: '38,501.22', change: '+0.93%' },
  ];
  readonly modal = signal('trade');
  readonly tradeQuote = signal(this.quotes[0]);
  readonly side = signal('Buy');
  readonly quantity = signal('');
  readonly reviewing = signal(false);
  readonly tradeMessage = signal('');
  readonly submitting = signal(false);
  /** Idempotency key for the order being reviewed; a retried confirm reuses it. */
  readonly clientReference = signal('');
  readonly selectedAccount = signal<Account | null>(null);
  readonly instruments = signal<Instrument[]>([]);
  readonly tradeTotal = computed(() => Number(this.quantity()) * this.tradeQuote().price);
  readonly chartPath = computed(() => this.makePath(780, 133, this.periods.indexOf(this.period())));
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
      if (down) y = 1 - y;
      return `${i ? 'L' : 'M'}${(t * width).toFixed(1)},${(y * height + 5).toFixed(1)}`;
    }).join(' ');
  }
  navigate(tab: string): void {
    this.activeTab.set(tab);
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
    if (event.target === this.dialog()?.nativeElement) this.closeModal();
  }
  /** Stocks the trade dialog offers: those the backend can trade, or every quote until instruments load. */
  readonly tradableQuotes = computed(() => {
    const symbols = new Set(this.instruments().map((i) => i.symbol));
    return symbols.size ? this.quotes.filter((q) => symbols.has(q.symbol)) : this.quotes;
  });
  /**
   * Opens the trade dialog. Without a symbol, a sell starts on the first stock the user holds
   * and a buy on the first tradable stock; the dialog's picker can change it.
   */
  openTrade(side = 'Buy', symbol?: string): void {
    const start = symbol ?? (side === 'Sell' ? this.holdings()[0]?.symbol : undefined) ?? this.tradableQuotes()[0]?.symbol;
    this.tradeQuote.set(this.quotes.find((q) => q.symbol === start) || this.quotes[0]);
    this.side.set(side);
    this.quantity.set('');
    this.reviewing.set(false);
    this.tradeMessage.set('');
    this.query.set('');
    this.openModal('trade');
  }
  /** Switches the open trade to another stock and drops any review of the previous one. */
  chooseTradeSymbol(symbol: string): void {
    const quote = this.quotes.find((q) => q.symbol === symbol);
    if (!quote) return;
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
  reviewTrade(): void {
    const count = Number(this.quantity());
    const held = this.holdings().find((h) => h.symbol === this.tradeQuote().symbol)?.shares || 0;
    let error = '';
    if (!Number.isSafeInteger(count) || count < 1) {
      error = 'Enter a whole number of shares greater than zero.';
    } else if (this.side() === 'Buy' && this.tradeTotal() > this.buyingPower()) {
      error = 'This order exceeds your buying power.';
    } else if (this.side() === 'Sell' && count > held) {
      error = 'You can only sell shares you hold.';
    }
    const startingReview = !this.reviewing();

    this.tradeMessage.set(error);
    this.reviewing.set(!error);
    if (!error && startingReview) this.clientReference.set(OrderSubmissionClient.generateClientReference());
  }
  /**
   * Sends the reviewed order to the backend. Holdings and buying power are not changed
   * here: the backend fills the order, and its progress is shown until it settles.
   */
  async confirmTrade(): Promise<void> {
    this.reviewTrade();
    if (!this.reviewing() || this.submitting()) return;
    const quote = this.tradeQuote();
    const account = this.selectedAccount();
    const instrument = this.instruments().find((i) => i.symbol === quote.symbol);
    if (!account) {
      this.tradeMessage.set('We could not find an active trading account for you.');
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
      });
      this.reviewing.set(false);
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
      if (row.status === 'FILLED') await this.refreshPortfolio();
      const action = row.side === 'SELL' ? 'Sold' : 'Bought';
      this.tradeMessage.set(
        row.status === 'FILLED'
          ? `${action} ${row.filledQuantity ?? row.quantity} ${row.symbol} at $${row.fillPrice?.toFixed(2)}. You can see it under Orders.`
          : 'Your order was not filled. You can see why under Orders.',
      );
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) {
      this.tradeMessage.set('Your order is still being processed. Check Orders for its status.');
      return;
    }
    if (row?.status === 'ACCEPTED') this.tradeMessage.set('Order accepted. Waiting for it to fill…');
    this.#trackTimer = setTimeout(() => void this.trackOrder(orderId, startedAt), ORDER_TRACK_INTERVAL_MS);
  }
  constructor(private auth: AuthService) {
    this.orderSubmissionClient = new OrderSubmissionClient(this.auth);
    this.orderHistoryClient = new OrderHistoryClient(this.auth);
    this.portfolioClient = new PortfolioClient(this.auth);
  }
  ngOnDestroy(): void {
    clearTimeout(this.#trackTimer);
    clearTimeout(this.#priceTimer);
  }
  /**
   * Reloads buying power and holdings, prices them, and keeps re-pricing them while any are
   * held. A failure keeps the last values shown.
   */
  async refreshPortfolio(): Promise<void> {
    try {
      this.applyPortfolio(await this.portfolioClient.load());
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
    if (!ids.length) return;
    try {
      const bids = await this.portfolioClient.latestBids(ids);
      for (const [id, bid] of bids) this.#bids.set(id, bid);
      this.#render();
    } catch {
      // Keep showing the last known values; the next tick retries.
    }
  }
  #schedulePrices(): void {
    clearTimeout(this.#priceTimer);
    if (!this.#portfolio.holdings.length) return;
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
        today: 0,
        change: 0,
        total: h.gain,
        totalPercent: h.gainPercent,
        logo: LOGOS[h.symbol] ?? '',
      })),
    );
    this.buyingPower.set(valuation.cash);
    this.invested.set(valuation.holdingsValue);
    this.portfolioValue.set(valuation.total);
  }
  /** Loads the account and instrument ids an order needs; a failure surfaces when the user confirms. */
  async ngOnInit(): Promise<void> {
    void this.refreshPortfolio();
    try {
      const accounts = await this.orderSubmissionClient.getAccounts();
      this.selectedAccount.set(accounts.find((a) => a.account_status === 'ACTIVE' && a.trading_enabled) ?? null);
      this.instruments.set(await this.orderSubmissionClient.getInstruments());
    } catch {
      // confirmTrade reports the missing account or instrument in plain words.
    }
  }
}
