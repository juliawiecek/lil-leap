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
  startValue,
  valueScale,
} from './portfolio-history';
import { centralTime } from './app-time';
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
 * The novice overview's custom emerald area chart, with a dotted baseline at the period's starting value and no axes. Every recorded value
 * is its own point, so each rise and dip stays in the line as new values arrive; the scale refits
 * to the values shown. Dense 1D data opens on the recent hour, with the full day one tap away.
 * Hovering (or arrow keys) scrubs along the line and reports the point under the cursor, so the
 * value above the chart can follow it; the time under the cursor is shown in Central time.
 */
@Component({
  selector: 'app-portfolio-chart',
  imports: [CurrencyPipe],
  template: `
    @if (error()) {
      <p class="chart-note" role="alert">{{ error() }}</p>
    } @else if (history().length < 2) {
      <div class="chart-empty" aria-live="polite">
        {{
          loading()
            ? 'Loading your portfolio history…'
            : 'Your portfolio history will appear here as prices are recorded.'
        }}
      </div>
    } @else {
      @if (period() === '1D' && canFocus()) {
        <div class="day-window" role="group" aria-label="Day chart detail">
          <span>Day view</span>
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
            (click)="setDayView('full')"
          >
            Full day
          </button>
        </div>
      }
      <div class="chart" [class.down]="tone() === 'down'">
        <svg
          #svg
          [attr.viewBox]="viewBox"
          preserveAspectRatio="none"
          role="img"
          [attr.data-performance]="tone() === 'flat' ? 'neutral' : tone() === 'down' ? 'loss' : 'gain'"
          tabindex="0"
          [attr.aria-label]="summary()"
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
    }
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
          (click)="periodChange.emit(item)"
        >
          {{ item }}
        </button>
      }
    </div>
    @if (delayed() && history().length >= 2) {
      <p class="chart-note delayed" role="status">
        Live prices are delayed, so the line ends at the last known value.
      </p>
    }
    @if (range()?.fromOpening && history().length >= 2 && !focused()) {
      <p class="chart-note">
        Your account opened {{ openedText() }}, so this shows everything since then.
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
        position: relative;
        --tone: var(--up);
      }
      .chart.down {
        --tone: var(--down);
      }
      svg {
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
      /* A round, non-scaling stroke keeps the dot circular in the responsive SVG. */
      .dot {
        fill: none;
        stroke: var(--area-line);
        stroke-width: 7;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .day-window {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin: 0 0 14px;
        color: var(--text-subtle);
        font-size: 11px;
      }
      .day-window span {
        margin-right: auto;
      }
      .day-window button {
        padding: 5px 9px;
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
      /* Inside the plot, so it never covers the value and buttons above. It is shifted left by as much
         of its own width as the cursor is across the chart: left-aligned at the start, centred in the
         middle, right-aligned at the end, so it never runs off either side. */
      .cursor-time {
        position: absolute;
        top: 6px;
        z-index: 1;
        padding: 4px 10px;
        border: 1px solid var(--surface-tone-10);
        border-radius: 8px;
        background: var(--surface-wash-100);
        color: var(--text);
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
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
        display: flex;
        width: max-content;
        max-width: 100%;
        gap: 2px;
        margin-top: 16px;
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
          displayed = this.displayPoints(),
          history = this.history();
        const scale = this.scale(),
          timed = this.timed();
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
        const points = history.map((point, index) => ({
          time: timed ? point.at : index,
          price: point.value,
        }));
        const to = timed ? displayed.at(-1)!.at : history.length - 1;
        const from = timed ? (this.focused() ? to - RECENT_MS : displayed[0].at) : 0;
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
  readonly range = input<ChartRange | null>(null);
  readonly period = input<ChartPeriod>('1D');
  readonly loading = input(false);
  readonly error = input('');
  /** Live prices have stopped arriving: the line ends at the last known value and says so. */
  readonly delayed = input(false);
  readonly periodChange = output<ChartPeriod>();
  /** The point under the cursor, or null when the cursor leaves the chart. */
  readonly scrub = output<ValuePoint | null>();
  /** Freeze both observations and coordinates while inspecting; incoming data stays buffered. */
  readonly #inspection = signal<readonly ValuePoint[] | null>(null);

  /** Ignore malformed observations before constructing a path; do not mutate input history. */
  readonly history = computed(() =>
    [
      ...new Map(
        (this.#inspection() ?? this.points())
          .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.value))
          .map((p) => [p.at, p]),
      ).values(),
    ].sort((a, b) => a.at - b.at),
  );
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
  readonly viewBox = `${-INSET_X} ${-INSET_Y} ${WIDTH + 2 * INSET_X} ${HEIGHT + 2 * INSET_Y}`;
  setDayView(view: 'recent' | 'full'): void {
    this.endScrub();
    this.dayView.set(view);
  }

  readonly periods = CHART_PERIODS;
  /** Spoken names for the period buttons ("1 month", not "1M"). */
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
  readonly scale = computed(() => valueScale(this.displayPoints().map((p) => p.value)));
  /**
   * Whether points sit at their times. 1D, 1M, 3M and 1Y do: the line fills the chart from the
   * period's start to the newest value, and time before the account existed shows at $0. 1W and
   * ALL space points evenly in order, as brokerage apps do, so nights and weekends take no room.
   */
  readonly timed = computed(() => TIMED_PERIODS.has(this.period()));
  /** Each point placed on the chart. */
  readonly placed = computed(() => {
    const points = this.displayPoints();
    const { low, high } = this.scale();
    const latest = points.at(-1)?.at ?? 0;
    const start = this.focused() ? latest - RECENT_MS : (points[0]?.at ?? 0);
    const span = Math.max(latest - start, 1);
    const timed = this.timed();
    const last = Math.max(points.length - 1, 1);
    return points.map((p, i) => ({
      ...p,
      x: (timed ? (p.at - start) / span : i / last) * WIDTH,
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
  /** The dotted line at the period's starting value (once the account held money). */
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
      return 'Portfolio value chart';
    }
    const first = startValue(points);
    const last = points.at(-1)!.value;
    const percent = first > 0 ? Math.abs(((last - first) / first) * 100) : 0;
    let word: string;
    if (last > first) {
      word = 'up';
    } else if (last < first) {
      word = 'down';
    } else {
      word = 'unchanged';
    }
    return `Portfolio value ${PERIOD_WORDS[this.period()]}: from $${first.toFixed(2)} to $${last.toFixed(2)}, ${word} ${percent.toFixed(2)}%. Use the left and right arrow keys to move along the line.${this.focused() ? ' Showing the most recent hour.' : ''}`;
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

/** Periods whose points sit at their times; the rest are spaced evenly. */
const TIMED_PERIODS = new Set<ChartPeriod>(['1D', '1M', '3M', '1Y']);

export const PERIOD_WORDS: Record<ChartPeriod, string> = {
  '1D': 'today',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '1Y': 'past year',
  ALL: 'since opening',
};
