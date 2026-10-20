import { Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CHART_PERIODS, ChartPeriod, ChartRange, ValuePoint, startValue, valueScale } from './portfolio-history';
import { centralTime } from './app-time';

const WIDTH = 800;
const HEIGHT = 200;

/**
 * The novice overview's portfolio-value line: green when the period is up and red when it is
 * down, with a dotted baseline at the period's starting value and no axes. Every recorded value
 * is its own point, so each rise and dip stays in the line as new values arrive; the scale refits
 * to the values shown. 1D is today's trading session up to now.
 * Hovering (or arrow keys) scrubs along the line and reports the point under the cursor, so the
 * value above the chart can follow it; the time under the cursor is shown in Central time.
 */
@Component({
  selector: 'app-portfolio-chart',
  imports: [CurrencyPipe],
  template: `
    @if (error()) {
      <p class="chart-note" role="alert">{{ error() }}</p>
    } @else if (points().length < 2) {
      <div class="chart-empty" aria-live="polite">{{ loading() ? 'Loading your portfolio history…' : 'Your portfolio history will appear here as prices are recorded.' }}</div>
    } @else {
      <div class="chart" [class.down]="tone() === 'down'">
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          role="img"
          tabindex="0"
          [attr.aria-label]="summary()"
          (pointermove)="scrubAt($event)"
          (pointerdown)="scrubAt($event)"
          (pointerleave)="endScrub()"
          (pointercancel)="endScrub()"
          (blur)="endScrub()"
          (keydown)="scrubKey($event)"
        >
          <line class="baseline" x1="0" [attr.x2]="width" [attr.y1]="baselineY()" [attr.y2]="baselineY()" />
          <path class="line" pathLength="1" [attr.d]="path()" />
          @if (active(); as point) {
            <line class="cursor" [attr.x1]="point.x" [attr.x2]="point.x" y1="0" [attr.y2]="height" />
          }
        </svg>
        <!-- The dots sit over the drawing, placed by the share of its width and height. -->
        @if (active(); as point) {
          <i class="dot" [style.left.%]="(point.x / width) * 100" [style.top.%]="(point.y / height) * 100"></i>
          <span class="cursor-time" [style.left.%]="labelLeft()">{{ cursorTime() }} · {{ point.value | currency }}</span>
        } @else {
          <i class="dot" [class.live]="!delayed()" [style.left.%]="(end().x / width) * 100" [style.top.%]="(end().y / height) * 100"></i>
        }
      </div>
    }
    <div class="periods" role="group" aria-label="Chart time range" [class.down]="tone() === 'down'">
      @for (item of periods; track item) {
        <button type="button" [class.selected]="period() === item" [attr.aria-pressed]="period() === item" (click)="periodChange.emit(item)">
          {{ item }}
        </button>
      }
    </div>
    @if (delayed() && points().length >= 2) {
      <p class="chart-note delayed" role="status">Live prices are delayed, so the line ends at the last known value.</p>
    }
    @if (range()?.fromOpening && points().length >= 2) {
      <p class="chart-note">Your account opened {{ openedText() }}, so this shows everything since then.</p>
    }
  `,
  styles: [`
    :host { display: block; margin-top: 14px; --up: #94c973; --down: #ff7a6e; }
    .chart { position: relative; --tone: var(--up); }
    .chart.down { --tone: var(--down); }
    svg { display: block; width: 100%; height: 260px; overflow: visible; cursor: crosshair; outline: none; touch-action: pan-y; }
    @media (max-width: 600px) { svg, .chart-empty { height: 150px; } }
    svg:focus-visible { outline: 2px solid var(--tone); outline-offset: 6px; border-radius: 4px; }
    .line { fill: none; stroke: var(--tone); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; shape-rendering: geometricPrecision; transition: stroke .2s;
      filter: drop-shadow(0 0 6px color-mix(in srgb, var(--tone) 40%, transparent)); stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.6s cubic-bezier(.3, .7, .2, 1) .2s forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    .baseline { stroke: #3a4038; stroke-width: 1; stroke-dasharray: 1 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .cursor { stroke: #a4a79e; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .dot { position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border: 2px solid #0c0c0c; border-radius: 50%; background: var(--tone); box-sizing: border-box; pointer-events: none; }
    .dot.live { animation: pulse 2s ease-out infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 var(--tone); } 70% { box-shadow: 0 0 0 8px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
    @media (prefers-reduced-motion: reduce) { .dot.live { animation: none; } .line { transition: none; animation: none; stroke-dasharray: none; } }
    .chart-note.delayed { color: #e2b65a; }
    .cursor-time { position: absolute; top: -26px; transform: translateX(-50%); padding: 4px 10px; border: 1px solid #2c312b; border-radius: 8px; background: rgba(20, 23, 20, .95); color: #f2f0e9; font-size: 12px; font-weight: 600; white-space: nowrap; pointer-events: none; }
    .chart-empty { display: grid; place-items: center; height: 260px; color: #7e8279; font-size: 13px; }
    .periods { display: flex; width: max-content; max-width: 100%; gap: 2px; margin-top: 16px; padding: 4px; border: 1px solid #1f231f; border-radius: 12px; background: rgba(7, 7, 7, .6); --tone: var(--up); }
    .periods.down { --tone: var(--down); }
    .periods button { min-width: 44px; min-height: 34px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; color: #7e8279; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: background-color .15s, color .15s; }
    .periods button:hover { color: #f2f0e9; }
    .periods button.selected { background: #f2efe6; color: #0b0c0b; }
    .periods button:focus-visible { outline: 2px solid #f2efe6; outline-offset: 2px; }
    .chart-note { margin: 8px 0 0; color: #7e8279; font-size: 12px; }
  `],
})
export class PortfolioChart {
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

  readonly periods = CHART_PERIODS;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  /** Index of the point under the cursor, or -1. */
  readonly #active = signal(-1);

  /** Up or down over the shown period: the colour of the line, the dot and the selected period. */
  readonly tone = computed(() => {
    const points = this.points();
    return points.length >= 2 && points.at(-1)!.value < startValue(points) ? 'down' : 'up';
  });
  /** The value scale, fitted to the values shown, so each move up or down is visible. */
  readonly scale = computed(() => valueScale(this.points().map((p) => p.value)));
  /**
   * Whether points sit at their times. 1D, 1M, 3M and 1Y do: the line fills the chart from the
   * period's start to the newest value, and time before the account existed shows at $0. 1W and
   * ALL space points evenly in order, as brokerage apps do, so nights and weekends take no room.
   */
  readonly timed = computed(() => TIMED_PERIODS.has(this.period()));
  /** Each point placed on the chart. */
  readonly placed = computed(() => {
    const points = this.points();
    const { low, high } = this.scale();
    const start = points[0]?.at ?? 0;
    const span = Math.max((points.at(-1)?.at ?? 0) - start, 1);
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
    return point ? Math.min(92, Math.max(8, (point.x / WIDTH) * 100)) : 0;
  });
  readonly path = computed(() => this.placed().map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  /** The dotted line at the period's starting value (once the account held money). */
  readonly baselineY = computed(() => {
    const { low, high } = this.scale();
    return this.points().length ? ((high - startValue(this.points())) / (high - low)) * HEIGHT : HEIGHT / 2;
  });
  readonly end = computed(() => this.placed().at(-1) ?? { x: WIDTH, y: HEIGHT / 2, at: 0, value: 0 });
  readonly active = computed(() => this.placed()[this.#active()] ?? null);
  /** The time under the cursor in Central time: to the second within two days, otherwise with the date's year. */
  readonly cursorTime = computed(() => {
    const point = this.active();
    const points = this.points();
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
    return start === undefined ? '' : `${centralTime(start, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT`;
  });
  /** What a screen reader hears instead of the drawing. */
  readonly summary = computed(() => {
    const points = this.points();
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
    return `Portfolio value ${PERIOD_WORDS[this.period()]}: from $${first.toFixed(2)} to $${last.toFixed(2)}, ${word} ${percent.toFixed(2)}%. Use the left and right arrow keys to move along the line.`;
  });

  /** Moves the cursor to the point nearest the pointer: mouse, pen, or a finger dragged across. */
  scrubAt(event: { currentTarget: EventTarget | null; clientX: number }): void {
    const target = event.currentTarget as Element | null;
    const box = target?.getBoundingClientRect();
    if (!box?.width) {
      return;
    }
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    this.#select(nearest(this.placed(), x));
  }

  /** Left and right arrows step along the line; Home and End jump to its ends. */
  scrubKey(event: KeyboardEvent): void {
    const last = this.placed().length - 1;
    const current = this.#active() < 0 ? last : this.#active();
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last };
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
      this.scrub.emit(null);
    }
  }

  #select(index: number): void {
    if (index !== this.#active()) {
      this.#active.set(index);
      const point = this.points()[index];
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
  '1D': 'today', '1W': 'past week', '1M': 'past month', '3M': 'past 3 months', '1Y': 'past year', ALL: 'since opening',
};
