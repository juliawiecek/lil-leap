import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';

export type Experience = 'NOVICE' | 'ADVANCED';
interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  sector: string;
}
interface Order {
  id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
}
@Component({
  selector: 'app-stock-dashboard',
  imports: [CurrencyPipe],
  templateUrl: './stock-dashboard.html',
  styleUrl: './stock-dashboard.scss',
})
export class StockDashboard implements OnInit, AfterViewInit {
  @ViewChild('workspace') private workspace!: ElementRef<HTMLElement>;
  ngAfterViewInit(): void {
    this.workspace.nativeElement.focus();
  }
  readonly name = input('');
  readonly level = input<Experience>('NOVICE');
  readonly newAccount = input(false);
  readonly signOut = output<void>();
  readonly mode = signal<Experience>('NOVICE');
  readonly guidedStep = signal(0);
  readonly guidedSteps = ['Find a stock', 'Understand it', 'Practice a trade'];
  readonly welcome = signal(false);
  readonly tab = signal('Overview');
  readonly tabs = ['Overview', 'Watchlist', 'Portfolio', 'Orders', 'Learn'];
  readonly query = signal('');
  readonly range = signal('1D');
  readonly ranges = ['1D', '1W', '1M', '1Y'];
  readonly stocks: Stock[] = [
    { symbol: 'AAPL', name: 'Apple', price: 227.16, change: 1.24, sector: 'Technology' },
    { symbol: 'MSFT', name: 'Microsoft', price: 418.32, change: 0.86, sector: 'Technology' },
    { symbol: 'NVDA', name: 'NVIDIA', price: 124.58, change: 2.41, sector: 'Semiconductors' },
    {
      symbol: 'AMZN',
      name: 'Amazon',
      price: 186.49,
      change: -0.42,
      sector: 'Consumer discretionary',
    },
    {
      symbol: 'GOOGL',
      name: 'Alphabet',
      price: 164.72,
      change: 0.63,
      sector: 'Communication services',
    },
    {
      symbol: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      price: 274.85,
      change: 0.54,
      sector: 'Broad U.S. stock market',
    },
  ];
  readonly selected = signal(this.stocks[0]);
  readonly watched = signal(['AAPL', 'MSFT', 'NVDA', 'VTI']);
  readonly results = computed(() =>
    this.stocks.filter((s) =>
      (s.symbol + ' ' + s.name).toLowerCase().includes(this.query().toLowerCase().trim()),
    ),
  );
  readonly watchlist = computed(() => this.stocks.filter((s) => this.watched().includes(s.symbol)));
  readonly cash = signal(10000);
  readonly holdings = signal<Record<string, number>>({});
  readonly orders = signal<Order[]>([]);
  readonly side = signal('Buy');
  readonly kind = signal('Market');
  readonly quantity = signal('');
  readonly limit = signal('');
  readonly review = signal(false);
  readonly message = signal('');
  readonly lesson = signal(0);
  readonly lessons = [
    {
      title: 'Start with a watchlist',
      text: 'A watchlist lets you follow a company without buying it. Search for a company and select Save. Open it whenever you want to explore its price.',
    },
    {
      title: 'Understand your order',
      text: 'A market order seeks the next available price, which may differ from the quote. A limit order sets the most you will pay or the least you will accept, but may not fill.',
    },
    {
      title: 'Give risk a little room',
      text: 'Prices can fall as well as rise. Spreading investments across companies and sectors can reduce concentration, but does not eliminate the possibility of loss.',
    },
  ];
  readonly price = computed(() =>
    this.kind() === 'Limit' ? Number(this.limit()) : this.selected().price,
  );
  readonly total = computed(() => Number(this.quantity()) * this.price());
  readonly positions = computed(() =>
    this.stocks.filter((s) => (this.holdings()[s.symbol] ?? 0) > 0),
  );
  readonly invested = computed(() =>
    this.positions().reduce((sum, s) => sum + this.holdings()[s.symbol] * s.price, 0),
  );
  readonly chart = computed(() => {
    const seed = this.stocks.indexOf(this.selected()) + this.ranges.indexOf(this.range()) * 3;
    return Array.from({ length: 60 }, (_, i) => ({
      x: i * 12,
      y: 170 - i * 1.5 + Math.sin(i * 1.7 + seed) * 13 + Math.cos(i * 0.4 + seed) * 22,
    }));
  });
  readonly path = computed(() =>
    this.chart()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`)
      .join(' '),
  );
  ngOnInit(): void {
    this.mode.set(this.level());
    this.welcome.set(this.newAccount());
  }
  choose(stock: Stock): void {
    this.guidedStep.set(1);
    this.selected.set(stock);
    this.query.set('');
    this.review.set(false);
    this.message.set('');
    this.limit.set(stock.price.toFixed(2));
    this.tab.set('Overview');
  }
  toggleWatch(): void {
    const symbol = this.selected().symbol;
    this.watched.update((list) =>
      list.includes(symbol) ? list.filter((s) => s !== symbol) : [...list, symbol],
    );
  }
  edit(): void {
    this.review.set(false);
    this.message.set('');
  }
  setMode(value: string): void {
    this.guidedStep.set(0);
    this.mode.set(value as Experience);
    this.kind.set('Market');
    this.edit();
  }
  validate(): string {
    const quantity = Number(this.quantity());
    if (!Number.isSafeInteger(quantity) || quantity <= 0)
      return 'Enter a whole number of shares greater than zero.';
    if (!Number.isFinite(this.price()) || this.price() <= 0 || !Number.isFinite(this.total()))
      return 'Enter a valid price greater than zero.';
    if (this.side() === 'Buy' && this.total() > this.cash())
      return 'This order exceeds your available practice cash.';
    if (this.side() === 'Sell' && quantity > (this.holdings()[this.selected().symbol] ?? 0))
      return 'You can only sell shares you hold in this practice account.';
    return '';
  }
  preview(): void {
    const error = this.validate();
    this.message.set(error);
    this.review.set(!error);
  }
  place(): void {
    const error = this.validate();
    if (error) {
      this.message.set(error);
      this.review.set(false);
      return;
    }
    const stock = this.selected(),
      quantity = Number(this.quantity());
    const matches =
      this.kind() === 'Market' ||
      (this.side() === 'Buy' ? this.price() >= stock.price : this.price() <= stock.price);
    if (!matches) {
      this.message.set(
        'Your limit does not match this sample quote. Adjust the price to practice a fill. No order was placed.',
      );
      this.review.set(false);
      return;
    }
    const direction = this.side() === 'Buy' ? 1 : -1;
    this.cash.update((cash) => Math.round((cash - direction * quantity * stock.price) * 100) / 100);
    this.holdings.update((h) => ({
      ...h,
      [stock.symbol]: (h[stock.symbol] ?? 0) + direction * quantity,
    }));
    this.orders.update((o) => [
      {
        id: o.length + 1,
        symbol: stock.symbol,
        side: this.side(),
        quantity,
        price: stock.price,
        status: 'Practice fill',
      },
      ...o,
    ]);
    this.review.set(false);
    this.quantity.set('');
    this.message.set('Practice trade complete. Your portfolio and order history are updated.');
  }
}
