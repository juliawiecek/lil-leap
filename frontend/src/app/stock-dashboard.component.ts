import { FinancialChange } from './financial-change';
import { CurrencyPipe, DecimalPipe, NgClass, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  Injector,
  NgZone,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
  viewChild,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
  type Provider,
} from '@angular/core';
import { ApiHttpClient } from '@lilleap/session-core/angular';
import {
  BehaviorSubject,
  Observable,
  ReplaySubject,
  Subscription,
  catchError,
  connect,
  distinctUntilChanged,
  exhaustMap,
  filter,
  forkJoin,
  map,
  of,
  retry,
  shareReplay,
  sampleTime,
  scan,
  switchMap,
  tap,
  timeout,
  timer,
} from 'rxjs';
import { QuoteService } from './quote.service';
import { StockSvgChart } from './stock-svg-chart';
import { samplingInterval, type ChartSampleMs } from './stock-chart-stream';
import type { StockPriceTick } from './stock-price-ticks';
import { validPrice } from './stock-chart-math';

export interface StockAsset {
  readonly symbol: string;
  readonly name: string;
  readonly market: string;
}

/** Values belong to one quote; never pair a price with another asset's/session's open. */
export interface StockDashboardTick extends StockAsset {
  readonly price: number;
  readonly openPrice: number | null;
  readonly time: number; // Backend quote time, Unix seconds, not client receipt time.
  readonly currency: string;
  readonly synthetic: boolean;
  readonly history?: readonly StockPriceTick[];
}

export interface StockDashboardAsset extends StockDashboardTick {
  readonly change: number | null;
  readonly changePercent: number | null;
  readonly hasPerformance: boolean;
  readonly isMarketUp: boolean;
  readonly asOfLabel: string;
}

export interface StockDashboardState {
  readonly asset: StockDashboardAsset | null;
  readonly connection: 'connecting' | 'live' | 'delayed' | 'offline';
  readonly message: string;
}

/** A parent can replace the REST adapter with its authenticated WebSocket/SSE stream. */
export const STOCK_DASHBOARD_TICKS = new InjectionToken<Observable<StockDashboardTick>>(
  'STOCK_DASHBOARD_TICKS',
);

/** Cold, cancellable backend adapter. All requests use the shared authenticated transport. */
export function provideStockDashboardFeed(asset: StockAsset): Provider {
  return {
    provide: STOCK_DASHBOARD_TICKS,
    useFactory: () =>
      createStockDashboardFeed(asset, inject(QuoteService), inject(ApiHttpClient)).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
      ),
  };
}

function createStockDashboardFeed(
  asset: StockAsset,
  quotes: QuoteService,
  http: ApiHttpClient,
): Observable<StockDashboardTick> {
  let history: readonly StockPriceTick[] | undefined;
  let historyDay = '';
  let openPrice: number | null = null;
  return timer(0, 1000).pipe(
    exhaustMap(() =>
      quotes.getLatestByMarketSymbol(asset.market, asset.symbol).pipe(
        switchMap((quote) => {
          const day = sessionDay(Date.parse(quote.quotedAt));
          if (day !== historyDay) {
            history = undefined;
            openPrice = null;
            historyDay = day;
          }
          return forkJoin({
            opens: http
              .get<{ instrumentId: string; midpoint: number | string; quotedAt: string }[]>(
                '/api/v1/quotes/day-opens',
                { params: { ids: quote.instrumentId } },
              )
              .pipe(catchError(() => of([]))),
            history: history
              ? of(history)
              : quotes.getHistory(quote.instrumentId, 1000).pipe(
                  map((rows) =>
                    [...rows]
                      .reverse()
                      .filter(
                        (row) =>
                          sessionDay(Date.parse(row.quotedAt)) ===
                          sessionDay(Date.parse(quote.quotedAt)),
                      )
                      .map((row) => ({
                        time: Date.parse(row.quotedAt) / 1000,
                        price: Number(row.midpoint),
                      })),
                  ),
                  catchError(() => of([])),
                ),
          }).pipe(
            map((result) => {
              if (result.history.length) {
                history = result.history;
              }
              const open = result.opens.find((row) => row.instrumentId === quote.instrumentId);
              // The backend may return a previous close before the session opens.
              // Keep that distinct from the requested current-session opening price.
              return {
                ...asset,
                symbol: quote.symbol,
                market: quote.marketCode,
                price: Number(quote.midpoint),
                openPrice: (openPrice = currentSessionOpen(open) ?? openPrice),
                time: Date.parse(quote.quotedAt) / 1000,
                currency: quote.currency,
                synthetic: quote.synthetic,
                history,
              } satisfies StockDashboardTick;
            }),
          );
        }),
        retry({ count: 2, delay: 1000 }),
      ),
    ),
  );
}

const STALE_MS = 60000; // Matches the existing quote freshness policy.
const QUOTE_FIELDS = [
  'time',
  'price',
  'openPrice',
  'symbol',
  'market',
  'currency',
  'history',
] as const;
const EXCHANGE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});
const EXCHANGE_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function sessionDay(time: number): string {
  if (!Number.isFinite(time)) {
    return '';
  }
  return EXCHANGE_DATE.formatToParts(time)
    .filter((part) => ['year', 'month', 'day'].includes(part.type))
    .map((part) => part.value)
    .join('-');
}

function currentSessionOpen(
  open: { midpoint: number | string; quotedAt: string } | undefined,
): number | null {
  const time = Date.parse(open?.quotedAt ?? '');
  if (!Number.isFinite(time)) {
    return null;
  }
  const parts = EXCHANGE_DATE.formatToParts(time);
  const day = (values: Intl.DateTimeFormatPart[]) =>
    values
      .filter((part) => ['year', 'month', 'day'].includes(part.type))
      .map((part) => part.value)
      .join('-');
  const minute =
    Number(parts.find((part) => part.type === 'hour')?.value) * 60 +
    Number(parts.find((part) => part.type === 'minute')?.value);
  const price = Number(open!.midpoint);
  if (day(parts) !== day(EXCHANGE_DATE.formatToParts(Date.now())) || minute < 570) {
    return null;
  }
  return Number.isFinite(price) && price > 0 ? price : null;
}

@Component({
  selector: 'app-retail-stock-dashboard',
  standalone: true,
  imports: [FinancialChange, NgClass, CurrencyPipe, DecimalPipe, StockSvgChart],
  templateUrl: './stock-dashboard.component.html',
  styleUrl: './stock-dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StockDashboardComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly selectedAsset = input<StockAsset | null>(null);
  readonly windowSeconds = input(86400);
  readonly sampleMs = input<ChartSampleMs>(5000);
  readonly #sampleClock = new BehaviorSubject<ChartSampleMs>(5000);
  readonly #state = signal<StockDashboardState>({
    asset: null,
    connection: 'connecting',
    message: '',
  });
  readonly state = this.#state.asReadonly();
  readonly asset = computed(() => this.state().asset);
  readonly #zone = inject(NgZone);
  readonly #feed = inject(STOCK_DASHBOARD_TICKS, { optional: true });
  readonly #injector = inject(Injector);
  readonly #platform = inject(PLATFORM_ID);
  private readonly chart = viewChild(StockSvgChart);
  #subscription: Subscription | undefined;
  #assetKey = '';
  #historySeeded = false;
  #feedKey = '';

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.#platform)) {
      return;
    }
    this.#zone.runOutsideAngular(() => {
      this.#subscribeFeed();
    });
  }

  #subscribeFeed(): void {
    const selection = this.selectedAsset();
    const key = this.#feed
      ? 'injected-feed'
      : selection
        ? `${selection.market}:${selection.symbol}`
        : '';
    if (key === this.#feedKey && this.#subscription && !this.#subscription.closed) {
      return;
    }
    this.#subscription?.unsubscribe();
    this.chart()!.setHistory([]);
    this.#assetKey = '';
    this.#historySeeded = false;
    this.#feedKey = key;
    if (this.state().asset || this.state().connection !== 'connecting') {
      this.#zone.run(() => this.#state.set({ asset: null, connection: 'connecting', message: '' }));
    }
    if (!key) {
      return;
    }
    const source =
      this.#feed ??
      createStockDashboardFeed(
        selection!,
        this.#injector.get(QuoteService),
        this.#injector.get(ApiHttpClient),
      );
    const raw = source.pipe(
      filter((tick) => this.#validTick(tick)),
      timeout({ each: 15000 }),
      scan((latest: StockDashboardTick, tick: StockDashboardTick) =>
        latest.symbol === tick.symbol && latest.market === tick.market && latest.time > tick.time
          ? latest
          : tick,
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    // Sampling belongs exclusively to this consumer; other price streams keep their live cadence.
    this.#subscription = raw
      .pipe(
        tap({
          complete: () =>
            this.#setOffline('The price feed has ended. The last received quote is shown.'),
        }),
        connect(
          (shared) =>
            this.#sampleClock.pipe(
              switchMap((milliseconds) => shared.pipe(sampleTime(milliseconds))),
            ),
          { connector: () => new ReplaySubject<StockDashboardTick>(1) },
        ),
        distinctUntilChanged((a, b) => QUOTE_FIELDS.every((field) => a[field] === b[field])),
      )
      .subscribe({
        next: (tick) => this.#zone.runOutsideAngular(() => this.#commit(tick)),
        error: () =>
          this.#setOffline('Live prices are unavailable. The last received quote is shown.'),
        complete: () =>
          this.#setOffline('The price feed has ended. The last received quote is shown.'),
      });
  }

  ngOnChanges(): void {
    this.#zone.runOutsideAngular(() => {
      const milliseconds = samplingInterval(this.sampleMs());
      if (this.#sampleClock.value !== milliseconds) {
        this.#sampleClock.next(milliseconds);
      }
      if (this.chart()) {
        this.#subscribeFeed();
      }
    });
  }

  ngOnDestroy(): void {
    this.#zone.runOutsideAngular(() => {
      this.#subscription?.unsubscribe();
      this.#sampleClock.complete();
    });
  }

  #commit(tick: StockDashboardTick): void {
    const key = `${tick.market}:${tick.symbol}:${tick.currency}:${sessionDay(tick.time * 1000)}`;
    const previous = this.state().asset;
    if (key === this.#assetKey && previous && tick.time < previous.time) {
      return;
    }
    if (key !== this.#assetKey) {
      this.chart()!.setHistory([]);
      this.#assetKey = key;
      this.#historySeeded = false;
    }
    // Calculate the session position once, then use this same flag everywhere.
    const hasPerformance =
      tick.openPrice !== null && Number.isFinite(tick.openPrice) && tick.openPrice > 0;
    const change = hasPerformance ? tick.price - tick.openPrice! : null;
    const { history, ...quote } = tick;
    const asset: StockDashboardAsset = {
      ...quote,
      change,
      changePercent: hasPerformance ? (change! / tick.openPrice!) * 100 : null,
      hasPerformance,
      isMarketUp: hasPerformance && change! >= 0,
      asOfLabel: EXCHANGE_TIME.format(tick.time * 1000),
    };
    const delayed = Date.now() - tick.time * 1000 > STALE_MS;
    this.chart()!.setPerformance(tick.price, tick.openPrice, tick.currency);
    if (!this.#historySeeded && history?.length) {
      this.chart()!.setHistory([
        ...history.filter((point) => point.time <= tick.time),
        { time: tick.time, price: tick.price },
      ]);
      this.#historySeeded = true;
    } else {
      this.chart()!.append({ time: tick.time, price: tick.price });
    }
    // Only sampled header/status state enters Angular; animation and interaction stay outside it.
    this.#zone.run(() =>
      this.#state.set({
        asset,
        connection: delayed ? 'delayed' : 'live',
        message: delayed
          ? 'This quote is delayed. Check the timestamp before making a decision.'
          : '',
      }),
    );
  }

  #setOffline(message: string): void {
    this.#zone.run(() =>
      this.#state.update((current) => ({
        ...current,
        connection: 'offline',
        message: current.asset ? message : 'Live prices are unavailable. Please try again later.',
      })),
    );
  }

  #validTick(tick: StockDashboardTick): boolean {
    if (!tick) {
      return false;
    }
    const hasAsset =
      typeof tick.symbol === 'string' &&
      !!tick.symbol &&
      typeof tick.name === 'string' &&
      typeof tick.market === 'string';
    return (
      hasAsset &&
      /^[A-Z]{3}$/.test(tick.currency) &&
      validPrice(tick) &&
      tick.time <= Math.floor(Date.now() / 1000) + 60
    );
  }
}
