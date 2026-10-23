import { ChartAccess, ChartFocus } from './chart-access';
import { chartPoints, orderedPrices, type ChartSeries } from './chart-data';
import { chartDate, chartPeriodLabel, chartValue, describeSeries } from '../../../shared/chart-description';
import { describeTrades, technicalTable, volumeTable } from './technical-chart-data';
import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import type { PricePoint } from './market-feed-api';
import { displayCandles, indicators, placeEndLabels, rsi } from './technical-chart-math';
import { pricePath, priceRange, priceY, plotMarks, type ChartWindow, type TradeMark } from './trade-marks';

let chartId = 0;
const HEIGHT = 180;
const MIN_EXTENT_MS = 30 * 60 * 1000;

/** Native SVG enhancement of the existing history plot; no new market requests or chart library. */
@Component({
  selector: 'app-technical-chart',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, ChartAccess, ChartFocus],
  templateUrl: './technical-chart.html',
  styleUrl: './technical-chart.scss',
})
export class TechnicalChart implements AfterViewInit, OnChanges, OnDestroy {
  readonly points = input<readonly PricePoint[]>([]);
  readonly window = input.required<ChartWindow>();
  readonly chartKey = input('');
  readonly symbol = input('');
  readonly period = input('1D');
  readonly trades = input<readonly TradeMark[]>([]);
  readonly averageCost = input<number | null>(null);
  readonly id = `technical-${++chartId}`;
  readonly privateValues = input(false);
  readonly rsiPeriod = input(14);
  readonly rsiPoints = computed(() => rsi(this.source().filter(p => p.candle), this.rsiPeriod()));
  readonly visibleRsi = computed(() => this.rsiPoints().filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end));
  readonly rsiLine = computed(() => this.visibleRsi().map((p, i) => `${i ? 'L' : 'M'}${this.x(p.at)},${60 - p.price / 100 * 60}`).join(' '));
  readonly rsiDescription = computed(() => describeSeries(this.visibleRsi().map(p => ({ at: p.at, value: p.price })), {
    name: this.symbol() + ' RSI ' + this.rsiPeriod(), period: this.period(), empty: `Needs ${this.rsiPeriod() + 1} recorded bars.`,
  }));
  readonly rsiTable = computed(() => ({ columns: ['Time (New York)', 'RSI ' + this.rsiPeriod()],
    rows: this.visibleRsi().map(p => [chartDate(p.at), chartValue(p.price)]) }));
  readonly chartSeries = computed<readonly ChartSeries[]>(() => [
    { id: this.symbol() + ':price', label: this.symbol() + ' recorded prices', unit: 'USD', points: chartPoints(this.visible(), p => p.at, p => p.price), status: this.visible().length ? 'ready' : 'empty' },
    ...this.series().map(s => {
      const points = chartPoints(s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end), p => p.at, p => p.price);
      return { id: this.symbol() + ':' + s.name, label: s.name, unit: 'USD' as const, points, status: points.length ? 'ready' as const : 'unavailable' as const, note: s.unavailable };
    }),
    { id: this.symbol() + ':rsi', label: 'RSI ' + this.rsiPeriod(), unit: 'index', points: chartPoints(this.visibleRsi(), p => p.at, p => p.price), status: this.visibleRsi().length ? 'ready' : 'unavailable' },
    { id: this.symbol() + ':volume', label: 'Reported traded volume', unit: 'shares', points: chartPoints(this.volumePoints(), p => p.at, p => p.value), status: this.hasVolume() ? 'ready' : 'unavailable' },
  ]);
  readonly viewTrades = computed(() => this.trades().filter(t => t.at >= this.viewport().start && t.at <= this.viewport().end));
  readonly description = computed(() => describeSeries(this.visible().map(p => ({ at: p.at, value: p.price, low: p.candle?.low, high: p.candle?.high })), {
    name: this.symbol() + ' recorded prices', period: this.period(), currency: 'USD',
  }) + ' ' + describeTrades(this.viewTrades(), this.visible().at(-1)?.price, this.averageCost(), this.privateValues()) + ' ' + this.paths().map(s => { const last = s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).at(-1); return `${s.name}: ${last ? 'latest value ' + chartValue(last.price, { currency: 'USD', precision: 2 }) : s.unavailable}.`; }).join(' ') + ' ' + this.summary());
  readonly dataTable = computed(() => technicalTable(this.visible(), this.series(), this.viewTrades(), true, this.privateValues(), this.averageCost()));
  readonly allData = computed(() => technicalTable(this.visible(), this.series(), this.viewTrades(), false, this.privateValues(), this.averageCost()));
  readonly volumePoints = computed(() => this.candles().filter(p => p.candle?.volume !== null).map(p => ({ at: p.at, value: p.candle!.volume! })));
  readonly volumeDescription = computed(() => {
    const missing = this.candles().length - this.volumePoints().length;
    return describeSeries(this.volumePoints(), { name: this.symbol() + ' reported traded volume', period: this.period(), unit: 'shares', empty: 'Volume is unavailable for this view; no complete reported volume is available for the displayed bars.' })
      + (missing ? ` Volume is unavailable for ${missing} of ${this.candles().length} displayed bars; these gaps are not zero.` : '')
      + (this.candles().length < this.visible().length ? ' Displayed bars combine consecutive observations; the table can show every original observation.' : '');
  });
  readonly volumeTable = computed(() => volumeTable(this.candles().length ? this.candles() : this.visible(), this.candles().length > 0 && this.candles().length < this.visible().length));
  readonly allVolume = computed(() => volumeTable(this.visible()));
  readonly height = HEIGHT;
  readonly width = signal(600);
  readonly zoom = signal(1);
  readonly anchor = signal<number | null>(null);
  readonly inspected = signal<PricePoint | null>(null);
  readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('plot');
  #resize?: ResizeObserver;
  #key = '';

  /** The period window trimmed to start at the first recorded price or trade, so a short history
   * fills the plot instead of crowding against its right edge. */
  readonly extent = computed(() => {
    const base = this.window();
    const first = [this.source().find(p => p.at >= base.start)?.at, ...this.trades().map(t => t.at)]
      .reduce<number>((min, at) => at !== undefined && at >= base.start && at <= base.end ? Math.min(min, at) : min, Infinity);
    if (!Number.isFinite(first)) { return base; }
    // Keep at least half an hour on screen so a lone observation is not stretched edge to edge.
    const start = Math.max(base.start, Math.min(first, base.end - MIN_EXTENT_MS));
    return { start, end: base.end };
  });
  readonly viewport = computed(() => {
    const base = this.extent(), span = Math.max(1, (base.end - base.start) / this.zoom());
    const end = Math.max(base.start + span, Math.min(base.end, this.anchor() ?? base.end));
    return { start: end - span, end };
  });
  readonly source = computed(() => orderedPrices(this.points()));
  readonly visible = computed(() => this.source().filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end));
  /** Live quotes arrive without OHLC, so they stay raw observations. Draw them only from the last
   * candle onward: pathing the whole series lays a full-resolution line over the decimated candles
   * instead of continuing them, which a single tick is enough to trigger. */
  readonly rawTail = computed(() => {
    const points = this.visible();
    let last = -1;
    for (let i = points.length - 1; i >= 0; i--) {
      if (points[i].candle) { last = i; break; }
    }
    return last < 0 ? points : points.slice(last);
  });
  readonly hasRawPrices = computed(() => this.rawTail().some(p => !p.candle));
  readonly candles = computed(() => displayCandles(this.visible(), this.width() / 7));
  readonly series = computed(() => indicators(this.source()));
  readonly range = computed(() => priceRange([
    ...this.visible().flatMap(p => p.candle ? [p.candle.low, p.candle.high] : [p.price]),
    ...this.series().flatMap(s => s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).map(p => p.price)),
    ...this.trades().filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).map(p => p.price), this.averageCost() ?? 0,
  ]) ?? { low: 0, high: 1 });
  readonly line = computed(() => pricePath(this.rawTail(), this.viewport(), this.range(), this.width() - 8, HEIGHT));
  readonly paths = computed(() => this.series().map(s => ({ ...s, path: pricePath(s.points, this.viewport(), this.range(), this.width() - 8, HEIGHT), unavailable: s.points.length ? 'No values in this view' : s.unavailable })));
  readonly labels = computed(() => placeEndLabels(this.paths().flatMap(s => {
    const end = s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).at(-1);
    return end ? [{ name: s.name, token: s.token, dash: s.dash, x: this.x(end.at), y: this.y(end.price), price: end.price, at: end.at }] : [];
  }), HEIGHT, 28));
  readonly marks = computed(() => plotMarks(this.trades(), this.viewport(), this.range(), this.width() - 8, HEIGHT).map(mark => ({ ...mark, x: mark.x + 4 })));
  readonly axes = computed(() => Array.from({ length: 5 }, (_, i) => this.range().high - i * (this.range().high - this.range().low) / 4));
  readonly times = computed(() => [this.viewport().start, (this.viewport().start + this.viewport().end) / 2, this.viewport().end].map(at => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at)));
  readonly maxVolume = computed(() => Math.max(1, ...this.candles().map(p => p.candle!.volume ?? 0)));
  readonly hasVolume = computed(() => this.candles().some(p => p.candle!.volume !== null));
  readonly bodyWidth = computed(() => {
    const xs = this.candles().map(p => this.x(p.at));
    const spacing = xs.slice(1).map((x, i) => x - xs[i]).filter(x => x > 0);
    return Math.max(3, Math.min(8, spacing.length ? Math.min(...spacing) * .65 : 6));
  });
  readonly summary = computed(() => `${this.symbol()} ${chartPeriodLabel(this.period())} recorded prices. Up candles hollow; down candles filled; unchanged candles have a horizontal body. EMA 50 solid, EMA 200 dashed, VWAP dotted. ${this.hasVolume() ? 'Up volume outlined, down volume hatched.' : 'Traded volume and VWAP unavailable from this feed.'} Use arrow keys to inspect; Escape clears selection.`);

  x(at: number): number { const v = this.viewport(); return 4 + (at - v.start) / (v.end - v.start) * (this.width() - 8); }
  y(price: number): number { return priceY(price, this.range(), HEIGHT); }
  bodyTop(p: PricePoint): number { return Math.min(this.y(p.candle!.open), this.y(p.candle!.close)); }
  bodyHeight(p: PricePoint): number { return Math.max(1, Math.abs(this.y(p.candle!.open) - this.y(p.candle!.close))); }
  candleText(p: PricePoint): string {
    const c = p.candle!;
    return `${chartDate(c.time)}: ${c.close > c.open ? 'Up, hollow' : c.close < c.open ? 'Down, filled' : 'Unchanged'}, open ${chartValue(c.open, { precision: 4 })}, high ${chartValue(c.high, { precision: 4 })}, low ${chartValue(c.low, { precision: 4 })}, close ${chartValue(c.close, { precision: 4 })}${c.volume === null ? ', volume unavailable' : ', volume ' + c.volume}`;
  }
  pan(direction: number): void {
    const v = this.viewport();
    this.anchor.set(Math.max(this.extent().start + v.end - v.start, Math.min(this.extent().end, v.end + direction * (v.end - v.start) * .4)));
    this.inspected.set(null);
  }
  changeZoom(factor: number): void { this.zoom.update(value => Math.max(1, Math.min(32, value * factor))); this.inspected.set(null); }
  latest(): void { this.anchor.set(null); this.inspected.set(null); }
  inspectPointer(event: PointerEvent): void {
    const rect = this.svg().nativeElement.getBoundingClientRect();
    const at = this.viewport().start + (event.clientX - rect.left) / Math.max(1, rect.width) * (this.viewport().end - this.viewport().start);
    this.inspected.set(this.inspectable().reduce<PricePoint | null>((best, p) => !best || Math.abs(p.at - at) < Math.abs(best.at - at) ? p : best, null));
  }
  inspectKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    if (event.key === 'Escape') { this.inspected.set(null); return; }
    const points = this.inspectable();
    const index = points.findIndex(p => p.at === this.inspected()?.at);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (index < 0 ? points.length - 1 : index) + (event.key === 'ArrowRight' ? 1 : -1)));
    this.inspected.set(points[next] ?? null);
  }
  readonly inspectable = computed(() => this.visible().some(p => !p.candle) ? this.visible() : this.candles());
  ngOnChanges(): void {
    if (this.#key !== this.chartKey()) { this.#key = this.chartKey(); this.zoom.set(1); this.anchor.set(null); this.inspected.set(null); }
  }
  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.#resize = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width > 0) {
        this.width.set(Math.round(width));
      }
    });
    this.#resize.observe(this.svg().nativeElement);
  }
  ngOnDestroy(): void { this.#resize?.disconnect(); }
}
