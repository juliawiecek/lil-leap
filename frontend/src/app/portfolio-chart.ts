import { ChartAccess, ChartFocus } from './chart-access';
import { chartPoints, type ChartSeries } from './chart-data';
import { chartValue, describeSeries, seriesTable } from '../../../shared/chart-description';
import {
  Component,
  ElementRef,
  Injector,
  NgZone,
  effect,
  inject,
  computed,
  input,
  output,
  signal,
  viewChild,
  type AfterViewInit,
  type OnDestroy,
  type EffectRef,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import {
  CHART_PERIODS,
  ChartPeriod,
  ChartRange,
  ValuePoint,
  plotSeries,
  startValue,
  valueScale,
  historyCoverage,
} from './portfolio-history';
import { centralDay, centralTime } from './app-time';
import { PERIOD_NAMES } from './chart-speech';
import {
  EMERALD_AREA,
  chartPaths,
  smoothPricePath,
  mapY,
  visiblePoints,
  type ChartRange as SvgRange,
} from './stock-chart-math';
import { SvgRangeAnimation } from './svg-range-animation';

const WIDTH = 800;
const HEIGHT = 200;
const RECENT_MS = 60 * 60 * 1000;
const INSET_X = 8;
const INSET_Y = 12;
let nextPortfolioChartId = 0;

/**
 * The novice overview's custom emerald area chart, with a dotted baseline at the period's starting value, round-value
 * gridlines and start/middle/end times. Every recorded value
 * is its own point, so each rise and dip stays in the line as new values arrive; the scale refits
 * to the values shown. Dense 1D data opens on the recent hour, with the full day one tap away.
 * Hovering (or arrow keys) scrubs along the line and reports the point under the cursor, so the
 * value above the chart can follow it; the time under the cursor is shown in Central time.
 */
@Component({
  selector: 'app-portfolio-chart',
  imports: [CurrencyPipe, ChartAccess, ChartFocus],
  template: `
    @if (error()) {
      <p class="chart-note" role="alert">{{ error() }}</p>
    } @else if (loading() || history().length < 2) {
      <div class="chart-empty" aria-live="polite">
        {{
          loading() ? 'Loading ' + historyName() + '…' : emptyText()
        }}
      </div>
    } @else {
      <div class="chart" [class.down]="tone() === 'down'">
        <div class="plot">
        <!-- Recessive HTML gridlines sit behind the SVG; text in the stretched SVG would distort. -->
        <div class="value-axis" aria-hidden="true">
          @for (tick of valueTicks(); track tick.value) {
            <span class="gridline" [style.top.%]="tick.top"><span>{{ tick.label }}</span></span>
          }
        </div>
        <svg
          #svg
          [attr.viewBox]="viewBox"
          preserveAspectRatio="none"
          role="img"
          [attr.data-performance]="tone() === 'flat' ? 'neutral' : tone() === 'down' ? 'loss' : 'gain'"
          tabindex="0"
          [attr.aria-label]="subject() + ' chart'" [appChartFocus]="access"
          (pointermove)="scrubAt($event)"
          (pointerdown)="scrubAt($event)"
          (pointerleave)="endScrub()"
          (pointercancel)="endScrub()"
          (pointerup)="endScrub()"
          (blur)="endScrub()"
          (keydown)="scrubKey($event)"
        >
          <defs>
            <linearGradient
              [id]="gradientId"
              gradientUnits="userSpaceOnUse"
              x1="0"
              x2="0"
              y1="0"
              [attr.y2]="height"
            >
              <stop offset="0%" [attr.stop-color]="areaStyle.top" />
              <stop offset="100%" [attr.stop-color]="areaStyle.bottom" />
            </linearGradient>
            <clipPath [id]="clipId">
              <rect x="0" y="0" [attr.width]="width" [attr.height]="height" />
            </clipPath>
          </defs>
          <!-- Animation owns geometry; change detection must not overwrite an in-flight frame. -->
          <g [attr.clip-path]="'url(#' + clipId + ')'">
            <path class="area" [attr.fill]="'url(#' + gradientId + ')'" />
            <line
              class="baseline"
              x1="0"
              [attr.x2]="width"
            />
            <path class="line" />
          </g>
          @if (active(); as point) {
            <line
              class="cursor"
              [attr.x1]="point.x"
              [attr.x2]="point.x"
              y1="0"
              [attr.y2]="height"
            />
          }
          @if (active(); as point) {
            <path class="dot" [attr.d]="'M' + point.x + ',' + point.y + ' l0,0'" />
          } @else {
            <path class="dot endpoint" />
          }
        </svg>
        @if (active(); as point) {
          <span class="cursor-time" [style.left.%]="labelLeft()" [style.transform]="'translateX(-' + labelLeft() + '%)'"
            >{{ cursorTime() }} · {{ point.value | currency }}</span
          >
        }
        </div>
        <div class="time-axis" aria-hidden="true">
          @for (tick of timeTicks(); track tick.at) {
            <span [style.left.%]="tick.left">{{ tick.label }}</span>
          }
        </div>
      </div>
    }
    <!-- Every time control sits in one row directly under the plot. -->
    <div class="time-controls">
      <div
        class="periods"
        role="group"
        aria-label="Chart time range"
        [class.down]="tone() === 'down'"
      >
        @for (item of periods; track item) {
          <button
            type="button"
            [class.selected]="period() === item"
            [attr.aria-pressed]="period() === item"
            [attr.data-speak]="periodNames[item]"
            [attr.title]="periodNames[item]"
            (click)="periodChange.emit(item)"
          >
            {{ item }}
          </button>
        }
      </div>
      @if (!error() && !loading() && history().length >= 2 && period() === '1D' && canFocus()) {
        <div class="day-window" role="group" aria-label="Day chart detail">
          <button
            type="button"
            [attr.aria-pressed]="dayView() === 'recent'"
            (click)="setDayView('recent')"
          >
            Recent hour
          </button>
          <button
            type="button"
            [attr.aria-pressed]="dayView() === 'full'"
            [attr.title]="subject() === 'Portfolio value' ? 'Current Central-time calendar day, including deposits and transfers' : 'Current Central-time calendar day'"
            (click)="setDayView('full')"
          >
            Full day
          </button>
        </div>
      }
    </div>
    @if (notice() && notice() !== 'Account value includes deposits and transfers.') { <p class="chart-note" role="status">{{ notice() }}</p> }
    <app-chart-access #access [id]="gradientId" [label]="subject()" [summary]="description()" [table]="dataTable()" [rawTable]="allData()" [context]="subject() + period() + dayView() + accountKey()" />
    @if (delayed() && history().length >= 2) {
      <p class="chart-note delayed" role="status">
        Live prices are delayed, so the line ends at the last known value.
      </p>
    }
    @if (range()?.fromOpening && history().length >= 2 && !focused() && coverage().status === 'complete') {
      <p class="chart-note">
        Available account history starts {{ openedText() }}.
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 14px;
        --up: var(--chart-gain);
        --down: var(--chart-gain);
      }
      .chart {
        --tone: var(--up);
        --gutter: 64px;
      }
      .chart.down {
        --tone: var(--down);
      }
      /* The top margin keeps the hover label clear of the value header above the chart. */
      .plot {
        position: relative;
        margin: 36px var(--gutter) 0 0;
      }
      .value-axis {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .gridline {
        position: absolute;
        left: 0;
        right: 0;
        border-top: 1px solid var(--surface-tone-08);
      }
      .gridline span,
      .time-axis span {
        position: absolute;
        color: var(--text-subtle);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .gridline span {
        left: calc(100% + 8px);
        transform: translateY(-50%);
      }
      .time-axis {
        position: relative;
        height: 16px;
        margin: 6px var(--gutter) 0 0;
      }
      .time-axis span {
        transform: translateX(-50%);
      }
      .time-axis span:first-child {
        transform: none;
      }
      .time-axis span:last-child {
        transform: translateX(-100%);
      }
      svg {
        /* Paint after the positioned gridlines so they stay behind the price series. */
        position: relative;
        display: block;
        width: 100%;
        height: 300px;
        overflow: hidden;
        cursor: crosshair;
        outline: none;
        touch-action: pan-y;
      }
      svg:focus-visible {
        outline: 2px solid var(--tone);
        outline-offset: 6px;
        border-radius: 4px;
      }
      /* Never reveal the path with a dash animation: the endpoint must always be connected. */
      .line {
        fill: none;
        stroke: var(--area-line);
        stroke-dasharray: var(--series-dash);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        shape-rendering: geometricPrecision;
      }
      .baseline {
        stroke: var(--surface-tone-58);
        stroke-width: 1;
        stroke-dasharray: 1 5;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      .cursor {
        stroke: var(--text-muted);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .area { opacity: 0.7; }
      /* A round, non-scaling stroke keeps the dot circular in the responsive SVG. */
      .dot {
        fill: none;
        stroke: var(--area-line);
        stroke-width: 7;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .time-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px 12px;
        margin-top: 12px;
      }
      .day-window {
        display: flex;
        gap: 6px;
        font-size: 12px;
      }
      .day-window button {
        min-height: 34px;
        padding: 5px 10px;
        border: 1px solid var(--surface-tone-10);
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font: inherit;
        cursor: pointer;
      }
      .day-window button[aria-pressed='true'] {
        color: var(--text);
        background: var(--surface-tone-101);
      }
      .day-window button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .chart-note.delayed {
        color: var(--warning);
      }
      /* The plot's top margin reserves space for inspection. Shift the label by its
         position across the chart to keep both ends inside the plot. */
      .cursor-time {
        box-sizing: border-box;
        width: max-content;
        max-width: 100%;
        position: absolute;
        top: -32px;
        transform: translateX(-50%);
        padding: 4px 10px;
        border: 1px solid var(--surface-tone-10);
        border-radius: 8px;
        background: var(--surface-wash-100);
        color: var(--text);
        font-size: 12px;
        font-weight: 600;
        white-space: normal;
        text-align: center;
        pointer-events: none;
      }
      .chart-empty {
        display: grid;
        place-items: center;
        height: 300px;
        color: var(--text-subtle);
        font-size: 13px;
      }
      .periods {
        box-sizing: border-box;
        display: flex;
        width: max-content;
        max-width: 100%;
        gap: 2px;
        padding: 4px;
        border: 1px solid var(--surface-tone-08);
        border-radius: 12px;
        background: var(--surface-wash-16);
        --tone: var(--up);
      }
      .periods.down {
        --tone: var(--down);
      }
      .periods button {
        min-width: 44px;
        min-height: 34px;
        padding: 0 10px;
        border: 0;
        border-radius: 9px;
        background: transparent;
        color: var(--text-subtle);
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition:
          background-color 0.15s,
          color 0.15s;
      }
      .periods button:hover {
        color: var(--text);
      }
      .periods button.selected {
        background: var(--accent);
        color: var(--on-accent);
      }
      .periods button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .chart-note {
        margin: 8px 0 0;
        color: var(--text-subtle);
        font-size: 12px;
      }
      @media (max-width: 600px) {
        svg,
        .chart-empty {
          height: 220px;
        }
        .chart {
          --gutter: 52px;
        }
        .gridline span,
        .time-axis span {
          font-size: 10px;
        }
        .periods {
          width: 100%;
        }
        .periods button {
          flex: 1;
          min-width: 0;
          padding-inline: 6px;
        }
      }
    `,
  ],
})
export class PortfolioChart implements AfterViewInit, OnDestroy {
  readonly areaStyle = EMERALD_AREA;
  readonly gradientId = `portfolio-gradient-${++nextPortfolioChartId}`;
  readonly clipId = `portfolio-clip-${nextPortfolioChartId}`;
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  readonly #injector = inject(Injector);
  readonly #zone = inject(NgZone, { optional: true });
  #animation: SvgRangeAnimation | undefined;
  #renderEffect: EffectRef | undefined;
  #motion: MediaQueryList | undefined;
  #events: AbortController | undefined;
  #drawPoints: readonly { time: number; price: number }[] = [];
  #baseline = 0;

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.#motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#animation = new SvgRangeAnimation(
      (range) => this.#drawRange(range),
      () => this.#motion?.matches ?? false,
    );
    this.#events = new AbortController();
    this.#motion.addEventListener(
      'change',
      () => {
        if (this.#motion?.matches) {
          this.#animation?.finish();
        }
      },
      { signal: this.#events.signal },
    );
    let previousSvg: SVGSVGElement | undefined,
      previousKey = '';
    this.#renderEffect = effect(
      () => {
        const svg = this.svg()?.nativeElement,
          displayed = this.plotPoints(),
          history = this.history();
        const scale = this.scale();
        const key = `${this.period()}:${this.dayView()}:${this.range()?.start ?? ''}`;
        if (previousKey && previousKey !== key && this.#inspection() !== null) {
          this.endScrub();
          return;
        }
        if (!svg || displayed.length < 2) {
          this.#animation?.cancel();
          previousSvg = undefined;
          return;
        }
        const points = displayed.map((point) => ({
          time: point.at,
          price: point.value,
        }));
        const to = this.plotWindow().end;
        const from = this.plotWindow().start;
        this.#drawPoints = points;
        this.#baseline = startValue(history);
        const animate = previousSvg === svg && previousKey === key;
        const draw = () =>
          this.#animation?.move(
            { from, to: Math.max(from + 1, to), min: scale.low, max: scale.high, reveal: to },
            animate,
          );
        if (this.#zone) {
          this.#zone.runOutsideAngular(draw);
        } else {
          draw();
        }
        previousSvg = svg;
        previousKey = key;
      },
      { injector: this.#injector },
    );
  }
  ngOnDestroy(): void {
    this.#renderEffect?.destroy();
    this.#animation?.destroy();
    this.#events?.abort();
  }
  #drawRange(range: SvgRange): void {
    const svg = this.svg()?.nativeElement;
    if (!svg) {
      return;
    }
    const box = { left: 0, right: WIDTH, top: 0, bottom: HEIGHT };
    const paths = chartPaths(visiblePoints(this.#drawPoints, range.from, range.to), range, box);
    svg.querySelector('.line')?.setAttribute('d', paths.line);
    svg.querySelector('.area')?.setAttribute('d', paths.area);
    const last = this.#drawPoints.at(-1);
    if (last) {
      const x = ((last.time - range.from) / (range.to - range.from)) * WIDTH;
      svg
        .querySelector('.endpoint')
        ?.setAttribute('d', `M${x},${mapY(last.price, range, box)} l0,0`);
    }
    const baseline = svg.querySelector('.baseline'),
      y = mapY(this.#baseline, range, box);
    baseline?.setAttribute('y1', String(y));
    baseline?.setAttribute('y2', String(y));
  }

  readonly points = input<readonly ValuePoint[]>([]);
  /** What the line shows, for screen readers and the empty state: the portfolio by default, or e.g. "AAPL price". */
  readonly subject = input('Portfolio value');
  readonly historyName = computed(() => (this.subject() === 'Portfolio value' ? 'your portfolio history' : `${this.subject()} history`));
  readonly emptyText = computed(() =>
    this.subject() === 'Portfolio value'
      ? 'Your portfolio history will appear here as prices are recorded.'
      : `${this.subject()} history will appear here as prices are recorded.`);
  readonly range = input<ChartRange | null>(null);
  readonly period = input<ChartPeriod>('1D');
  readonly loading = input(false);
  readonly error = input('');
  readonly notice = input('');
  /** Live prices have stopped arriving: the line ends at the last known value and says so. */
  readonly delayed = input(false);
  readonly balanceHidden = input(false);
  readonly accountKey = input('');
  readonly accessiblePoints = computed(() => this.loading() || this.error() ? [] : this.plotPoints());
  readonly description = computed(() => describeSeries(this.accessiblePoints(), {
    name: this.subject(), period: this.periodDescription(), currency: 'USD', hidden: this.balanceHidden(),
    empty: this.loading() ? 'History is loading.' : this.error() || 'No ' + this.subject().toLowerCase() + ' history is available for this period.',
  }) + (this.references().length ? ` The reference line marks the period starting value of ${this.references()[0].value}.` : '')
    + (this.delayed() ? ' Live prices are delayed; these are the last recorded values.' : '')
    + (this.coverage().status === 'partial' ? ' Only part of the requested period has recorded values.' : '') + ' ' + this.notice());
  readonly references = computed(() => !this.balanceHidden() && this.accessiblePoints().length
    ? [{ label: 'Period starting value reference', value: chartValue(startValue(this.history()), { currency: 'USD' }) }] : []);
  readonly dataTable = computed(() => ({ ...seriesTable(this.accessiblePoints(), { currency: 'USD', hidden: this.balanceHidden() }), references: this.references(),
    note: this.plotPoints().length < this.displayPoints().length ? 'The display retains recorded observations, including each interval’s high and low. Choose every observation for the full history.' : undefined }));
  /** Full-resolution observations remain available alongside the less dense display. */
  readonly rawPoints = computed(() => this.loading() || this.error() ? [] : this.displayPoints());
  readonly allData = computed(() => ({ ...seriesTable(this.rawPoints(), { currency: 'USD', hidden: this.balanceHidden() }, false), references: this.references() }));
  readonly periodChange = output<ChartPeriod>();
  /** The point under the cursor, or null when the cursor leaves the chart. */
  readonly scrub = output<ValuePoint | null>();
  /** Freeze both observations and coordinates while inspecting; incoming data stays buffered. */
  readonly #inspection = signal<readonly ValuePoint[] | null>(null);

  /** Ignore malformed observations before constructing a path; do not mutate input history. */
  readonly normalizedPoints = computed(() => chartPoints(this.#inspection() ?? this.points(), p => p.at, p => p.value));
  readonly history = computed(() => this.normalizedPoints().map(p => ({ at: p.time, value: p.value })));
  readonly coverage = computed(() => historyCoverage(this.range(), this.history()));
  readonly periodDescription = computed(() => this.focused() ? 'most recent hour'
    : this.coverage().status === 'partial' ? 'available recorded history'
    : this.range()?.fromOpening ? 'since first record' : PERIOD_WORDS[this.period()]);
  readonly chartSeries = computed<ChartSeries>(() => ({ id: this.accountKey() + ':' + this.subject(), label: this.subject(), unit: 'USD',
    points: this.loading() || this.error() ? [] : chartPoints(this.plotPoints(), p => p.at, p => p.value),
    coverage: this.loading() || this.error() ? historyCoverage(this.range(), []) : this.coverage(),
    status: this.loading() ? 'loading' : this.error() ? 'error' : this.plotPoints().length ? 'ready' : 'empty', note: this.error() || this.notice() }));
  readonly dayView = signal<'recent' | 'full'>('recent');
  readonly recentPoints = computed(() => {
    const points = this.history();
    const cutoff = (points.at(-1)?.at ?? 0) - RECENT_MS;
    return points.filter((p) => p.at >= cutoff);
  });
  readonly canFocus = computed(() => {
    const points = this.history(),
      recent = this.recentPoints();
    return recent.length >= 2 && recent.length < points.length;
  });
  readonly focused = computed(
    () => this.period() === '1D' && this.dayView() === 'recent' && this.canFocus(),
  );
  readonly displayPoints = computed(() => (this.focused() ? this.recentPoints() : this.history()));
  /** The plotted subset preserves actual values and extrema. Descriptions and inspection use
   * this same subset; the full-resolution table retains every observation. */
  readonly plotPoints = computed(() => plotSeries(this.displayPoints(), Math.ceil(WIDTH / 6)));
  /** Fit the observed span, including partial recent-hour history, without adding points. */
  readonly plotWindow = computed(() => ({ start: this.plotPoints()[0]?.at ?? 0, end: this.plotPoints().at(-1)?.at ?? 0 }));
  readonly viewBox = `${-INSET_X} ${-INSET_Y} ${WIDTH + 2 * INSET_X} ${HEIGHT + 2 * INSET_Y}`;
  setDayView(view: 'recent' | 'full'): void {
    this.endScrub();
    this.dayView.set(view);
  }

  readonly periods = CHART_PERIODS;
  /** Buttons disclose their actual rolling-day ranges, including to speech consumers. */
  readonly periodNames = PERIOD_NAMES;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  /** Index of the point under the cursor, or -1. */
  readonly #active = signal(-1);

  /** Up or down over the shown period: the colour of the line, the dot and the selected period. */
  readonly tone = computed(() => {
    const points = this.history();
    if (points.length < 2 || points.at(-1)!.value === startValue(points)) {
      return 'flat';
    }
    return points.at(-1)!.value < startValue(points) ? 'down' : 'up';
  });
  /** The value scale, fitted to the values shown, so each move up or down is visible. */
  readonly scale = computed(() => valueScale(this.plotPoints().map((p) => p.value)));
  /** Round-number gridlines inside the fitted scale; labels are withheld while balances are hidden. */
  readonly valueTicks = computed(() => {
    const { low, high } = this.scale();
    const step = niceStep((high - low) / 3);
    const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: step >= 1 ? 0 : 2, minimumFractionDigits: step >= 1 ? 0 : 2 });
    const ticks = [];
    for (let value = Math.ceil(low / step) * step; value <= high; value += step) {
      const y = ((high - value) / (high - low)) * HEIGHT;
      ticks.push({ value, top: ((y + INSET_Y) / (HEIGHT + 2 * INSET_Y)) * 100, label: this.balanceHidden() ? '' : format.format(value) });
    }
    return ticks;
  });
  /** Start, middle and end of the plotted span, in Central time. */
  readonly timeTicks = computed(() => {
    const { start, end } = this.plotWindow();
    const sameDay = centralDay(start) === centralDay(end);
    const options: Intl.DateTimeFormatOptions = sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : end - start <= 8 * 24 * 3600 * 1000 ? { weekday: 'short', hour: 'numeric' } : { month: 'short', day: 'numeric' };
    return [start, (start + end) / 2, end].map((at, i) => ({
      at,
      left: ((i / 2) * WIDTH + INSET_X) / (WIDTH + 2 * INSET_X) * 100,
      label: centralTime(at, options),
    }));
  });
  /** Every timeframe uses elapsed time, preserving nights, weekends and irregular sampling. */
  readonly placed = computed(() => {
    const points = this.plotPoints();
    const { low, high } = this.scale();
    const { start, end: latest } = this.plotWindow();
    const span = Math.max(latest - start, 1);
    return points.map((p) => ({
      ...p,
      x: (p.at - start) / span * WIDTH,
      y: ((high - p.value) / (high - low)) * HEIGHT,
    }));
  });
  /** Where the cursor's time label sits, kept far enough from the edges to stay readable. */
  readonly labelLeft = computed(() => {
    const point = this.active();
    return point ? Math.min(100, Math.max(0, (point.x / WIDTH) * 100)) : 0;
  });
  readonly path = computed(() => smoothPricePath(this.placed()));
  readonly areaPath = computed(() => {
    const points = this.placed();
    return points.length
      ? `${this.path()} L${points.at(-1)!.x},${HEIGHT} L${points[0].x},${HEIGHT} Z`
      : '';
  });
  /** The dotted line at the period's first recorded value, including a real zero balance. */
  readonly baselineY = computed(() => {
    const { low, high } = this.scale();
    return this.history().length
      ? ((high - startValue(this.history())) / (high - low)) * HEIGHT
      : HEIGHT / 2;
  });
  readonly end = computed(
    () => this.placed().at(-1) ?? { x: WIDTH, y: HEIGHT / 2, at: 0, value: 0 },
  );
  readonly active = computed(() => this.placed()[this.#active()] ?? null);
  /** The time under the cursor in Central time: to the second within two days, otherwise with the date's year. */
  readonly cursorTime = computed(() => {
    const point = this.active();
    const points = this.history();
    if (!point || !points.length) {
      return '';
    }
    const short = points.at(-1)!.at - points[0].at <= 2 * 24 * 3600 * 1000;
    const options: Intl.DateTimeFormatOptions = short
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }
      : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
    return `${centralTime(point.at, options)} CT`;
  });
  /** When the account opened, in Central time. */
  readonly openedText = computed(() => {
    const start = this.range()?.start;
    return start === undefined
      ? ''
      : `${centralTime(start, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`;
  });
  /** What a screen reader hears instead of the drawing. */
  readonly summary = computed(() => {
    const points = this.history();
    if (points.length < 2) {
      return `${this.subject()} chart`;
    }
    const first = startValue(points);
    const last = points.at(-1)!.value;
    const percent = first > 0 ? Math.abs(((last - first) / first) * 100) : null;
    let word: string;
    if (last > first) {
      word = 'up';
    } else if (last < first) {
      word = 'down';
    } else {
      word = 'unchanged';
    }
    return `${this.subject()} ${this.periodDescription()}: from $${first.toFixed(2)} to $${last.toFixed(2)}, ${percent === null ? 'percentage change unavailable' : word + ' ' + percent.toFixed(2) + '%'}. Use the left and right arrow keys to move along the line.${this.focused() ? ' Showing the most recent hour.' : ''}`;
  });

  /** Moves the cursor to the point nearest the pointer: mouse, pen, or a finger dragged across. */
  scrubAt(event: { currentTarget: EventTarget | null; clientX: number }): void {
    this.#animation?.finish();
    const target = event.currentTarget as Element | null;
    const box = target?.getBoundingClientRect();
    if (!box?.width) {
      return;
    }
    const x = ((event.clientX - box.left) / box.width) * (WIDTH + 2 * INSET_X) - INSET_X;
    this.#select(nearest(this.placed(), x));
  }

  /** Left and right arrows step along the line; Home and End jump to its ends. */
  scrubKey(event: KeyboardEvent): void {
    this.#animation?.finish();
    const last = this.placed().length - 1;
    const current = this.#active() < 0 ? last : this.#active();
    const moves: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      this.#select(Math.max(0, Math.min(last, moves[event.key])));
      return;
    }
    if (event.key === 'Escape') {
      this.endScrub();
    }
  }

  endScrub(): void {
    if (this.#active() !== -1) {
      this.#active.set(-1);
      this.#inspection.set(null);
      this.scrub.emit(null);
    }
  }

  #select(index: number): void {
    if (index < 0 || index >= this.placed().length) {
      return;
    }
    if (this.#inspection() === null) {
      this.#inspection.set(this.history());
    }
    if (index !== this.#active()) {
      this.#active.set(index);
      const point = this.placed()[index];
      this.scrub.emit(point ? { at: point.at, value: point.value } : null);
    }
  }
}

/** The 1, 2 or 5 × 10ⁿ step nearest above a raw step, so gridlines land on round values. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
}

/** Index of the point whose x is closest. */
function nearest(points: readonly { x: number }[], x: number): number {
  let best = 0;
  points.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) {
      best = i;
    }
  });
  return best;
}

export const PERIOD_WORDS: Record<ChartPeriod, string> = {
  '1D': 'today',
  '1W': 'past 7 days',
  '1M': 'past 30 days',
  '3M': 'past 90 days',
  '1Y': 'past 365 days',
  ALL: 'available recorded history',
};
