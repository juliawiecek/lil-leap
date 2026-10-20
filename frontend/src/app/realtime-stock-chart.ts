import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  PLATFORM_ID,
  inject,
  input,
  signal,
  viewChild,
  type AfterViewInit,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import { BehaviorSubject, ReplaySubject, Subscription, connect, switchMap } from 'rxjs';
import { STOCK_PRICE_TICKS, type StockPriceTick } from './stock-price-ticks';
import { StockSvgChart } from './stock-svg-chart';
import { normalizeHistory } from './stock-chart-math';
import { samplePrices, samplingInterval, type ChartSampleMs } from './stock-chart-stream';
@Component({
  selector: 'app-realtime-stock-chart',
  standalone: true,
  imports: [StockSvgChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-stock-svg-chart [windowSeconds]="windowSeconds()" />
    @if (error()) {
      <p role="status">{{ error() }}</p>
    }`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      app-stock-svg-chart {
        height: 280px;
      }
      p {
        color: #aeb9c8;
        font-size: 13px;
      }
    `,
  ],
})
export class RealtimeStockChart implements AfterViewInit, OnChanges, OnDestroy {
  readonly windowSeconds = input(86400);
  readonly sampleMs = input<ChartSampleMs>(5000);
  /** Supply the exchange/session baseline; never infer an open from sampled data. */
  readonly openingPrice = input<number | null>(null);
  readonly history = input<readonly StockPriceTick[]>([]);
  readonly error = signal('');
  private readonly chart = viewChild(StockSvgChart);
  readonly #zone = inject(NgZone);
  readonly #prices = inject(STOCK_PRICE_TICKS);
  readonly #platform = inject(PLATFORM_ID);
  readonly #clock = new BehaviorSubject<ChartSampleMs>(5000);
  #subscription: Subscription | undefined;
  #latest: StockPriceTick | undefined;
  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.#platform)) return;
    this.#zone.runOutsideAngular(() => {
      this.chart()!.setHistory(this.history());
      const last = normalizeHistory(this.history()).at(-1);
      if (last) {
        this.#latest = last;
        this.chart()!.setPerformance(last.price, this.openingPrice());
      }
      this.#subscription = this.#prices
        .pipe(
          connect((shared) => this.#clock.pipe(switchMap((ms) => shared.pipe(samplePrices(ms)))), {
            connector: () => new ReplaySubject<StockPriceTick>(1),
          }),
        )
        .subscribe({
          next: (tick) =>
            this.#zone.runOutsideAngular(() => {
              if (this.#latest && tick.time < this.#latest.time) return;
              this.#latest = tick;
              this.chart()!.setPerformance(tick.price, this.openingPrice());
              this.chart()!.append(tick);
            }),
          error: () => this.#zone.run(() => this.error.set('Live prices are unavailable.')),
        });
    });
  }
  ngOnChanges(changes: import('@angular/core').SimpleChanges): void {
    this.#zone.runOutsideAngular(() => {
      const ms = samplingInterval(this.sampleMs());
      if (ms !== this.#clock.value) this.#clock.next(ms);
      if (changes['history'] && this.chart()) {
        this.chart()!.setHistory(this.history());
        this.#latest = normalizeHistory(this.history()).at(-1);
      }
      if (this.#latest && this.chart())
        this.chart()!.setPerformance(this.#latest.price, this.openingPrice());
    });
  }
  ngOnDestroy(): void {
    this.#subscription?.unsubscribe();
    this.#clock.complete();
  }
}
