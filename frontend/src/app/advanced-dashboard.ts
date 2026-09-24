import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { DashboardIcon } from './dashboard-icon';
import { AdvancedTicket } from './advanced-ticket';
import { AdvancedChart } from './advanced-chart';

interface Quote {
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
  imports: [CurrencyPipe, DecimalPipe, DashboardIcon, AdvancedTicket, AdvancedChart],
  templateUrl: './advanced-dashboard.html',
  styleUrl: './advanced-dashboard.scss',
})
export class AdvancedDashboard {
  readonly name = input('');
  readonly mode = input<'NOVICE' | 'ADVANCED'>('ADVANCED');
  readonly signOut = output<void>();
  readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('detailDialog');
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
    { symbol: 'AAPL', name: 'Apple Inc.', price: 176.56, change: 1.85, volume: '48.2M' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation', price: 893.12, change: 2.36, volume: '32.8M' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', price: 424.31, change: 0.72, volume: '18.4M' },
    { symbol: 'AMD', name: 'Advanced Micro Devices', price: 162.14, change: 3.21, volume: '36.1M' },
    { symbol: 'TSLA', name: 'Tesla, Inc.', price: 142.2, change: -1.24, volume: '45.7M' },
    { symbol: 'META', name: 'Meta Platforms, Inc.', price: 521.48, change: -0.37, volume: '12.6M' },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.', price: 180.34, change: 1.21, volume: '28.7M' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 155.91, change: 0.62, volume: '20.1M' },
  ];
  readonly selected = signal(this.quotes[0]);
  readonly results = computed(() =>
    this.quotes.filter((q) =>
      `${q.symbol} ${q.name}`.toLowerCase().includes(this.query().trim().toLowerCase()),
    ),
  );
  readonly screened = computed(() =>
    this.quotes.filter((q) =>
      this.filter() === 'Gainers'
        ? q.change > 0
        : this.filter() === 'Decliners'
          ? q.change < 0
          : true,
    ),
  );
  readonly positions = signal<Position[]>([
    {
      symbol: 'AAPL',
      quantity: 250,
      cost: 142.2,
      value: 44140,
      day: 1925,
      total: 8590,
      weight: 15.5,
    },
    {
      symbol: 'NVDA',
      quantity: 120,
      cost: 640.18,
      value: 107174.4,
      day: 2944.32,
      total: 30352.8,
      weight: 37.7,
    },
    {
      symbol: 'MSFT',
      quantity: 80,
      cost: 390.14,
      value: 33944.8,
      day: 192.8,
      total: 2733.6,
      weight: 11.9,
    },
    {
      symbol: 'AMD',
      quantity: 200,
      cost: 118.05,
      value: 32428,
      day: 1010,
      total: 8817,
      weight: 11.4,
    },
    {
      symbol: 'TSLA',
      quantity: 60,
      cost: 178.45,
      value: 8532,
      day: -107.4,
      total: -2175,
      weight: 3,
    },
  ]);
  readonly buyingPower = signal(48230.12);
  readonly portfolio = signal(284650.17);
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
  readonly orders = signal<Order[]>([
    {
      id: 4,
      time: '09:41:32',
      symbol: 'AAPL',
      side: 'Buy',
      quantity: 100,
      price: 176.12,
      status: 'Filled',
      type: 'Limit',
      tif: 'Day',
    },
    {
      id: 3,
      time: '09:38:17',
      symbol: 'NVDA',
      side: 'Sell',
      quantity: 50,
      price: 892.4,
      status: 'Filled',
      type: 'Market',
      tif: 'Day',
    },
    {
      id: 2,
      time: '09:35:04',
      symbol: 'MSFT',
      side: 'Buy',
      quantity: 75,
      price: 423.1,
      status: 'Filled',
      type: 'Market',
      tif: 'Day',
    },
  ]);
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
  readonly chartTimes = computed(() =>
    this.period() === '1D'
      ? ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM']
      : this.period() === '1W'
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  );
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
  confirmOrder(): void {
    const error = this.validate();
    if (error) {
      this.message.set(error);
      this.closeModal();
      return;
    }
    const quote = this.selected(),
      count = Number(this.quantity()),
      price = quote.price;
    const filled =
      this.orderType() === 'Market' ||
      (this.side() === 'Buy'
        ? Number(this.limitPrice()) >= price
        : Number(this.limitPrice()) <= price);
    const order: Order = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      symbol: quote.symbol,
      side: this.side(),
      quantity: count,
      price: filled ? price : Number(this.limitPrice()),
      status: filled ? 'Filled' : 'Open',
      type: this.orderType(),
      tif: this.tif(),
      takeProfit: this.takeProfit() ? Number(this.profitPrice()) : undefined,
      stopLoss: this.stopLoss() ? Number(this.stopPrice()) : undefined,
    };
    if (filled) {
      const amount = count * price,
        fees = Math.floor(amount * 0.01) / 100,
        direction = this.side() === 'Buy' ? 1 : -1;
      this.buyingPower.update((v) => Math.round((v - direction * amount - fees) * 100) / 100);
      this.portfolio.update((v) => Math.round((v - fees) * 100) / 100);
      this.positions.update((list) => {
        const existing = list.find((p) => p.symbol === quote.symbol);
        if (!existing)
          return [
            ...list,
            {
              symbol: quote.symbol,
              quantity: count,
              cost: price,
              value: amount,
              day: 0,
              total: 0,
              weight: (amount / this.portfolio()) * 100,
            },
          ];
        return list
          .map((p) =>
            p.symbol !== quote.symbol
              ? p
              : {
                  ...p,
                  quantity: p.quantity + direction * count,
                  value: (p.quantity + direction * count) * price,
                  cost:
                    direction === 1
                      ? (p.cost * p.quantity + amount) / (p.quantity + count)
                      : p.cost,
                },
          )
          .filter((p) => p.quantity > 0);
      });
    }
    this.orders.update((list) => [order, ...list]);
    this.closeModal();
    this.message.set(
      filled
        ? 'Order filled. Positions and balances updated.'
        : 'Limit order is open. The quote has not reached your limit.',
    );
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
}
