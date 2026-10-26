import { ChartAccess, ChartFocus } from './chart-access';
import { chartPoints, type ChartSeries } from './chart-data';
import { APP_TIME_ZONE } from './app-time';
import { describeSeries, seriesTable, chartDate, chartValue, type ChartTable } from '../../../shared/chart-description';
import { describeTrades } from './technical-chart-data';
import type { TradeMark } from './trade-marks';
﻿import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
import type { StockPriceTick } from './stock-price-ticks';
import {
  chartBox,
  chartPaths,
  validPrice,
  lowerBound,
  mapX,
  mapY,
  nearestPoint,
  reducePoints,
  visiblePoints,
  EMERALD_AREA,
  performanceState,
  type ChartBox,
  type ChartRange,
} from './stock-chart-math';
import { StockChartViewport } from './stock-chart-viewport';
import { displayInterval, overviewPoints, quoteCandles, type QuoteCandle } from './stock-chart-display';

let nextChartId = 0;
// Axis and tooltip clocks are Central, like every other time the app shows.
const CLOCK = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

@Component({
  selector: 'app-stock-svg-chart',
  standalone: true,
  imports: [ChartAccess, ChartFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plot">
    <svg
      #svg [appChartFocus]="access"
      width="100%"
      height="100%"
      tabindex="0"
      role="img"
      [attr.data-performance]="performance()"
      [attr.aria-label]="label() + '. ' + chartType() + ' chart. ' + performanceText() + '. Use arrow keys to explore prices; Escape to return to live.'"
    >
      <defs>
        <linearGradient
          [id]="gradientId"
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2="0"
          y1="28"
          y2="290"
        >
          <stop offset="0%" [attr.stop-color]="palette.top" />
          <stop offset="100%" [attr.stop-color]="palette.bottom" />
        </linearGradient>
        <clipPath [id]="clipId"><rect data-clip /></clipPath>
      </defs>
      <g [attr.clip-path]="'url(#' + clipId + ')'">
        <path data-grid class="grid" fill="none" />
        <path data-area [attr.fill]="'url(#' + gradientId + ')'" />
        <path
          data-line
          fill="none"
          [attr.stroke]="palette.line"
          stroke-width="2"
          style="stroke-dasharray: var(--series-dash)"
          vector-effect="non-scaling-stroke"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle data-latest r="3" [attr.fill]="palette.line" visibility="hidden" />
        <g data-candles />
      </g>
      <g data-selection visibility="hidden" aria-hidden="true">
        <path
          data-crosshair
          fill="none"
          stroke="var(--text-tone-65)"
          stroke-opacity=".5"
          stroke-width="1"
          stroke-dasharray="3 5"
        />
        <circle data-marker r="4" [attr.fill]="palette.line" stroke="var(--surface-tone-102)" stroke-width="2" />
      </g>
      <g class="axis" aria-hidden="true">
        <text data-price="0" />
        <text data-price="1" />
        <text data-time="0" />
        <text data-time="1" />
        <text data-time="2" />
      </g>
    </svg>
    </div>
    @if (overview()) {
      <div class="plot-caption">
        @if (chartType() === 'candlestick') {
          <span>{{ intervalLabel() }} candles · empty intervals skipped</span>
          <span class="candle-key"><i class="up"></i>Up / hollow <i class="down"></i>Down / filled</span>
        } @else {
          <span>{{ intervalLabel() }} closing prices</span><span>Hover or use arrow keys to explore</span>
        }
      </div>
    }
    <app-chart-access #access [id]="gradientId" [label]="label()" [summary]="description()" [table]="dataTable()" [rawTable]="allData()" [context]="label() + windowSeconds() + chartType()" />
    <div #tooltip class="tooltip" role="status" aria-live="off" hidden></div>
    @if (empty()) {
      <p class="empty" role="status">{{ emptyLabel() }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        width: 100%;
        min-height: 180px;
        min-width: 0;
      }
      .plot { height: var(--stock-chart-height, 320px); }
      .grid { stroke: var(--line); stroke-width: 1; opacity: .6; }
      .plot-caption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 4px 16px 8px; color: var(--text-muted); font-size: 10px; }
      .candle-key { display: inline-flex; align-items: center; gap: 6px; }
      .candle-key i { width: 7px; height: 10px; border: 1.5px solid var(--chart-gain); border-radius: 1px; }
      .candle-key .down { margin-left: 7px; border-color: var(--chart-loss); background: var(--chart-loss); }
      [data-candles] { stroke-width: 1.5; stroke-linejoin: round; --candle-up: var(--chart-gain); --candle-down: var(--chart-loss); --candle-flat: var(--chart-neutral); --candle-hollow: var(--surface-tone-03); }
      @media (forced-colors: active) {
        [data-candles] { forced-color-adjust: none; --candle-up: CanvasText; --candle-down: CanvasText; --candle-flat: CanvasText; --candle-hollow: Canvas; }
        .candle-key i { border-color: CanvasText; }
        .candle-key .down { background: CanvasText; }
      }
      svg {
        display: block;
        overflow: hidden;
        touch-action: pan-y;
        outline-offset: -3px;
      }
      .axis {
        fill: var(--text-tone-65);
        font:
          10px Inter,
          ui-sans-serif,
          system-ui;
        font-variant-numeric: tabular-nums;
      }
      .tooltip {
        position: absolute;
        top: 4px;
        left: 16px;
        max-width: calc(100% - 32px);
        padding: 7px 10px;
        border: 1px solid var(--surface-tone-104);
        border-radius: 8px;
        background: var(--surface-tone-103);
        color: var(--text-tone-66);
        font:
          12px Inter,
          ui-sans-serif,
          system-ui;
        pointer-events: none;
      }
      .empty {
        position: absolute;
        inset: 40% 16px auto;
        text-align: center;
        color: var(--text-tone-65);
        font:
          13px Inter,
          ui-sans-serif,
          system-ui;
      }
    `,
  ],
})
export class StockSvgChart implements AfterViewInit, OnChanges, OnDestroy {
  readonly chartType = input<'line' | 'candlestick'>('line');
  readonly overview = input(false);
  readonly intervalSeconds = signal(60);
  readonly intervalLabel = computed(() => this.intervalSeconds() < 60 ? `${this.intervalSeconds()}s` : `${this.intervalSeconds() / 60}m`);
  readonly windowSeconds = input(86400);
  readonly label = input('Stock price');
  readonly emptyLabel = input('No prices available yet');
  readonly palette = EMERALD_AREA;
  readonly trades = input<readonly TradeMark[]>([]);
  readonly averageCost = input<number | null>(null);
  readonly privateValues = input(false);
  readonly accessPoints = signal<readonly { at: number; value: number }[]>([]);
  readonly accessCurrency = signal('USD');
  readonly chartSeries = computed<ChartSeries>(() => ({ id: this.label(), label: this.label(), unit: 'USD',
    points: chartPoints(this.accessPoints(), p => p.at, p => p.value), status: this.accessPoints().length ? 'ready' : 'empty' }));
  readonly accessOpening = signal<number | null>(null);
  readonly viewTrades = computed(() => {
    const points = this.accessPoints();
    return this.trades().filter(t => points.length && t.at >= points[0].at && t.at <= points.at(-1)!.at);
  });
  readonly description = computed(() => describeSeries(this.accessPoints(), { name: this.label(), currency: this.accessCurrency(), empty: this.emptyLabel(), period: this.windowSeconds() === 86400 ? 'one day' : `last ${this.windowSeconds()} seconds` }) + ' ' + this.performanceText() + '. ' + describeTrades(this.viewTrades(), this.accessPoints().at(-1)?.value, this.averageCost(), this.privateValues())
    + (this.chartType() === 'candlestick' ? ` ${this.intervalLabel()} candles show the open, high, low and close of recorded quotes, not exchange trades. Candles are evenly spaced; empty time intervals are skipped. Labels and inspection show actual recorded times. Hollow bodies rise, filled bodies fall; a horizontal body is unchanged.` : this.overview() ? ` Line shows ${this.intervalLabel()} closing prices; inspection and the table retain recorded quotes.` : ''));
  readonly dataTable = computed<ChartTable>(() => this.chartType() === 'candlestick' ? {
    note: `${this.intervalLabel()} candles from recorded quotes. Open and close are the first and last quote in each interval. Empty intervals are omitted.`,
    grouped: true,
    references: this.makeTable(true).references,
    columns: ['Time', 'Open', 'High', 'Low', 'Close'],
    rows: quoteCandles(this.accessPoints().map(p => ({ time: p.at / 1000, price: p.value })), this.intervalSeconds())
      .map(c => [chartDate(c.time * 1000), ...[c.open, c.high, c.low, c.close].map(value => chartValue(value, { currency: this.accessCurrency() }))]),
  } : this.makeTable(true));
  readonly allData = computed(() => this.makeTable(false));
  private makeTable(group: boolean): ChartTable {
    const table = seriesTable(this.accessPoints(), { currency: this.accessCurrency() }, group);
    table.references = [
      ...(this.accessOpening() !== null ? [{ label: 'Session open', value: chartValue(this.accessOpening()!, { currency: this.accessCurrency() }) }] : []),
      ...(!this.privateValues() && this.averageCost() !== null && Number.isFinite(this.averageCost()) ? [{ label: 'Average cost reference', value: chartValue(this.averageCost()!, { currency: this.accessCurrency() }) }] : []),
    ];
    if (this.privateValues() || !this.viewTrades().length) { return table; }
    return { ...table, columns: [...table.columns, 'Your trades'], rows: [
      ...table.rows.map(row => [...row, '']),
      ...this.viewTrades().map(t => [chartDate(t.at), ...table.columns.slice(1).map(() => ''), `${t.side === 'BUY' ? 'Bought' : 'Sold'} ${t.quantity} at ${chartValue(t.price, { currency: this.accessCurrency() })}`]),
    ] };
  }
  readonly empty = signal(true);
  readonly performance = signal<'gain' | 'loss' | 'neutral'>('neutral');
  readonly performanceText = signal('Session comparison unavailable');
  readonly gradientId = `stock-gradient-${++nextChartId}`;
  readonly clipId = `stock-clip-${nextChartId}`;
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly tooltip = viewChild.required<ElementRef<HTMLDivElement>>('tooltip');
  readonly #zone = inject(NgZone);
  readonly #platform = inject(PLATFORM_ID);
  #viewport: StockChartViewport | undefined;
  #observer: ResizeObserver | undefined;
  #events: AbortController | undefined;
  #motion: MediaQueryList | undefined;
  #nodes = new Map<string, SVGElement>();
  #points: readonly StockPriceTick[] = [];
  #range: ChartRange | undefined;
  #box: ChartBox = chartBox(600, 320);
  #selection: StockPriceTick | undefined;
  #currency = 'USD';
  #format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  #resizeFrame: number | undefined;
  #candles: QuoteCandle[] = [];

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.#platform)) {
      return;
    }
    this.#zone.runOutsideAngular(() => {
      const svg = this.svg().nativeElement;
      for (const name of ['area', 'line', 'clip', 'latest', 'selection', 'crosshair', 'marker', 'candles', 'grid']) {
        this.#nodes.set(name, svg.querySelector(`[data-${name}]`)!);
      }
      this.#motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.#viewport = new StockChartViewport(
        (points, range) => this.#draw(points, range),
        this.windowSeconds(),
        () => this.#motion?.matches ?? false,
      );
      this.#events = new AbortController();
      const signal = this.#events.signal;
      this.#motion.addEventListener(
        'change',
        () => {
          if (this.#motion?.matches) {
            this.#viewport?.finishAnimation();
          }
        },
        { signal },
      );
      svg.addEventListener('pointermove', (event) => this.#selectAt(event.clientX), { signal });
      svg.addEventListener(
        'pointerdown',
        (event) => {
          if (event.pointerType !== 'mouse') {
            svg.setPointerCapture?.(event.pointerId);
          }
          this.#selectAt(event.clientX);
        },
        { signal },
      );
      for (const type of ['pointerleave', 'pointercancel', 'pointerup', 'blur']) {
        svg.addEventListener(type, () => this.#clearSelection(), { signal });
      }
      svg.addEventListener('keydown', (event) => this.#keyboard(event), { signal });
      this.#observer = new window.ResizeObserver(() => {
        if (this.#resizeFrame !== undefined) {
          return;
        }
        this.#resizeFrame = requestAnimationFrame(() => {
          this.#resizeFrame = undefined;
          this.#viewport?.refresh();
        });
      });
      this.#observer.observe(svg);
    });
  }
  ngOnChanges(): void {
    this.#zone.runOutsideAngular(() => {
      if (!this.#viewport) return;
      this.#clearSelection();
      this.#viewport?.setWindowSeconds(this.windowSeconds());
      this.#viewport?.refresh();
    });
  }
  setHistory(points: readonly StockPriceTick[]): void {
    this.#clearSelection();
    this.#viewport?.setHistory(points);
    const hasPrices = points.some(validPrice);
    this.empty.set(!hasPrices);
    if (!hasPrices) {
      this.accessPoints.set([]);
      this.accessOpening.set(null);
      this.performance.set('neutral');
      this.performanceText.set('Session comparison unavailable');
      this.#points = [];
      this.#range = undefined;
      this.#nodes.get('line')?.setAttribute('d', '');
      this.#nodes.get('area')?.setAttribute('d', '');
      this.#nodes.get('candles')?.replaceChildren();
      this.#nodes.get('grid')?.setAttribute('d', '');
      this.#candles = [];
      this.#nodes.get('latest')?.setAttribute('visibility', 'hidden');
      this.svg()
        .nativeElement.querySelectorAll('text')
        .forEach((node) => (node.textContent = ''));
    }
  }
  append(point: StockPriceTick): void {
    this.#viewport?.append(point);
  }
  /**
   * Publishes the session verdict as `data-performance`; the stylesheet turns that into the
   * palette's gain or loss colour, gradient and dash. Every palette gets both states.
   */
  setPerformance(price: number, open: number | null, currency = 'USD'): void {
    this.accessCurrency.set(currency);
    this.accessOpening.set(open !== null && Number.isFinite(open) && open > 0 ? open : null);
    const state = performanceState(price, open);
    this.performance.set(state);
    // At-the-open counts as a gain for styling, but the label still says so plainly.
    this.performanceText.set(
      state === 'neutral' ? 'Session comparison unavailable'
        : price === open ? 'Unchanged from session open'
          : state === 'loss' ? 'Below session open' : 'Above session open',
    );
    if (currency !== this.#currency) {
      this.#currency = currency;
      this.#format = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    }
  }
  ngOnDestroy(): void {
    this.#viewport?.destroy();
    this.#observer?.disconnect();
    this.#events?.abort();
    if (this.#resizeFrame !== undefined) {
      cancelAnimationFrame(this.#resizeFrame);
    }
  }
  #attr(name: string, attrs: Record<string, string | number>): void {
    const node = this.#nodes.get(name)!;
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
  }
  #draw(points: readonly StockPriceTick[], range: ChartRange): void {
    // Freeze the inspection copy as well as the viewport; live updates remain buffered.
    this.#points = [...points];
    this.#range = range;
    const observations = points.filter(p => p.time >= range.from && p.time <= Math.min(range.to, range.reveal)).map(p => ({ at: p.time * 1000, value: p.price }));
    const before = this.accessPoints();
    if (observations.length !== before.length || observations.some((p, i) => p.at !== before[i].at || p.value !== before[i].value)) {
      this.#zone.run(() => this.accessPoints.set(observations));
    }
    if (this.empty()) {
      this.empty.set(false);
    }
    const svg = this.svg().nativeElement,
      { width, height } = svg.getBoundingClientRect();
    if (width < 1 || height < 1) {
      return;
    }
    const box = (this.#box = chartBox(width, height));
    const visible = visiblePoints(points, range.from, range.to);
    const interval = displayInterval(range.to - range.from, box.right - box.left);
    if (interval !== this.intervalSeconds()) this.#zone.run(() => this.intervalSeconds.set(interval));
    const display = this.overview() ? overviewPoints(visible, interval) : reducePoints(visible, range, (box.right - box.left) / 2);
    // Connect recorded prices across sparse intervals, matching the novice line chart.
    // Inspection and candles still use only the observations that actually exist.
    const paths = chartPaths(display, range, box);
    const candles = this.chartType() === 'candlestick';
    this.#attr('line', { d: paths.line, visibility: candles ? 'hidden' : 'visible' });
    this.#attr('area', { d: paths.area, visibility: candles ? 'hidden' : 'visible', opacity: this.overview() ? .45 : 1 });
    this.#attr('grid', { d: this.overview() ? [.25, .5, .75].map(t => `M${box.left},${box.top + (box.bottom - box.top) * t} H${box.right}`).join(' ') : '' });
    this.#candles = candles ? quoteCandles(visible.filter(p => p.time >= range.from && p.time <= Math.min(range.to, range.reveal)), interval) : [];
    const candleWidth = Math.max(1, Math.min(12, (box.right - box.left) / Math.max(1, this.#candles.length) * .65));
    this.#nodes.get('candles')!.replaceChildren(...this.#candles.map((candle, index) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x = this.#candleX(index);
      const top = mapY(Math.max(candle.open, candle.close), range, box);
      const bottom = Math.max(top + 1, mapY(Math.min(candle.open, candle.close), range, box));
      const direction = candle.close > candle.open ? 'up' : candle.close < candle.open ? 'down' : 'flat';
      node.setAttribute('class', direction);
      node.setAttribute('stroke', `var(--candle-${direction})`);
      node.setAttribute('fill', direction === 'down' ? 'var(--candle-down)' : 'var(--candle-hollow)');
      node.setAttribute('d', `M${x},${mapY(candle.high, range, box)} V${top} M${x},${bottom} V${mapY(candle.low, range, box)} M${x - candleWidth / 2},${top} h${candleWidth} V${bottom} h${-candleWidth} Z`);
      return node;
    }));
    this.#attr('clip', {
      x: box.left,
      y: box.top,
      width: candles ? box.right - box.left : Math.max(0, Math.min(box.right, mapX(range.reveal, range, box) + 4) - box.left),
      height: box.bottom - box.top,
    });
    const gradient = svg.querySelector('linearGradient')!;
    gradient.setAttribute('y1', String(box.top));
    gradient.setAttribute('y2', String(box.bottom));
    const last = points.at(-1);
    if (last) {
      this.#attr('latest', {
        cx: mapX(last.time, range, box),
        cy: mapY(last.price, range, box),
        visibility: !candles && last.time <= range.reveal ? 'visible' : 'hidden',
      });
    }
    svg.querySelectorAll<SVGTextElement>('[data-time]').forEach((node, index) => {
      const candleIndex = Math.round((this.#candles.length - 1) * index / 2);
      const candle = this.#candles[candleIndex];
      const time = candle ? candle.time : range.from + ((range.to - range.from) * index) / 2;
      node.setAttribute('x', String(candle ? this.#candleX(candleIndex) : mapX(time, range, box)));
      node.setAttribute('y', String(height - 9));
      node.setAttribute('text-anchor', index === 0 ? 'start' : index === 2 ? 'end' : 'middle');
      node.textContent = CLOCK.format(time * 1000);
    });
    svg.querySelectorAll<SVGTextElement>('[data-price]').forEach((node, index) => {
      node.setAttribute('x', String(box.right));
      node.setAttribute('y', String(index ? box.bottom - 5 : box.top - 10));
      node.setAttribute('text-anchor', 'end');
      node.textContent = this.#format.format(index ? range.min : range.max);
    });
    if (this.#selection) {
      const point = candles ? nearestPoint(this.#inspectable(), this.#selection.time) : this.#selection;
      if (point) this.#showSelection(point);
    }
  }
  #inspectable(): readonly StockPriceTick[] {
    if (this.chartType() === 'candlestick') return this.#candles.map(c => ({ time: (c.time + c.endTime) / 2, price: c.close }));
    const range = this.#range;
    return range
      ? this.#points.slice(
          lowerBound(this.#points, range.from),
          lowerBound(this.#points, Math.min(range.to, range.reveal) + 0.0001),
        )
      : [];
  }
  #candleX(index: number): number {
    return this.#box.left + (index + .5) / Math.max(1, this.#candles.length) * (this.#box.right - this.#box.left);
  }
  #selectAt(clientX: number): void {
    if (!this.#range) {
      return;
    }
    const box = this.#box;
    const x = Math.max(
      box.left,
      Math.min(box.right, clientX - this.svg().nativeElement.getBoundingClientRect().left),
    );
    const time =
      this.#range.from +
      ((x - box.left) / (box.right - box.left)) * (this.#range.to - this.#range.from);
    const points = this.#inspectable();
    const point = this.chartType() === 'candlestick'
      ? points[Math.min(points.length - 1, Math.floor((x - box.left) / (box.right - box.left) * points.length))]
      : nearestPoint(points, time);
    if (!point) {
      return;
    }
    this.#viewport?.pause();
    this.#showSelection(point);
  }
  #showSelection(point: StockPriceTick): void {
    if (!this.#range) {
      return;
    }
    this.#selection = point;
    const candleIndex = this.chartType() === 'candlestick'
      ? this.#candles.findIndex(c => (c.time + c.endTime) / 2 === point.time) : -1;
    const box = this.#box,
      x = candleIndex >= 0 ? this.#candleX(candleIndex) : mapX(point.time, this.#range, box),
      y = mapY(point.price, this.#range, box);
    this.#attr('selection', { visibility: 'visible' });
    this.#attr('marker', { cx: x, cy: y });
    this.#attr('crosshair', { d: `M${x},${box.top} V${box.bottom}` });
    const tooltip = this.tooltip().nativeElement;
    tooltip.hidden = false;
    tooltip.textContent = `${this.#format.format(point.price)} · ${TIME.format(point.time * 1000)}`;
    if (this.chartType() === 'candlestick') {
      const candle = this.#candles.find(c => (c.time + c.endTime) / 2 === point.time);
      if (candle) tooltip.textContent = `${TIME.format(candle.time * 1000)} · ${candle.close > candle.open ? 'Up' : candle.close < candle.open ? 'Down' : 'Unchanged'} · O ${this.#format.format(candle.open)}  H ${this.#format.format(candle.high)}  L ${this.#format.format(candle.low)}  C ${this.#format.format(candle.close)}`;
    }
  }
  #clearSelection(): void {
    this.#selection = undefined;
    this.#nodes.get('selection')?.setAttribute('visibility', 'hidden');
    this.tooltip().nativeElement.hidden = true;
    this.tooltip().nativeElement.setAttribute('aria-live', 'off');
    this.#viewport?.resume();
  }
  #keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.#clearSelection();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const points = this.#inspectable();
    if (!points.length) {
      return;
    }
    event.preventDefault();
    this.#viewport?.pause();
    let index = this.#selection ? lowerBound(points, this.#selection.time) : points.length - 1;
    index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? points.length - 1
          : Math.max(0, Math.min(points.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
    this.tooltip().nativeElement.setAttribute('aria-live', 'polite');
    this.#showSelection(points[index]);
  }
}
