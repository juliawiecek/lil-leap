import { Component, computed, ElementRef, input, output, signal, viewChild, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { AdvancedTicket } from './advanced-ticket';
import { AdvancedChart } from './advanced-chart';
import { OrderHistory } from './order-history';
import { OrderSubmissionClient, OrderSubmissionError, Account, Instrument } from './order-submission-api';
import {
  FINAL_ORDER_STATUSES,
  ORDER_TRACK_INTERVAL_MS,
  ORDER_TRACK_LIMIT_MS,
  OrderHistoryClient,
  OrderHistoryRow,
} from './order-history-api';
import { Portfolio, PortfolioClient, QUOTE_REFRESH_MS, valuePortfolio } from './portfolio-api';
import { AuthService } from './auth.service';

interface Quote {
  instrumentId: string;  // ← NOW PRESERVED
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: string;
}
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
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon, AdvancedTicket, AdvancedChart, OrderHistory],
  templateUrl: './advanced-dashboard.html',
  styleUrl: './advanced-dashboard.scss',
})
export class AdvancedDashboard implements OnInit, OnDestroy {
  readonly orderSubmissionClient: OrderSubmissionClient;
  orderSubmissionClient: OrderSubmissionClient;
  orderHistoryClient: OrderHistoryClient;
  portfolioClient: PortfolioClient;
  #trackTimer: ReturnType<typeof setTimeout> | undefined;
  #priceTimer: ReturnType<typeof setTimeout> | undefined;
  #portfolio: Portfolio = { cash: 0, holdings: [] };
  #bids = new Map<string, number>();
  readonly name = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('ADVANCED');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
  readonly submitting = signal(false);
  readonly submittedOrderId = signal<string | null>(null);
  readonly clientReference = signal<string>('');
  readonly accounts = signal<Account[]>([]);
  readonly instruments = signal<Instrument[]>([]);
  readonly selectedAccount = signal<Account | null>(null);
  readonly loadingAccounts = signal(false);
  readonly loadingInstruments = signal(false);
  readonly dataReady = computed(() => this.accounts().length > 0 && this.instruments().length > 0);
  readonly nav = [
    { name: 'Overview', icon: 'home' },
    { name: 'Watchlist', icon: 'star' },
    { name: 'Portfolio', icon: 'chart' },
    { name: 'Orders', icon: 'orders' },
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
  readonly quotes: Quote[] = [
    { instrumentId: 'aapl-uuid', symbol: 'AAPL', name: 'Apple Inc.', price: 176.56, change: 1.85, volume: '48.2M' },
    { instrumentId: 'nvda-uuid', symbol: 'NVDA', name: 'NVIDIA Corporation', price: 893.12, change: 2.36, volume: '32.8M' },
    { instrumentId: 'msft-uuid', symbol: 'MSFT', name: 'Microsoft Corporation', price: 424.31, change: 0.72, volume: '18.4M' },
    { instrumentId: 'amd-uuid', symbol: 'AMD', name: 'Advanced Micro Devices', price: 162.14, change: 3.21, volume: '36.1M' },
    { instrumentId: 'tsla-uuid', symbol: 'TSLA', name: 'Tesla, Inc.', price: 142.2, change: -1.24, volume: '45.7M' },
    { instrumentId: 'meta-uuid', symbol: 'META', name: 'Meta Platforms, Inc.', price: 521.48, change: -0.37, volume: '12.6M' },
    { instrumentId: 'amzn-uuid', symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.34, change: 1.21, volume: '28.7M' },
    { instrumentId: 'googl-uuid', symbol: 'GOOGL', name: 'Alphabet Inc.', price: 155.91, change: 0.62, volume: '20.1M' },
  ];
  readonly selected = signal(this.quotes[0]);
  readonly results = computed(() =>
    this.quotes.filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly screened = computed(() =>
    this.quotes.filter((q) => {
      if (this.filter() === 'Gainers') return q.change > 0;
      return this.filter() !== 'Decliners' || q.change < 0;
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
  readonly news: NewsItem[] = [
    { symbol: 'AAPL', time: '2:45 PM', title: 'Apple releases new M4 chip', source: 'Reuters' },
    { symbol: 'NVDA', time: '1:32 PM', title: 'NVIDIA beats Q3 earnings expectations', source: 'Bloomberg' },
    { symbol: 'MSFT', time: '12:15 PM', title: 'Microsoft expands cloud services', source: 'CNBC' },
  ];
  readonly article = signal(0);
  readonly executions = computed(() => this.orders().filter((order) => order.status === 'Filled'));
  readonly filteredOrders = computed(() => {
    const status = this.orderStatus();
    if (status === 'All') return this.orders();
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
    const seed = this.periods.indexOf(this.period()) + this.quotes.indexOf(this.selected()) * 2;
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
  readonly chartTimes = computed(() => {
    if (this.period() === '1D')
      return ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
    return this.period() === '1W'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  });
  quote(symbol: string): Quote {
    return this.quotes.find((q) => q.symbol === symbol) || this.quotes[0];
  }
  choose(quote: Quote): void {
    this.selected.set(quote);
    this.limitPrice.set(quote.price.toFixed(2));
    this.profitPrice.set((quote.price * 1.05).toFixed(2));
    this.stopPrice.set((quote.price * 0.95).toFixed(2));
    this.alertPrice.set((quote.price * 1.02).toFixed(2));
    this.query.set('');
    this.message.set('');
    this.page.set('Overview');
  }
  navigate(page: string): void {
    this.page.set(page);
    if (page === 'Portfolio') this.bottomTab.set('Positions');
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
    if (event.target === this.dialog()?.nativeElement) this.closeModal();
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
    if (!Number.isSafeInteger(count) || count <= 0)
      return 'Enter a whole number of shares greater than zero.';
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(this.total()))
      return 'Enter a valid order price.';
    if (this.side() === 'Buy' && this.total() > this.buyingPower())
      return 'This order exceeds your buying power.';
    if (
      this.side() === 'Sell' &&
      count > (this.positions().find((p) => p.symbol === this.selected().symbol)?.quantity || 0)
    )
      return 'You can only sell shares you hold.';
    if (
      this.takeProfit() &&
      (!Number.isFinite(Number(this.profitPrice())) || Number(this.profitPrice()) <= price)
    )
      return 'Take profit must be above the order price.';
    if (
      this.stopLoss() &&
      (!Number.isFinite(Number(this.stopPrice())) ||
        Number(this.stopPrice()) <= 0 ||
        Number(this.stopPrice()) >= price)
    )
      return 'Stop loss must be positive and below the order price.';
    return '';
  }
  reviewOrder(): void {
    this.message.set(this.validate());
    if (!this.message()) this.openModal('review');
  }
  async confirmOrder(): Promise<void> {
    const error = this.validate();
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
    // Prevent double-click while submission is in flight
    if (this.submitting()) return;
    this.submitting.set(true);
    try {
      const quote = this.selected();
      const count = Number(this.quantity());
      const account = this.selectedAccount();
      if (!account) {
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
        instrumentId: quote.instrumentId,
        side: this.side() === 'Buy' ? 'BUY' : 'SELL',
        quantity: count,
        orderType: 'MARKET',
        clientReference: this.clientReference(),
      });
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
      const rows = await this.orderHistoryClient.list();
      this.orders.set(rows.map(toOrder));
      return true;
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not load your orders.');
      return false;
    }
  }
  /** Reloads cash and positions, prices them, and keeps re-pricing them while any are held. */
  async refreshPortfolio(): Promise<void> {
    try {
      this.applyPortfolio(await this.portfolioClient.load());
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
    if (!(await this.refreshOrders())) return;
    const order = this.orders().find((o) => o.id === orderId);
    if (order && FINAL_ORDER_STATUSES.has(order.status.toUpperCase())) {
      // Reload balances first so a load error never replaces the fill message.
      if (order.status === 'Filled') await this.refreshPortfolio();
      this.message.set(`Order ${orderId} ${order.status.toLowerCase()}.`);
      return;
    }
    if (Date.now() - startedAt >= ORDER_TRACK_LIMIT_MS) return;
    this.#trackTimer = setTimeout(() => void this.trackOrder(orderId, startedAt), ORDER_TRACK_INTERVAL_MS);
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
    this.orderSubmissionClient = new OrderSubmissionClient(this.auth);
    this.orderHistoryClient = new OrderHistoryClient(this.auth);
    this.portfolioClient = new PortfolioClient(this.auth);
  }

  ngOnDestroy(): void {
    clearTimeout(this.#trackTimer);
    clearTimeout(this.#priceTimer);
  }

  ngOnInit(): void {
    void this.loadTradingData();
  }

  async loadTradingData(): Promise<void> {
    try {
      this.loadingAccounts.set(true);
      const accountsData = await this.orderSubmissionClient.getAccounts();
      const activeAccount = accountsData.find((a) => a.account_status === 'ACTIVE' && a.trading_enabled);
      this.accounts.set(accountsData);
      this.selectedAccount.set(activeAccount || null);
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
      // Update quotes with real instrumentIds from backend
      for (const quote of this.quotes) {
        const instrument = instrumentsData.find((i) => i.symbol === quote.symbol);
        if (instrument) {
          quote.instrumentId = instrument.instrumentId;
        }
      }
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
