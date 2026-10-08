import { Component, computed, ElementRef, input, output, signal, viewChild, OnInit, OnDestroy, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { AdvancedTicket } from './advanced-ticket';
import { AdvancedChart } from './advanced-chart';
import { OrderHistory } from './order-history';
import { OrderSubmissionClient, OrderSubmissionError, Account, Instrument } from './order-submission-api';
import { AuthService } from './auth.service';
import { QuoteService } from './quote.service';
import { HoldingsService } from './holdings.service';
import { interval, Subject, takeUntil, switchMap, startWith } from 'rxjs';

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
  quantity: number;
  cost: number;
  value: number;
  day: number;
  total: number;
  weight: number;
}
interface Order {
  id: number;
  time: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  type: string;
  tif: string;
  takeProfit?: number;
  stopLoss?: number;
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
  private readonly quoteService = inject(QuoteService);
  private readonly holdingsService = inject(HoldingsService);
  private readonly destroy$ = new Subject<void>();
  
  orderSubmissionClient: OrderSubmissionClient;
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
  
  // Supported instruments: AAPL, TSLA, AMZN, GOOGL, META, MSFT, NVDA (all NASDAQ)
  private readonly supportedInstruments = [
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ' },
    { symbol: 'TSLA', name: 'Tesla, Inc.', market: 'NASDAQ' },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.', market: 'NASDAQ' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'NASDAQ' },
    { symbol: 'META', name: 'Meta Platforms, Inc.', market: 'NASDAQ' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', market: 'NASDAQ' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'NASDAQ' },
  ];
  
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
  
  // LIVE QUOTE DATA - fetched from API every 5 seconds
  readonly quotesList = signal<Quote[]>([]);
  readonly selected = signal<Quote | null>(null);
  
  // LIVE PORTFOLIO DATA - fetched from API every 5 seconds
  readonly portfolioValue = signal(0);
  readonly buyingPower = signal(0);
  readonly invested = signal(0);
  readonly positions = signal<Position[]>([]);
  
  // Current time - updated every second
  readonly currentTime = signal(new Date());
  readonly formattedTime = computed(() => {
    const now = this.currentTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    const time = `${hours}:${mins}:${secs}`;
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[now.getDay()];
    const month = months[now.getMonth()];
    const date = now.getDate();
    const year = now.getFullYear();
    const dateStr = `${dayName}, ${month} ${date}, ${year}`;
    
    return { time, dateStr };
  });
  
  readonly results = computed(() =>
    this.quotesList().filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  
  readonly screened = computed(() =>
    this.quotesList().filter((q) =>
      this.filter() === 'Gainers'
        ? q.change > 0
        : this.filter() === 'Decliners'
          ? q.change < 0
          : true,
    ),
  );
  // Markets should be fetched from real market data API, not hardcoded
  readonly markets = [
    { name: 'S&P 500', value: '—', change: '—' },
    { name: 'Nasdaq', value: '—', change: '—' },
    { name: 'Dow Jones', value: '—', change: '—' },
    { name: 'Russell 2000', value: '—', change: '—' },
  ];
  // Sectors should be computed from real market data, not hardcoded
  readonly sectors = [
    { name: 'Technology', change: 0 },
    { name: 'Communication Services', change: 0 },
    { name: 'Consumer Discretionary', change: 0 },
    { name: 'Financials', change: 0 },
    { name: 'Industrials', change: 0 },
    { name: 'Healthcare', change: 0 },
    { name: 'Consumer Staples', change: 0 },
    { name: 'Energy', change: 0 },
    { name: 'Utilities', change: 0 },
    { name: 'Real Estate', change: 0 },
  ];
  // Orders are fetched from backend for existing accounts or empty for new accounts
  readonly orders = signal<Order[]>([]);
  readonly side = signal('Buy');
  // News should be fetched from a real news API, not hardcoded
  readonly news: NewsItem[] = [];
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
    () => {
      const sel = this.selected();
      if (!sel) return 0;
      return Number(this.quantity()) *
        (this.orderType() === 'Limit' ? Number(this.limitPrice()) : sel.price);
    }
  );
  readonly fees = computed(() => Math.floor(Math.max(0, this.cost()) * 0.01) / 100);
  readonly total = computed(() => this.cost() + this.fees());
  
  // Generate candles based on current selected quote price
  readonly candles = computed(() => {
    const sel = this.selected();
    if (!sel) return [];
    
    const basePrice = sel.price;
    const anchors = [
      basePrice * 0.98,
      basePrice * 0.97,
      basePrice * 0.96,
      basePrice * 0.97,
      basePrice * 0.96,
      basePrice * 0.97,
      basePrice * 0.98,
      basePrice * 0.99,
      basePrice * 0.98,
      basePrice * 0.99,
      basePrice * 1.00,
      basePrice * 0.99,
      basePrice * 1.01,
      basePrice * 1.00,
      basePrice * 1.02,
      basePrice * 1.01,
      basePrice * 1.02,
      basePrice * 1.03,
      basePrice * 1.02,
      basePrice * 1.03,
      basePrice * 1.04,
      basePrice * 1.03,
      basePrice * 1.04,
      basePrice * 1.03,
      basePrice,
    ];
    
    const seed = this.periods.indexOf(this.period()) + this.quotesList().indexOf(sel) * 2;
    return Array.from({ length: 108 }, (_, i) => {
      const step = (i / 107) * (anchors.length - 1),
        j = Math.floor(step);
      const close =
        anchors[j] +
        (anchors[Math.min(j + 1, anchors.length - 1)] - anchors[j]) * (step - j) +
        Math.sin(i * 1.71 + seed) * basePrice * 0.002;
      const open = close + Math.sin(i * 2.3 + seed) * basePrice * 0.005;
      const y = (price: number) => 12 + (basePrice * 1.015 - price) * (133 / (basePrice * 0.08));
      return {
        x: 5 + i * 7.55,
        open: y(open),
        close: y(close),
        high: y(Math.max(open, close) + basePrice * 0.002),
        low: y(Math.min(open, close) - basePrice * 0.003),
        up: close >= open,
        volume: 9 + Math.abs(Math.sin(i * 1.4)) * 12 + (i < 12 ? 30 * Math.abs(Math.cos(i)) : 0),
      };
    });
  });
  readonly rsiPath = computed(() => {
    const candles = this.candles();
    if (!candles.length) return '';
    return candles
      .map(
        (c, i) =>
          `${i ? 'L' : 'M'}${c.x},${(24 + Math.sin(i * 0.17) * 6 + Math.sin(i * 1.8) * 3 + (i < 20 ? 5 : -i * 0.07)).toFixed(1)}`,
      )
      .join(' ');
  });
  
  readonly chartTimes = computed(() =>
    this.period() === '1D'
      ? ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM']
      : this.period() === '1W'
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  );
  
  quote(symbol: string): Quote | undefined {
    return this.quotesList().find((q) => q.symbol === symbol);
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
    const sel = this.selected();
    if (!sel) return 'Select a stock to trade.';
    
    const count = Number(this.quantity()),
      price = this.orderType() === 'Limit' ? Number(this.limitPrice()) : sel.price;
    if (!Number.isSafeInteger(count) || count <= 0)
      return 'Enter a whole number of shares greater than zero.';
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(this.total()))
      return 'Enter a valid order price.';
    if (this.side() === 'Buy' && this.total() > this.buyingPower())
      return 'This order exceeds your buying power.';
    if (
      this.side() === 'Sell' &&
      count > (this.positions().find((p) => p.symbol === sel.symbol)?.quantity || 0)
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
      if (!quote) {
        this.message.set('No stock selected.');
        return;
      }
      const count = Number(this.quantity());
      const account = this.selectedAccount();
      if (!account) {
        this.message.set('No active account selected.');
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
    } catch (error) {
      const msg = error instanceof OrderSubmissionError ? error.userMessage : 'Submission failed. Please try again.';
      this.message.set(msg);
    } finally {
      this.submitting.set(false);
    }
  }
      const msg = error instanceof OrderSubmissionError ? error.userMessage : 'Submission failed. Please try again.';
      this.message.set(msg);
    } finally {
      this.submitting.set(false);
    }
  }
  cancelOrder(id: number): void {
    this.orders.update((list) =>
      list.map((o) => (o.id === id && o.status === 'Open' ? { ...o, status: 'Canceled' } : o)),
    );
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
  constructor(private auth: AuthService) {
    this.orderSubmissionClient = new OrderSubmissionClient(this.auth);
    // Update current time every second
    setInterval(() => this.currentTime.set(new Date()), 1000);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private extractClientIdFromJWT(): string | null {
    const token = this.auth.accessToken;
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const decoded = JSON.parse(atob(parts[1]));
      return decoded.sub || null;
    } catch {
      return null;
    }
  }

  private extractRiskProfileFromJWT(): string | null {
    const token = this.auth.accessToken;
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const decoded = JSON.parse(atob(parts[1]));
      return decoded.risk_profile || null;
    } catch {
      return null;
    }
  }

  private getStartingCashForRiskProfile(riskProfile: string | null): number {
    if (!riskProfile) return 0;
    switch (riskProfile.toUpperCase()) {
      case 'CONSERVATIVE':
        return 30000;
      case 'MODERATE':
        return 100000;
      case 'AGGRESSIVE':
        return 40000000;
      default:
        return 0;
    }
  }

  private async fetchAllQuotes(): Promise<void> {
    try {
      const quotesList: Quote[] = [];
      for (const inst of this.supportedInstruments) {
        try {
          const quote = await this.quoteService.getLatestByMarketSymbol(inst.market, inst.symbol).toPromise();
          if (quote) {
            quotesList.push({
              instrumentId: quote.instrumentId || '',
              symbol: quote.symbol,
              name: inst.name,
              price: quote.midpoint,
              change: 0, // Backend doesn't provide change, would need to track historical
              volume: '0', // Backend doesn't provide volume
            });
          }
        } catch (err) {
          console.warn(`Failed to fetch quote for ${inst.symbol}:`, err);
        }
      }
      this.quotesList.set(quotesList);
      // Set selected to first quote if not set
      if (!this.selected() && quotesList.length > 0) {
        this.selected.set(quotesList[0]);
      }
    } catch (err) {
      console.error('Error fetching quotes:', err);
    }
  }

  private async fetchPortfolioData(clientId: string): Promise<void> {
    try {
      const portfolioData = await this.holdingsService.getPortfolioSummary(clientId).toPromise();
      if (portfolioData) {
        const holdings = portfolioData.holdings || [];
        this.invested.set(holdings.reduce((sum, h) => sum + (h.quantity * h.avgCost), 0));

        // Build positions from holdings with live prices
        const positions = holdings.map((h) => {
          const quote = this.quotesList().find((q) => q.symbol === h.symbol);
          const currentPrice = quote?.price || h.avgCost;
          const positionValue = h.quantity * currentPrice;
          const unrealizedGain = positionValue - (h.quantity * h.avgCost);
          const weight = 0; // Would need total portfolio value

          return {
            symbol: h.symbol,
            quantity: h.quantity,
            cost: h.avgCost,
            value: positionValue,
            day: unrealizedGain, // Today's P&L (simplified)
            total: unrealizedGain,
            weight,
          };
        });
        this.positions.set(positions);

        // Initialize buying power for new accounts from risk profile
        let buyingPower = portfolioData.cash || 0;
        const riskProfile = this.extractRiskProfileFromJWT();
        if (buyingPower === 0 && riskProfile) {
          buyingPower = this.getStartingCashForRiskProfile(riskProfile);
        }
        this.buyingPower.set(buyingPower);

        const totalValue = positions.reduce((sum, p) => sum + p.value, 0) + buyingPower;
        this.portfolioValue.set(totalValue);
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err);
    }
  }

  async ngOnInit(): Promise<void> {
    // Load accounts
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

    // Load instruments
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

    // Fetch initial quotes
    await this.fetchAllQuotes();

    // Setup 5-second polling for quotes
    interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.fetchAllQuotes();
          return [];
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();

    // Fetch initial portfolio and setup polling
    const clientId = this.extractClientIdFromJWT();
    if (clientId) {
      await this.fetchPortfolioData(clientId);

      // Setup 5-second polling for portfolio
      interval(5000)
        .pipe(
          startWith(0),
          switchMap(() => {
            this.fetchPortfolioData(clientId);
            return [];
          }),
          takeUntil(this.destroy$)
        )
        .subscribe();
    }
  }
}
