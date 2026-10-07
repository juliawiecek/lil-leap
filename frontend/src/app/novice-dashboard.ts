import { Component, computed, ElementRef, input, output, signal, viewChild, OnInit, OnDestroy, effect, inject } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { NoviceLearn } from './novice-learn';
import { OrderHistory } from './order-history';
import { QuoteService } from './quote.service';
import { HoldingsService } from './holdings.service';
import { AuthService } from './auth.service';
import { interval, Subject, takeUntil, switchMap, startWith } from 'rxjs';

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
  readonly name = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('NOVICE');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  
  private readonly quoteService = inject(QuoteService);
  private readonly holdingsService = inject(HoldingsService);
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();
  
  // Supported instruments: AAPL, TSLA, AMZN, GOOGL, META, MSFT, NVDA
  // All from NASDAQ market
  private readonly supportedInstruments = [
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ' },
    { symbol: 'TSLA', name: 'Tesla, Inc.', market: 'NASDAQ' },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.', market: 'NASDAQ' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'NASDAQ' },
    { symbol: 'META', name: 'Meta Platforms, Inc.', market: 'NASDAQ' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', market: 'NASDAQ' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'NASDAQ' },
  ];
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
  // Portfolio values fetched from API (TS-11.3: Live portfolio summary)
  readonly portfolioValue = signal(0);
  readonly buyingPower = signal(0);
  readonly invested = signal(0);
  // Holdings fetched from API with live prices (BR-13 + TS-11.3)
  readonly holdings = signal<Holding[]>([]);
  
  // Signal for live quotes fetched from API (BR-13: Indicative pricing)
  readonly quotes = signal<Quote[]>([
    { symbol: 'AAPL', name: 'Apple Inc.', price: 0, change: 0 },
    { symbol: 'TSLA', name: 'Tesla, Inc.', price: 0, change: 0 },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 0, change: 0 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 0, change: 0 },
    { symbol: 'META', name: 'Meta Platforms, Inc.', price: 0, change: 0 },
    { symbol: 'MSFT', name: 'Microsoft Corporation', price: 0, change: 0 },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 0, change: 0 },
  ]);
  readonly watched = signal(['AAPL', 'TSLA', 'AMZN', 'GOOGL', 'META']);
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
  readonly tradeQuote = signal(this.quotes()[0]);
  readonly side = signal('Buy');
  readonly quantity = signal('');
  readonly reviewing = signal(false);
  readonly tradeMessage = signal('');
  readonly orderHistory = signal<
    { id: number; symbol: string; side: string; shares: number; price: number }[]
  >([]);
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
  openTrade(side = 'Buy', symbol = 'AAPL'): void {
    this.tradeQuote.set(this.quotes().find((q) => q.symbol === symbol) || this.quotes()[0]);
    this.side.set(side);
    this.quantity.set('');
    this.reviewing.set(false);
    this.tradeMessage.set('');
    this.query.set('');
    this.openModal('trade');
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
    const error =
      !Number.isSafeInteger(count) || count < 1
        ? 'Enter a whole number of shares greater than zero.'
        : this.side() === 'Buy' && this.tradeTotal() > this.buyingPower()
          ? 'This order exceeds your buying power.'
          : this.side() === 'Sell' && count > held
            ? 'You can only sell shares you hold.'
            : '';
    this.tradeMessage.set(error);
    this.reviewing.set(!error);
  }
  confirmTrade(): void {
    this.reviewTrade();
    if (!this.reviewing()) return;
    const quote = this.tradeQuote(),
      count = Number(this.quantity()),
      direction = this.side() === 'Buy' ? 1 : -1;
    const amount = Math.round(this.tradeTotal() * 100) / 100;
    this.buyingPower.update((v) => Math.round((v - amount * direction) * 100) / 100);
    this.invested.update((v) => Math.round((v + amount * direction) * 100) / 100);
    this.holdings.update((list) => {
      const existing = list.find((h) => h.symbol === quote.symbol);
      if (!existing)
        return [
          ...list,
          {
            symbol: quote.symbol,
            name: quote.name,
            value: amount,
            shares: count,
            average: quote.price,
            today: 0,
            change: 0,
            total: 0,
            totalPercent: 0,
            logo: '',
          },
        ];
      return list
        .map((h) =>
          h.symbol !== quote.symbol
            ? h
            : {
                ...h,
                shares: h.shares + count * direction,
                value: h.value + amount * direction,
                average:
                  direction === 1
                    ? (h.average * h.shares + amount) / (h.shares + count)
                    : h.average,
              },
        )
        .filter((h) => h.shares > 0);
    });
    this.orderHistory.update((list) => [
      {
        id: Date.now(),
        symbol: quote.symbol,
        side: this.side(),
        shares: count,
        price: quote.price,
      },
      ...list,
    ]);
    this.reviewing.set(false);
    this.quantity.set('');
    this.tradeMessage.set('Order filled. Your holdings and buying power have been updated.');
  }

  /**
   * BR-13 & TS-11.3 Compliance: Fetch live quotes and portfolio data
   * Sets up polling to refresh both every 5 seconds
   */
  ngOnInit(): void {
    // Get client ID from auth service for portfolio API calls
    const clientId = this.authService.getUserId();
    
    // Fetch quotes immediately and every 5 seconds
    interval(5000)
      .pipe(
        startWith(0), // Fetch immediately on init
        switchMap(() => this.fetchAllQuotes()),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (quotes) => {
          this.quotes.set(quotes);
          // Update tradeQuote if it's still showing old data
          const current = this.tradeQuote();
          const updated = quotes.find((q) => q.symbol === current.symbol);
          if (updated && updated.price !== current.price) {
            this.tradeQuote.set(updated);
          }
        },
        error: (err) => {
          console.error('Failed to fetch live quotes:', err);
          // Keep showing stale quotes on error, don't break the UI
        },
      });

    // Fetch portfolio/holdings immediately and every 5 seconds (TS-11.3 AC1)
    interval(5000)
      .pipe(
        startWith(0), // Fetch immediately on init
        switchMap(() => this.fetchPortfolioData(clientId)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (portfolioData) => {
          // Update signals with real portfolio data
          this.portfolioValue.set(portfolioData.totalPortfolioValue);
          this.invested.set(portfolioData.investedValue);
          this.buyingPower.set(portfolioData.availableBalance);
          this.holdings.set(portfolioData.holdings);
        },
        error: (err) => {
          console.error('Failed to fetch portfolio data:', err);
          // Keep showing stale portfolio on error, don't break the UI
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Fetch all live quotes from the API (BR-13: Indicative Pricing)
   * Calls quote API for each supported instrument and updates the quotes signal
   * If API fails, returns current quotes to keep UI functional
   */
  private fetchAllQuotes() {
    return new Promise<Quote[]>((resolve) => {
      const quotePromises = this.supportedInstruments.map((inst) =>
        this.quoteService
          .getLatestByMarketSymbol(inst.market, inst.symbol)
          .toPromise()
          .then(
            (apiQuote: any) => ({
              symbol: inst.symbol,
              name: inst.name,
              // Use midpoint from API quote (already calculated bid + ask / 2)
              price: apiQuote?.midpoint ? parseFloat(apiQuote.midpoint.toString()) : 0,
              change: 0, // Change calculation can be added from price history later
            }),
            (error: any) => {
              // On API error, fall back to current price
              console.warn(`Failed to fetch ${inst.symbol}:`, error);
              return {
                symbol: inst.symbol,
                name: inst.name,
                price: this.quotes().find((q: Quote) => q.symbol === inst.symbol)?.price || 0,
                change: 0,
              };
            }
          )
      );

      Promise.all(quotePromises).then((quotes) => resolve(quotes));
    });
  }

  /**
   * TS-11.3 AC1: Fetch portfolio summary from backend
   * Returns holdings with current market prices and portfolio value calculated from live quotes
   * 
   * @param clientId - authenticated user ID
   * @returns Promise with portfolio data (holdings, portfolio value, cash balance)
   */
  private fetchPortfolioData(clientId: string): Promise<{
    totalPortfolioValue: number;
    investedValue: number;
    availableBalance: number;
    holdings: Holding[];
  }> {
    return new Promise((resolve) => {
      this.holdingsService
        .getPortfolioSummary(clientId)
        .toPromise()
        .then(
          (portfolio: any) => {
            // Transform API response to Holding[] format
            const holdings: Holding[] = portfolio.holdings.map((h: any) => {
              const currentPrice = this.findCurrentPrice(h.symbol);
              const holdingValue = currentPrice * h.quantity;
              return {
                symbol: h.symbol,
                name: h.instrumentName,
                value: holdingValue,
                shares: h.quantity,
                average: h.avgCost,
                today: currentPrice - h.avgCost, // Price difference since purchase
                change: h.avgCost > 0 ? ((currentPrice - h.avgCost) / h.avgCost) * 100 : 0,
                total: holdingValue - (h.avgCost * h.quantity), // P&L
                totalPercent: h.avgCost > 0 ? ((currentPrice - h.avgCost) / h.avgCost) * 100 : 0,
                logo: h.symbol.toLowerCase(),
              };
            });

            resolve({
              totalPortfolioValue: portfolio.totalPortfolioValue,
              investedValue: holdings.reduce((sum: number, h) => sum + h.value, 0),
              availableBalance: portfolio.cash?.availableBalance || 0,
              holdings,
            });
          },
          (error: any) => {
            console.warn('Failed to fetch portfolio data:', error);
            // Return current portfolio state on error
            resolve({
              totalPortfolioValue: this.portfolioValue(),
              investedValue: this.invested(),
              availableBalance: this.buyingPower(),
              holdings: this.holdings(),
            });
          }
        );
    });
  }

  /**
   * Helper: Find current price of a symbol from quotes signal
   */
  private findCurrentPrice(symbol: string): number {
    return this.quotes().find((q) => q.symbol === symbol)?.price || 0;
  }
}
