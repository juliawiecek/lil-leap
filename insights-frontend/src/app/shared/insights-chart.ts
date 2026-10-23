import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** Room around the line so the end dot and its ring are never clipped. */
const PAD = 10;
/** How long the line takes to glide to new values, like the trading app's charts. */
const GLIDE_MS = 240;
let nextChartId = 0;

type Spot = { x: number; y: number };

/**
 * A line chart drawn like the trading app's novice portfolio chart: a smooth line over a soft green fill, no axes,
 * a dotted line at the starting value and a dot on the latest point; green while the series is level or rising,
 * red when it falls. Pointing anywhere on the chart (or the arrow keys once it has focus) follows the line and shows
 * the point under the cursor; new values glide into place instead of jumping.
 */
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe],
  template: ` @if (points().length) {
      <div class="plot">
        <svg
          [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
          [style.height.px]="height()"
          [class.down]="falling()"
          role="img"
          tabindex="0"
          [attr.aria-label]="label()"
          (pointermove)="scrubAt($event)"
          (pointerdown)="scrubAt($event)"
          (pointerleave)="active.set(null)"
          (blur)="active.set(null)"
          (keydown)="scrubKey($event)"
        >
          <defs>
            <linearGradient [attr.id]="fillId" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" [attr.y2]="height()">
              <stop class="fill-top" offset="0%" />
              <stop class="fill-bottom" offset="100%" />
            </linearGradient>
          </defs>
          <path class="area" [attr.d]="areaPath()" [attr.fill]="'url(#' + fillId + ')'" />
          <line class="start" [attr.x1]="PAD" [attr.x2]="width() - PAD" [attr.y1]="startY()" [attr.y2]="startY()" />
          <path class="line" [attr.d]="path()" />
          @if (activeSpot(); as spot) {
            <line class="cursor" [attr.x1]="spot.x" [attr.x2]="spot.x" y1="0" [attr.y2]="height()" />
            <circle class="end-dot" [attr.cx]="spot.x" [attr.cy]="spot.y" r="4" />
          } @else if (shown().at(-1); as end) {
            <circle class="end-ring" [attr.cx]="end.x" [attr.cy]="end.y" r="8" />
            <circle class="end-dot" [attr.cx]="end.x" [attr.cy]="end.y" r="4" />
          }
        </svg>
        <div class="cursor-layer" aria-live="polite">
          @if (active() !== null && points()[active()!]; as p) {
            <span class="cursor-label" [style.left.%]="labelLeft()" [style.transform]="'translateX(-' + labelLeft() + '%)'"
              >{{ p.label }} · <strong>{{ prefix() }}{{ p.value | number: '1.0-2' }}</strong></span
            >
          }
        </div>
      </div>
      @if (hint()) {
        <div class="chart-readout">{{ hint() }}</div>
      }
    } @else {
      <div class="empty">No observations in this period.</div>
    }`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .plot {
        position: relative;
      }
      svg {
        --chart-line: var(--nt-green, #94c973);
        --chart-fill-top: rgba(148, 201, 115, 0.22);
        width: 100%;
        display: block;
        overflow: visible;
        cursor: crosshair;
        outline: none;
        touch-action: pan-y;
      }
      svg.down {
        --chart-line: #ff7a6e;
        --chart-fill-top: rgba(255, 122, 110, 0.18);
      }
      svg:focus-visible {
        outline: 2px solid var(--chart-line);
        outline-offset: 6px;
        border-radius: 4px;
      }
      .fill-top {
        stop-color: var(--chart-fill-top);
      }
      .fill-bottom {
        stop-color: var(--chart-fill-top);
        stop-opacity: 0;
      }
      .start {
        stroke: var(--nv-border-hover, #3a4038);
        stroke-width: 1;
        stroke-dasharray: 1 5;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      .line {
        fill: none;
        stroke: var(--chart-line);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
      }
      .end-dot {
        fill: var(--chart-line);
        pointer-events: none;
      }
      .end-ring {
        fill: var(--chart-line);
        opacity: 0.25;
        pointer-events: none;
      }
      .cursor {
        stroke: var(--nt-muted, #a4a79e);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      .cursor-label {
        position: absolute;
        top: 6px;
        z-index: 1;
        padding: 4px 10px;
        border: 1px solid var(--nv-border-strong, #2c312b);
        border-radius: 8px;
        background: rgba(12, 12, 12, 0.92);
        color: var(--muted);
        font: 600 12px var(--font-ui);
        white-space: nowrap;
        pointer-events: none;
      }
      .cursor-label strong {
        color: var(--text);
        font-variant-numeric: tabular-nums;
      }
      .chart-readout {
        min-height: 28px;
        display: flex;
        align-items: center;
        color: var(--muted);
        font: 12px var(--font-ui);
      }
      .empty {
        padding: 70px 20px;
        text-align: center;
        color: var(--muted);
      }
    `,
  ],
})
export class InsightsChart {
  protected readonly PAD = PAD;
  /** Unique per chart so two charts on one page never share a fill. */
  protected readonly fillId = `insights-chart-fill-${nextChartId++}`;
  /** Index of the point under the cursor or keyboard, or null. */
  readonly active = signal<number | null>(null);
  /** Drawing width in pixels, kept equal to the element's width so lines are never stretched. */
  readonly width = signal(640);
  /** Drawing height in pixels. */
  readonly height = input(220);
  readonly points = input<{ label: string; value: number }[]>([]);
  readonly label = input('Trading volume over time');
  /** Text under the chart; empty for none. */
  readonly hint = input('Point at the line, or use the arrow keys, to explore values');
  readonly prefix = input('$');
  /** The points mid-glide, or null when the line is drawn at its real values. */
  private readonly frame = signal<Spot[] | null>(null);
  private glideRequest: number | undefined;

  constructor() {
    const host = inject(ElementRef<HTMLElement>, { optional: true });
    const destroyRef = inject(DestroyRef);
    if (!host) {
      return;
    }
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(([entry]) => {
        const measured = Math.round(entry.contentRect.width);
        if (measured > 120) {
          this.width.set(measured);
        }
      });
      observer.observe(host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
    // New values glide in; a resize alone redraws at once.
    let previous = this.points();
    let drawn: Spot[] = [];
    effect(() => {
      const points = this.points();
      const target = this.placed();
      if (points !== previous) {
        untracked(() => this.glide(this.frame() ?? drawn, target));
      }
      previous = points;
      drawn = target;
    });
    destroyRef.onDestroy(() => this.stopGlide());
  }

  /** The latest value. */
  readonly last = computed(() => this.points().at(-1)?.value ?? 0);
  /** True when the series ends below where it started, which draws it in red. */
  readonly falling = computed(() => this.last() < (this.points()[0]?.value ?? 0));
  /** Lowest and highest values shown; zero stays in view so a running total starts on the floor. */
  readonly range = computed(() => {
    const values = this.points().map((p) => p.value);
    const low = Math.min(0, ...values);
    const high = Math.max(...values, low + 1);
    return { low, high: high + (high - low) * 0.08 };
  });
  /** Where each point belongs in the drawing. */
  readonly placed = computed(() => this.points().map((p, i) => ({ x: this.x(i), y: this.y(p.value) })));
  /** Where each point is drawn right now: its real place, except during a glide. */
  readonly shown = computed(() => this.frame() ?? this.placed());
  /** Height of the dotted line: the first value, like the trading app's opening-value line. */
  readonly startY = computed(() => this.shown()[0]?.y ?? this.y(0));
  /** A smooth line through every point that never overshoots it. */
  readonly path = computed(() => smoothPath(this.shown()));
  /** The line closed down to the bottom edge, for the soft fill underneath. */
  readonly areaPath = computed(() => {
    const spots = this.shown();
    return spots.length > 1 ? `${this.path()} L${round(spots.at(-1)!.x)},${this.height()} L${round(spots[0].x)},${this.height()} Z` : '';
  });
  readonly activeSpot = computed(() => {
    const index = this.active();
    return index === null ? null : (this.placed()[index] ?? null);
  });
  /** Keeps the hover label over its point without running off either edge. */
  readonly labelLeft = computed(() => {
    const spot = this.activeSpot();
    return spot ? Math.min(100, Math.max(0, (spot.x / this.width()) * 100)) : 0;
  });

  x(i: number): number {
    return PAD + (i / Math.max(1, this.points().length - 1)) * (this.width() - 2 * PAD);
  }
  y(v: number): number {
    const { low, high } = this.range();
    return this.height() - PAD - ((v - low) / (high - low)) * (this.height() - 2 * PAD);
  }

  /** Selects the point nearest the pointer. */
  scrubAt(event: { currentTarget: EventTarget | null; clientX: number }): void {
    const box = (event.currentTarget as Element | null)?.getBoundingClientRect();
    const count = this.points().length;
    if (!box?.width || !count) {
      return;
    }
    this.finishGlide();
    const x = ((event.clientX - box.left) / box.width) * this.width();
    const index = Math.round(((x - PAD) / (this.width() - 2 * PAD)) * (count - 1));
    this.active.set(Math.max(0, Math.min(count - 1, index)));
  }

  /** Left and right arrows step along the line; Home and End jump to its ends; Escape lets go. */
  scrubKey(event: KeyboardEvent): void {
    const last = this.points().length - 1;
    const current = this.active() ?? last;
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last };
    if (event.key in moves) {
      event.preventDefault();
      this.finishGlide();
      this.active.set(Math.max(0, Math.min(last, moves[event.key])));
    } else if (event.key === 'Escape') {
      this.active.set(null);
    }
  }

  /** Moves the drawn line from where it is now to the new values; added points grow out of the old last point. */
  private glide(from: Spot[], target: Spot[]): void {
    const animate =
      typeof requestAnimationFrame === 'function' &&
      !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.stopGlide();
    if (!animate || !from.length || !target.length) {
      this.frame.set(null);
      return;
    }
    const start = target.map((_, i) => from[Math.min(i, from.length - 1)]);
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / GLIDE_MS);
      const ease = t * t * (3 - 2 * t);
      if (t >= 1) {
        this.frame.set(null);
        this.glideRequest = undefined;
        return;
      }
      this.frame.set(target.map((spot, i) => ({ x: start[i].x + (spot.x - start[i].x) * ease, y: start[i].y + (spot.y - start[i].y) * ease })));
      this.glideRequest = requestAnimationFrame(step);
    };
    this.frame.set(start);
    this.glideRequest = requestAnimationFrame(step);
  }
  private finishGlide(): void {
    this.stopGlide();
    this.frame.set(null);
  }
  private stopGlide(): void {
    if (this.glideRequest !== undefined) {
      cancelAnimationFrame(this.glideRequest);
      this.glideRequest = undefined;
    }
  }
}

/** Monotone cubic curve through every point (the trading app's smoothing): it bends smoothly but never above a peak or below a dip. */
export function smoothPath(spots: readonly Spot[]): string {
  if (!spots.length) {
    return '';
  }
  const slopes = spots.slice(1).map((spot, i) => (spot.y - spots[i].y) / (spot.x - spots[i].x));
  const tangent = (i: number): number => {
    if (i === 0) {
      return slopes[0] ?? 0;
    }
    if (i === spots.length - 1) {
      return slopes[i - 1];
    }
    const a = slopes[i - 1];
    const b = slopes[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  let path = `M${round(spots[0].x)},${round(spots[0].y)}`;
  for (let i = 1; i < spots.length; i++) {
    const a = spots[i - 1];
    const b = spots[i];
    const dx = (b.x - a.x) / 3;
    if (dx <= 0) {
      path += ` L${round(b.x)},${round(b.y)}`;
      continue;
    }
    const clamp = (y: number) => Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), y));
    path +=
      ` C${round(a.x + dx)},${round(clamp(a.y + tangent(i - 1) * dx))}` +
      ` ${round(b.x - dx)},${round(clamp(b.y - tangent(i) * dx))} ${round(b.x)},${round(b.y)}`;
  }
  return path;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
