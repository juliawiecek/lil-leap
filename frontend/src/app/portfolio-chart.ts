import { Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { CHART_PERIODS, ChartPeriod, ChartRange, ValuePoint } from './portfolio-history';

const WIDTH = 800;
const HEIGHT = 200;
/**
 * Headroom above and below the line when the scale is built: a quarter of the line's own range,
 * and at least a hundredth of a percent of its value, so ordinary live ticks fit inside it and
 * only a real move outside it rescales the chart.
 */
const MARGIN = 0.25;
const MIN_MARGIN = 0.0001;

/**
 * The novice overview's portfolio line, drawn the way retail brokerage apps do: one crisp line,
 * green when the period is up and red when it is down, a dotted baseline at the period's
 * starting value, and no axis numbers. Hovering (or arrow keys) scrubs along the line and
 * reports the point under the cursor, so the value above the chart can follow it.
 *
 * The vertical scale only changes when a value leaves it or the period changes, so live
 * updates move the end of the line without the whole chart jumping. Points are spaced evenly in
 * time order, so hours when the market is closed take up no room.
 */
@Component({
  selector: 'app-portfolio-chart',
  imports: [CurrencyPipe, DatePipe],
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
          <path class="line" [attr.d]="path()" />
          @if (active(); as point) {
            <line class="cursor" [attr.x1]="point.x" [attr.x2]="point.x" y1="0" [attr.y2]="height" />
            <circle class="dot" [attr.cx]="point.x" [attr.cy]="point.y" r="5" />
          } @else {
            <circle class="dot" [class.live]="!delayed()" [attr.cx]="end().x" [attr.cy]="end().y" r="4" />
          }
        </svg>
        @if (active(); as point) {
          <span class="cursor-time" [style.left.%]="labelLeft()">{{ point.at | date: timeFormat() }} · {{ point.value | currency }}</span>
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
      <p class="chart-note">Your account opened {{ range()!.start | date: 'MMM d, HH:mm' }}, so this shows everything since then.</p>
    }
  `,
  styles: [`
    :host { display: block; margin-top: 14px; --up: #7ede8b; --down: #f45159; }
    .chart { position: relative; --tone: var(--up); }
    .chart.down { --tone: var(--down); }
    svg { display: block; width: 100%; height: 200px; overflow: visible; cursor: crosshair; outline: none; touch-action: pan-y; }
    @media (max-width: 600px) { svg, .chart-empty { height: 150px; } }
    svg:focus-visible { outline: 2px solid var(--tone); outline-offset: 6px; border-radius: 4px; }
    .line { fill: none; stroke: var(--tone); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; shape-rendering: geometricPrecision; transition: stroke .2s, d .4s ease-out; }
    .dot { transition: cy .4s ease-out; }
    .baseline { stroke: #5b6563; stroke-width: 1; stroke-dasharray: 1 5; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .cursor { stroke: #9aa5a2; stroke-width: 1; vector-effect: non-scaling-stroke; }
    .dot { fill: var(--tone); stroke: #0f1415; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .dot.live { animation: pulse 2s ease-out infinite; }
    @keyframes pulse { 0% { opacity: 1; } 70% { opacity: .35; } 100% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .dot.live { animation: none; } .line, .dot { transition: none; } }
    .chart-note.delayed { color: #d9a400; }
    .cursor-time { position: absolute; top: -20px; transform: translateX(-50%); color: #9aa5a2; font-size: 11px; white-space: nowrap; pointer-events: none; }
    .chart-empty { display: grid; place-items: center; height: 200px; color: #87918f; font-size: 13px; }
    .periods { display: flex; gap: 6px; margin-top: 14px; padding-bottom: 10px; border-bottom: 1px solid #283035; --tone: var(--up); }
    .periods.down { --tone: var(--down); }
    .periods button { min-width: 42px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: #d7dedc; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .periods button:hover { color: var(--tone); }
    .periods button.selected { color: var(--tone); box-shadow: inset 0 -2px 0 var(--tone); border-radius: 0; }
    .periods button:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
    .chart-note { margin: 8px 0 0; color: #87918f; font-size: 12px; }
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
  #domain: { low: number; high: number; period: ChartPeriod; start: number } | null = null;

  /** Up or down over the shown period: the colour of the line, the dot and the selected period. */
  readonly tone = computed(() => {
    const points = this.points();
    return points.length >= 2 && points.at(-1)!.value < points[0].value ? 'down' : 'up';
  });
  /**
   * The vertical scale. It is kept while every value fits inside it, so a new live value moves
   * the line's end rather than the whole chart, and is rebuilt when a value leaves it, when the
   * period changes, or when the period is reloaded from a different start.
   */
  readonly domain = computed(() => {
    const points = this.points();
    const period = this.period();
    const start = this.range()?.start ?? 0;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const kept = this.#domain;
    const samePeriod = kept?.period === period && kept.start === start;
    if (kept && samePeriod && min >= kept.low && max <= kept.high) {
      return kept;
    }
    const pad = Math.max((max - min) * MARGIN, Math.max(Math.abs(max), 1) * MIN_MARGIN);
    this.#domain = { low: min - pad, high: max + pad, period, start };
    return this.#domain;
  });
  /**
   * Each point placed on the chart. Points are spaced evenly in order, as brokerage charts do, so
   * nights and weekends with no trading collapse instead of stretching into long flat stretches.
   */
  readonly placed = computed(() => {
    const { low, high } = this.domain();
    const spread = high - low || 1;
    const last = Math.max(this.points().length - 1, 1);
    return this.points().map((p, i) => ({
      ...p,
      x: (i / last) * WIDTH,
      y: ((high - p.value) / spread) * HEIGHT,
    }));
  });
  /** Where the cursor's time label sits, kept far enough from the edges to stay readable. */
  readonly labelLeft = computed(() => {
    const point = this.active();
    return point ? Math.min(92, Math.max(8, (point.x / WIDTH) * 100)) : 0;
  });
  readonly path = computed(() => this.placed().map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  readonly baselineY = computed(() => this.placed()[0]?.y ?? HEIGHT / 2);
  readonly end = computed(() => this.placed().at(-1) ?? { x: WIDTH, y: HEIGHT / 2, at: 0, value: 0 });
  readonly active = computed(() => this.placed()[this.#active()] ?? null);
  /** Times within two days, otherwise dates. */
  readonly timeFormat = computed(() => {
    const range = this.range();
    return range && range.end - range.start <= 2 * 24 * 3600 * 1000 ? 'MMM d, HH:mm' : 'MMM d, y';
  });
  /** What a screen reader hears instead of the drawing. */
  readonly summary = computed(() => {
    const points = this.points();
    if (points.length < 2) {
      return 'Portfolio value chart';
    }
    const first = points[0].value;
    const last = points.at(-1)!.value;
    const percent = first > 0 ? Math.abs(((last - first) / first) * 100) : 0;
    let word = 'unchanged';
    if (last > first) {
      word = 'up';
    } else if (last < first) {
      word = 'down';
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
    } else if (event.key === 'Escape') {
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

export const PERIOD_WORDS: Record<ChartPeriod, string> = {
  '1D': 'past day', '1W': 'past week', '1M': 'past month', '3M': 'past 3 months', '1Y': 'past year', ALL: 'since opening',
};
