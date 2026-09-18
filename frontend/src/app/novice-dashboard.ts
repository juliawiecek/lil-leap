import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { NoviceLearn } from './novice-learn';

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
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon, NoviceLearn],
  templateUrl: './novice-dashboard.html',
  styleUrl: './novice-dashboard.scss',
})
export class NoviceDashboard {
  readonly name = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('NOVICE');
  readonly signOut = output<void>();
  readonly advanced = output<void>();
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
  readonly portfolioValue = signal(24680.42);
  readonly buyingPower = signal(6420.18);
  readonly invested = signal(18260.24);
  readonly holdings = signal<Holding[]>([
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      value: 7415.6,
      shares: 42,
      average: 154.2,
      today: 144.06,
      change: 1.98,
      total: 1312.6,
      totalPercent: 21.54,
      logo: 'apple',
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      value: 4978.2,
      shares: 18,
      average: 248.36,
      today: 96.48,
      change: 1.98,
      total: 489.76,
      totalPercent: 10.91,
      logo: 'microsoft',
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      value: 3337.12,
      shares: 12,
      average: 228.74,
      today: 169.2,
      change: 5.34,
      total: 392.12,
      totalPercent: 13.32,
      logo: 'nvidia',
    },
  ]);
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
    this.tradeQuote.set(this.quotes.find((q) => q.symbol === symbol) || this.quotes[0]);
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
}
