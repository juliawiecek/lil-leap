import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe],
  template: ` @if (points().length) {
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [style.height.px]="height()" role="img" [attr.aria-label]="label()">
        <defs>
          <!-- The trading app's area fill: the line colour fading to nothing at the baseline. -->
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--chart-line)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--chart-line)" stop-opacity="0" />
          </linearGradient>
        </defs>
        @for (tick of yTicks(); track tick) {
          <line class="grid" [class.baseline]="tick === 0" x1="54" [attr.x2]="right()" [attr.y1]="y(tick)" [attr.y2]="y(tick)" />
          <text x="44" [attr.y]="y(tick) + 4" text-anchor="end">
            {{ prefix() }}{{ tick / divisor() | number: '1.0-1' }}{{ suffix() }}
          </text>
        }
        <path class="area" [attr.d]="area()" [attr.fill]="'url(#' + gradientId + ')'" />
        <path class="line" [attr.d]="path()" />
        @if (points().length > 1) {
          <circle class="end-dot" [attr.cx]="x(points().length - 1)" [attr.cy]="y(points()[points().length - 1].value)" r="0.5" />
        }
        @for (p of points(); track $index) {
          <circle
            [attr.cx]="x($index)"
            [attr.cy]="y(p.value)"
            r="12"
            fill="transparent"
            tabindex="0"
            [attr.aria-label]="p.label + ': ' + prefix() + p.value"
            (mouseenter)="active.set($index)"
            (mouseleave)="active.set(null)"
            (focus)="active.set($index)"
            (blur)="active.set(null)"
          >
            <title>{{ p.label }}: {{ prefix() }}{{ p.value | number: '1.0-2' }}</title>
          </circle>
        }
        @for (i of tickIndices(); track i) {
          <text
            [attr.x]="x(i)"
            [attr.y]="height() - 9"
            [attr.text-anchor]="i === 0 ? 'start' : i === points().length - 1 ? 'end' : 'middle'"
          >
            {{ shortLabel(points()[i].label) }}
          </text>
        }
        @if (active() !== null && points()[active()!]; as p) {
          <circle
            [attr.cx]="x(active()!)"
            [attr.cy]="y(p.value)"
            r="4"
            fill="var(--chart-line)"
            pointer-events="none"
          />
        }
      </svg>
      <div class="chart-readout" aria-live="polite">
        @if (active() !== null && points()[active()!]; as p) {
          <span>{{ p.label }}</span
          ><strong>{{ prefix() }}{{ p.value | number: '1.0-2' }}</strong>
        } @else if (hint()) {
          <span>{{ hint() }}</span>
        }
      </div>
    } @else {
      <div class="empty">No observations in this period.</div>
    }`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        --chart-line: var(--nt-green, #94c973);
      }
      svg {
        width: 100%;
        display: block;
        overflow: visible;
      }
      text {
        fill: var(--nt-subtle, #7e8279);
        font: 600 11px var(--font-ui);
      }
      /* Same marks as the trading app's portfolio chart: faint grid, dotted baseline, round 2px line and end dot. */
      .grid {
        stroke: var(--nv-border, #1a1d1a);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .grid.baseline {
        stroke: var(--nv-border-hover, #3a4038);
        stroke-dasharray: 1 5;
        stroke-linecap: round;
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
        fill: none;
        stroke: var(--chart-line);
        stroke-width: 7;
        stroke-linecap: round;
        vector-effect: non-scaling-stroke;
        pointer-events: none;
      }
      circle:focus-visible {
        outline: none;
        stroke: var(--chart-line);
        stroke-width: 2px;
      }
      .chart-readout {
        min-height: 28px;
        display: flex;
        gap: 16px;
        align-items: center;
        color: var(--muted);
        font: 12px var(--font-ui);
      }
      .chart-readout strong {
        color: var(--text);
        font-variant-numeric: tabular-nums;
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
  readonly active = signal<number | null>(null);
  /** Drawing width in pixels, kept equal to the element's width so lines and labels are never stretched. */
  readonly width = signal(640);
  /** Drawing height in pixels. */
  readonly height = input(220);
  readonly right = computed(() => this.width() - 14);
  readonly bottom = computed(() => this.height() - 34);

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
  }
  readonly tickIndices = computed(() => {
    const last = this.points().length - 1;
    return [...new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last])].filter(
      (i) => i >= 0,
    );
  });
  shortLabel(label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
      return label;
    }
    return new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  readonly points = input<{ label: string; value: number }[]>([]);
  readonly label = input('Trading volume over time');
  /** Text under the chart until a point is hovered or focused. */
  readonly hint = input('Hover or focus a point to explore values');
  readonly prefix = input('$');
  /** Gap between y-axis lines: a round number (1, 2, 2.5 or 5 times a power of ten), at least 1 for whole counts. */
  readonly step = computed(() => {
    const values = this.points().map((p) => p.value);
    const top = Math.max(1, ...values);
    const raw = top / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
    return values.every(Number.isInteger) ? Math.max(1, Math.ceil(nice)) : nice;
  });
  /** Top of the scale: one step above the largest value, so the line never touches the top edge. */
  readonly max = computed(() => {
    const top = Math.max(0, ...this.points().map((p) => p.value));
    return (Math.floor(top / this.step()) + 1) * this.step();
  });
  /** Y-axis values from zero to the top of the scale, one per step, with no repeats. */
  readonly yTicks = computed(() => {
    const ticks: number[] = [];
    for (let v = 0; v <= this.max() + 1e-9; v += this.step()) {
      ticks.push(Number(v.toFixed(6)));
    }
    return ticks;
  });
  readonly divisor = computed(() => {
    if (this.max() >= 1000000) {
      return 1000000;
    }
    return this.max() >= 1000 ? 1000 : 1;
  });
  readonly suffix = computed(() => {
    if (this.divisor() === 1000000) {
      return 'M';
    }
    return this.divisor() === 1000 ? 'K' : '';
  });
  x(i: number) {
    return 54 + (i / Math.max(1, this.points().length - 1)) * (this.right() - 54);
  }
  y(v: number) {
    return this.bottom() - (v / this.max()) * (this.bottom() - 18);
  }
  /** Unique per chart, so two charts on one page never share an area gradient. */
  readonly gradientId = `insights-chart-fill-${++chartCount}`;
  /**
   * A smooth line through every point, like the trading app's charts. Monotone, so it never bulges above or
   * below the points: a running total still only ever rises.
   */
  readonly path = computed(() => monotonePath(this.points().map((p, i) => [this.x(i), this.y(p.value)])));
  readonly area = computed(
    () => this.path() + ` L${this.x(this.points().length - 1)},${this.bottom()} L54,${this.bottom()} Z`,
  );
}

let chartCount = 0;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * An SVG path through the points as a monotone cubic curve (Fritsch-Carlson): smooth, but never higher or lower
 * than the points on either side, so flat stretches stay flat and rises never overshoot.
 */
export function monotonePath(points: readonly (readonly [number, number])[]): string {
  if (!points.length) {
    return '';
  }
  const slopes = tangents(points);
  let d = `M${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const third = (x1 - x0) / 3;
    d += ` C${round(x0 + third)},${round(y0 + slopes[i - 1] * third)} ${round(x1 - third)},${round(y1 - slopes[i] * third)} ${round(x1)},${round(y1)}`;
  }
  return d;
}

/** The slope at each point, limited where needed so the curve between two points stays between them. */
function tangents(points: readonly (readonly [number, number])[]): number[] {
  const secants = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0] || 1));
  const slopes = points.map((_, i) => {
    const before = secants[i - 1] ?? secants[i] ?? 0;
    const after = secants[i] ?? before;
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  secants.forEach((secant, i) => {
    if (secant === 0) {
      slopes[i] = 0;
      slopes[i + 1] = 0;
      return;
    }
    const a = slopes[i] / secant;
    const b = slopes[i + 1] / secant;
    const length = a * a + b * b;
    if (length > 9) {
      const scale = 3 / Math.sqrt(length);
      slopes[i] = scale * a * secant;
      slopes[i + 1] = scale * b * secant;
    }
  });
  return slopes;
}
