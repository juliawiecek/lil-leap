import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/** Room around the line so the end dot and its ring are never clipped. */
const PAD = 10;

/**
 * A line chart drawn like the trading app's portfolio charts: one line, no fill, no axes, a dotted line at the
 * starting value and a dot on the latest point; green while the series is level or rising, red when it falls.
 * Hovering or focusing a point shows its label and value underneath.
 */
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe],
  template: ` @if (points().length) {
      <svg
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
        [style.height.px]="height()"
        [class.down]="falling()"
        role="img"
        [attr.aria-label]="label()"
      >
        <line class="start" [attr.x1]="PAD" [attr.x2]="width() - PAD" [attr.y1]="startY()" [attr.y2]="startY()" />
        <path class="line" [attr.d]="path()" />
        <circle class="end-ring" [attr.cx]="x(points().length - 1)" [attr.cy]="y(last())" r="8" />
        <circle class="end-dot" [attr.cx]="x(points().length - 1)" [attr.cy]="y(last())" r="4" />
        @for (p of points(); track $index) {
          <circle
            class="hit"
            [attr.cx]="x($index)"
            [attr.cy]="y(p.value)"
            r="12"
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
        @if (active() !== null && points()[active()!]; as p) {
          <line class="cursor" [attr.x1]="x(active()!)" [attr.x2]="x(active()!)" y1="0" [attr.y2]="height()" />
          <circle class="end-dot" [attr.cx]="x(active()!)" [attr.cy]="y(p.value)" r="4" pointer-events="none" />
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
      }
      svg {
        --chart-line: var(--nt-green, #94c973);
        width: 100%;
        display: block;
        overflow: visible;
      }
      svg.down {
        --chart-line: #ff7a6e;
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
      }
      .end-ring {
        fill: var(--chart-line);
        opacity: 0.25;
      }
      .cursor {
        stroke: var(--nt-muted, #a4a79e);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .hit {
        fill: transparent;
      }
      .hit:focus-visible {
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
  protected readonly PAD = PAD;
  readonly active = signal<number | null>(null);
  /** Drawing width in pixels, kept equal to the element's width so lines are never stretched. */
  readonly width = signal(640);
  /** Drawing height in pixels. */
  readonly height = input(220);
  readonly points = input<{ label: string; value: number }[]>([]);
  readonly label = input('Trading volume over time');
  /** Text under the chart until a point is hovered or focused. */
  readonly hint = input('Hover or focus a point to explore values');
  readonly prefix = input('$');

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
  /** Height of the dotted line: the first value, like the trading app's opening-value line. */
  readonly startY = computed(() => this.y(this.points()[0]?.value ?? 0));

  x(i: number): number {
    return PAD + (i / Math.max(1, this.points().length - 1)) * (this.width() - 2 * PAD);
  }
  y(v: number): number {
    const { low, high } = this.range();
    return this.height() - PAD - ((v - low) / (high - low)) * (this.height() - 2 * PAD);
  }
  /** Straight segments from point to point, like the trading app's charts. */
  readonly path = computed(() =>
    this.points()
      .map((p, i) => `${i ? 'L' : 'M'}${round(this.x(i))},${round(this.y(p.value))}`)
      .join(' '),
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
