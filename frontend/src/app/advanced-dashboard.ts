import { ApiHttpClient } from '@lilleap/session-core/angular';
import { PageState, PAGE_PATHS, PageBinding } from './page-state';
import { Component, inject, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { AdvancedTicket } from './advanced-ticket';
import { AdvancedChart } from './advanced-chart';
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
  OrderHistoryRow,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';
import { MarketFeed } from './market-feed.service';
import { isDelayed } from './market-feed-api';
import { MarketTicker } from './market-ticker';
import { closedMarketWarning, localOpeningTime, marketBadgeText } from './market-status-api';
import { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason } from './order-feedback';
import { PriceProtectionStore, protectionText, validProtection } from './price-protection';
import { PriceProtectionSettings } from './price-protection-settings';
import { ToastService, Toasts } from './toasts';
import { tradingClients } from './trading-clients';
import { BriefingButton, BriefingSource } from './briefing-button';
import { SwitchScanService } from './switch-scan';
import { SwitchScanSettings } from './switch-scan-settings';
import { periodWindow, plotMarks, priceLabels, priceRange, priceY, timeLabels, tradeMarks } from './trade-marks';

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
  day: number;
  total: number;
  weight: number;
}
/** One row of the Orders/Executions tabs, built from the backend's order history. */
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
interface NewsItem {
  symbol: string;
  time: string;
  title: string;
  source: string;
}

@Component({
  selector: 'app-advanced-dashboard',
  imports: [
    CurrencyPipe, DecimalPipe, DashboardIcon, AdvancedTicket, AdvancedChart, OrderHistory, AccountSwitcher, MarketTicker, Toasts,
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
  #priceTimer: ReturnType<typeof setTimeout> | undefined;
  #clockTimer: ReturnType<typeof setInterval> | undefined;
  #ordersPollTimer: ReturnType<typeof setTimeout> | undefined;
  #destroyed = false;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  #bids = new Map<string, number>();
  readonly name = input('');
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
    { name: 'Watchlist', icon: 'star' },
    { name: 'Portfolio', icon: 'chart' },
    { name: 'Orders', icon: 'orders' },
    { name: 'History', icon: 'orders' },
    { name: 'Markets', icon: 'chart' },
    { name: 'Screeners', icon: 'search' },
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
  readonly bottomTabs = ['Positions', 'Orders', 'Executions', 'Balances', 'Performance'];
  readonly orderStatus = signal('All');
  readonly ticketTab = signal('Trade');
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
  /** Unrealised gain across positions at the latest bids, in USD and as % of cost. */
  readonly totalReturn = signal(0);
  readonly totalReturnPercent = signal(0);
  readonly markets = [
    { name: 'S&P 500', value: '5,071.32', change: '+1.21%' },
    { name: 'Nasdaq', value: '15,628.17', change: '+1.43%' },
    { name: 'Dow Jones', value: '38,501.22', change: '+0.93%' },
    { name: 'Russell 2000', value: '2,004.36', change: '+1.08%' },
  ];
  readonly sectors = [
    { name: 'Technology', change: 1.82 },
    { name: 'Communication Services', change: 1.26 },
    { name: 'Consumer Discretionary', change: 1.14 },
    { name: 'Financials', change: 0.93 },
    { name: 'Industrials', change: 0.71 },
    { name: 'Healthcare', change: 0.28 },
    { name: 'Consumer Staples', change: 0.24 },
    { name: 'Energy', change: -0.36 },
    { name: 'Utilities', change: -0.42 },
    { name: 'Real Estate', change: -0.58 },
  ];
  /** The signed-in user's orders, newest first, loaded from the backend. */
  readonly orders = signal<Order[]>([]);
  readonly side = signal('Buy');
  readonly news: NewsItem[] = [];
  readonly article = signal(0);
  readonly executions = computed(() => this.orders().filter((order) => order.status === 'Filled'));
  readonly filteredOrders = computed(() => {
    const status = this.orderStatus();
    if (status === 'All') {
      return this.orders();
    }
    return this.orders().filter((order) => order.status === status);
  });
  readonly orderType = signal('Limit');
  readonly quantity = signal('100');
  readonly limitPrice = signal('176.50');
  readonly tif = signal('Day');
  readonly takeProfit = signal(false);
  readonly stopLoss = signal(false);
  readonly profitPrice = signal('185.00');
  readonly stopPrice = signal('170.00');
  readonly message = signal('');
  readonly modal = signal('review');
  readonly alertPrice = signal('180.00');
  readonly alerts = signal<{ symbol: string; price: number }[]>([]);
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
  readonly cost = computed(
    () =>
      Number(this.quantity()) *
      (this.orderType() === 'Limit' ? Number(this.limitPrice()) : this.selected().price),
  );
  readonly fees = computed(() => Math.floor(Math.max(0, this.cost()) * 0.01) / 100);
  readonly total = computed(() => this.cost() + this.fees());
  readonly candles = computed(() => {
    const anchors = [
      179.8, 172, 167.5, 171, 167.2, 169.9, 166.5, 170.5, 165.9, 171, 172.9, 169.6, 170.8, 170.1,
      172.5, 172.9, 173.1, 175.4, 173.5, 174.6, 177.4, 174.5, 177, 175.2, 176.56,
    ];
    const seed = this.periods.indexOf(this.period()) + this.quotes().findIndex((q) => q.symbol === this.selected().symbol) * 2;
    return Array.from({ length: 108 }, (_, i) => {
      const step = (i / 107) * (anchors.length - 1),
        j = Math.floor(step);
      const close =
        anchors[j] +
        (anchors[Math.min(j + 1, anchors.length - 1)] - anchors[j]) * (step - j) +
        Math.sin(i * 1.71 + seed) * 0.35;
      const open = close + Math.sin(i * 2.3 + seed) * 0.95;
      const y = (price: number) => 12 + (181.5 - price) * 8.55;
      return {
        x: 5 + i * 7.55,
        open: y(open),
        close: y(close),
        high: y(Math.max(open, close) + 0.35 + Math.abs(Math.sin(i)) * 0.5),
        low: y(Math.min(open, close) - 0.45),
        up: close >= open,
        volume: 9 + Math.abs(Math.sin(i * 1.4)) * 12 + (i < 12 ? 30 * Math.abs(Math.cos(i)) : 0),
      };
    });
  });
  readonly rsiPath = computed(() =>
    this.candles()
      .map(
        (c, i) =>
          `${i ? 'L' : 'M'}${c.x},${(24 + Math.sin(i * 0.17) * 6 + Math.sin(i * 1.8) * 3 + (i < 20 ? 5 : -i * 0.07)).toFixed(1)}`,
      )
      .join(' '),
  );
  /** Order history rows, kept for the chart's trade markers (PS-13). */
  readonly historyRows = signal<OrderHistoryRow[]>([]);
  /** The client's fills of the charted stock, oldest first. */
  readonly tradeMarks = computed(() => tradeMarks(this.historyRows(), this.selected().symbol));
  /** Average cost of the charted stock while it is held; null otherwise. */
  readonly averageCost = computed(() => {
    const held = this.positions().find((p) => p.symbol === this.selected().symbol && p.quantity > 0);
    return held ? held.cost : null;
  });
  readonly chartWindow = computed(() => periodWindow(this.period(), this.currentTime().getTime(), this.tradeMarks()));
  /** Price range covering the live price, every fill and the average cost. */
  readonly chartRange = computed(() =>
    priceRange([this.selected().price, ...this.tradeMarks().map((m) => m.price), this.averageCost() ?? 0]),
  );
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
    this.limitPrice.set(quote.price.toFixed(2));
    this.profitPrice.set((quote.price * 1.05).toFixed(2));
    this.stopPrice.set((quote.price * 0.95).toFixed(2));
    this.alertPrice.set((quote.price * 1.02).toFixed(2));
  }
  /** Shows the feed's latest prices; the ticket keeps its stock, and gets its first price once listed. */
  #applyFeed(): void {
    this.quotes.set(
      this.feed.quotes().map((q) => ({
        instrumentId: q.instrumentId, symbol: q.symbol, name: q.name, price: q.price,
        change: q.change, sector: q.sector, quotedAt: q.quotedAt,
      })),
    );
    const current = this.selected();
    const live = this.quotes().find((q) => q.symbol === (current.symbol || this.symbol()));
    if (!live) {
      return;
    }
    if (current.price) {
      this.selected.set(live);
    } else {
      this.setTicketQuote(live);
    }
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
    this.navigate('Orders');
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
  spark(seed: number, down = false): string {
    return Array.from(
      { length: 40 },
      (_, i) =>
        `${i ? 'L' : 'M'}${i * 2},${(down ? 5 + i * 0.35 : 21 - i * 0.35) + Math.sin(i * 1.7 + seed) * 1.2 + Math.cos(i * 0.7 + seed) * 1.5}`,
    ).join(' ');
  }
  validate(): string {
    const count = Number(this.quantity()),
      price = this.orderType() === 'Limit' ? Number(this.limitPrice()) : this.selected().price;
    if (!Number.isSafeInteger(count) || count <= 0) {
      return 'Enter a whole number of shares greater than zero.';
    }
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(this.total())) {
      return 'Enter a valid order price.';
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
    if (
      this.takeProfit() &&
      (!Number.isFinite(Number(this.profitPrice())) || Number(this.profitPrice()) <= price)
    ) {
      return 'Take profit must be above the order price.';
    }
    if (
      this.stopLoss() &&
      (!Number.isFinite(Number(this.stopPrice())) ||
        Number(this.stopPrice()) <= 0 ||
        Number(this.stopPrice()) >= price)
    ) {
      return 'Stop loss must be positive and below the order price.';
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

  /** Reloads the Orders and Executions tabs from the backend; false when the load failed. */
  async refreshOrders(): Promise<boolean> {
    try {
      const rows = await this.orderHistoryClient.list({ accountId: this.selectedAccount()?.account_id });
      this.orders.set(rows.map(toOrder));
      this.historyRows.set(rows);
      return true;
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not load your orders.');
      return false;
    }
  }
  /** Reloads cash and positions, prices them, and keeps re-pricing them while any are held. */
  async refreshPortfolio(): Promise<void> {
    try {
      const portfolio = await this.portfolioClient.load(this.selectedAccount()?.account_id);
      if (this.destroyed) { return; }
      this.applyPortfolio(portfolio);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not load your balances.');
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
  /** Re-values the held positions at their latest bids; a failed quote keeps the last price. */
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
    this.buyingPower.set(valuation.cash);
    this.portfolio.set(valuation.total);
    this.totalReturn.set(valuation.gain);
    this.totalReturnPercent.set(valuation.gainPercent);
    this.positions.set(
      valuation.holdings.map((h) => ({
        symbol: h.symbol,
        price: h.price,
        quantity: h.quantity,
        cost: h.averageCost,
        value: h.value,
        day: 0,
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
      this.message.set('Order is still processing. Status updates continue in Orders.');
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
    }, 5000);
  }
  createAlert(): void {
    const price = Number(this.alertPrice());
    if (!Number.isFinite(price) || price <= 0) {
      this.message.set('Enter a positive alert price.');
      return;
    }
    this.alerts.update((list) => [...list, { symbol: this.selected().symbol, price }]);
    this.message.set('Price alert added.');
  }
  constructor(private readonly auth: AuthService) {
    this.routing = inject(PageState, { optional: true })?.connect(this.page, PAGE_PATHS, [
      { key: 'q', value: this.query }, { key: 'period', value: this.period, allowed: this.periods },
      { key: 'symbol', value: this.symbol }, { key: 'panel', value: this.bottomTab, allowed: this.bottomTabs }, { key: 'orderStatus', value: this.orderStatus, allowed: ['All','Submitted','Accepted','Pending','Delayed','Filled','Rejected'] }, { key: 'filter', value: this.filter, allowed: ['All stocks','Gainers','Decliners'] }, { key: 'marketTab', value: this.marketTab, allowed: ['Sectors','Top Movers','52W High/Low'] }
    ], () => {
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
    clearTimeout(this.#priceTimer);
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
