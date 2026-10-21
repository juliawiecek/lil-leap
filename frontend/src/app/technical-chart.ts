import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import type { PricePoint } from './market-feed-api';
import { displayCandles, indicators, placeEndLabels } from './technical-chart-math';
import { pricePath, priceRange, priceY, plotMarks, type ChartWindow, type TradeMark } from './trade-marks';

let chartId = 0;
const HEIGHT = 180;

/** Native SVG enhancement of the existing history plot; no new market requests or chart library. */
@Component({
  selector: 'app-technical-chart',
  imports: [CurrencyPipe, DecimalPipe],
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
  readonly height = HEIGHT;
  readonly width = signal(600);
  readonly zoom = signal(1);
  readonly anchor = signal<number | null>(null);
  readonly inspected = signal<PricePoint | null>(null);
  readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('plot');
  #resize?: ResizeObserver;
  #key = '';

  readonly viewport = computed(() => {
    const base = this.window(), span = Math.max(1, (base.end - base.start) / this.zoom());
    const end = Math.max(base.start + span, Math.min(base.end, this.anchor() ?? base.end));
    return { start: end - span, end };
  });
  readonly source = computed(() => [...this.points()].filter(p => Number.isFinite(p.at) && Number.isFinite(p.price) && p.price > 0).sort((a, b) => a.at - b.at));
  readonly visible = computed(() => this.source().filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end));
  readonly candles = computed(() => displayCandles(this.visible(), this.width() / 7));
  readonly series = computed(() => indicators(this.source()));
  readonly range = computed(() => priceRange([
    ...this.visible().flatMap(p => p.candle ? [p.candle.low, p.candle.high] : [p.price]),
    ...this.series().flatMap(s => s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).map(p => p.price)),
    ...this.trades().filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).map(p => p.price), this.averageCost() ?? 0,
  ]) ?? { low: 0, high: 1 });
  readonly line = computed(() => pricePath(this.source(), this.viewport(), this.range(), this.width() - 8, HEIGHT));
  readonly paths = computed(() => this.series().map(s => ({ ...s, path: pricePath(s.points, this.viewport(), this.range(), this.width() - 8, HEIGHT), unavailable: s.points.length ? 'No values in this view' : s.unavailable })));
  readonly labels = computed(() => placeEndLabels(this.paths().flatMap(s => {
    const end = s.points.filter(p => p.at >= this.viewport().start && p.at <= this.viewport().end).at(-1);
    return end ? [{ name: s.name, token: s.token, dash: s.dash, x: this.x(end.at), y: this.y(end.price), price: end.price, at: end.at }] : [];
  }), HEIGHT, 28));
  readonly marks = computed(() => plotMarks(this.trades(), this.viewport(), this.range(), this.width() - 8, HEIGHT).map(mark => ({ ...mark, x: mark.x + 4 })));
  readonly axes = computed(() => Array.from({ length: 5 }, (_, i) => this.range().high - i * (this.range().high - this.range().low) / 4));
  readonly times = computed(() => [this.viewport().start, (this.viewport().start + this.viewport().end) / 2, this.viewport().end].map(at => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(at)));
  readonly maxVolume = computed(() => Math.max(1, ...this.candles().map(p => p.candle!.volume ?? 0)));
  readonly hasVolume = computed(() => this.candles().some(p => p.candle!.volume !== null));
  readonly bodyWidth = computed(() => {
    const xs = this.candles().map(p => this.x(p.at));
    const spacing = xs.slice(1).map((x, i) => x - xs[i]).filter(x => x > 0);
    return Math.max(3, Math.min(8, spacing.length ? Math.min(...spacing) * .65 : 6));
  });
  readonly summary = computed(() => `${this.symbol()} ${this.period()} recorded prices. Up candles hollow; down candles filled; unchanged candles have a horizontal body. EMA 50 solid, EMA 200 dashed, VWAP dotted. ${this.hasVolume() ? 'Up volume outlined, down volume hatched.' : 'Traded volume and VWAP unavailable from this feed.'} Use arrow keys to inspect; Escape clears selection.`);

  x(at: number): number { const v = this.viewport(); return 4 + (at - v.start) / (v.end - v.start) * (this.width() - 8); }
  y(price: number): number { return priceY(price, this.range(), HEIGHT); }
  bodyTop(p: PricePoint): number { return Math.min(this.y(p.candle!.open), this.y(p.candle!.close)); }
  bodyHeight(p: PricePoint): number { return Math.max(1, Math.abs(this.y(p.candle!.open) - this.y(p.candle!.close))); }
  candleText(p: PricePoint): string {
    const c = p.candle!;
    return `${new Date(c.time).toLocaleString()}: ${c.close > c.open ? 'Up, hollow' : c.close < c.open ? 'Down, filled' : 'Unchanged'}, open ${c.open}, high ${c.high}, low ${c.low}, close ${c.close}${c.volume === null ? ', volume unavailable' : ', volume ' + c.volume}`;
  }
  pan(direction: number): void {
    const v = this.viewport();
    this.anchor.set(Math.max(this.window().start + v.end - v.start, Math.min(this.window().end, v.end + direction * (v.end - v.start) * .4)));
    this.inspected.set(null);
  }
  changeZoom(factor: number): void { this.zoom.update(value => Math.max(1, Math.min(32, value * factor))); this.inspected.set(null); }
  latest(): void { this.anchor.set(null); this.inspected.set(null); }
  inspectPointer(event: PointerEvent): void {
    const rect = this.svg().nativeElement.getBoundingClientRect();
    const at = this.viewport().start + (event.clientX - rect.left) / Math.max(1, rect.width) * (this.viewport().end - this.viewport().start);
    this.inspected.set(this.candles().reduce<PricePoint | null>((best, p) => !best || Math.abs(p.at - at) < Math.abs(best.at - at) ? p : best, null));
  }
  inspectKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { this.inspected.set(null); return; }
    const points = this.candles();
    const index = points.findIndex(p => p.at === this.inspected()?.at);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (index < 0 ? points.length - 1 : index) + (event.key === 'ArrowRight' ? 1 : -1)));
    this.inspected.set(points[next] ?? null);
  }
  ngOnChanges(): void {
    if (this.#key !== this.chartKey()) { this.#key = this.chartKey(); this.zoom.set(1); this.anchor.set(null); this.inspected.set(null); }
  }
  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.#resize = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width > 0) this.width.set(Math.round(width)); });
    this.#resize.observe(this.svg().nativeElement);
  }
  ngOnDestroy(): void { this.#resize?.disconnect(); }
}
