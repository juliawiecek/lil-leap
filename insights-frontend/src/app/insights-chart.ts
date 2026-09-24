import { Component, computed, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe],
  template: ` @if (points().length) {
      <svg viewBox="0 0 640 220" role="img" [attr.aria-label]="label()" preserveAspectRatio="none">
        @for (tick of [0, 1, 2, 3, 4]; track tick) {
          <line
            x1="54"
            x2="626"
            [attr.y1]="18 + tick * 42"
            [attr.y2]="18 + tick * 42"
            stroke="var(--line)"
          />
          <text x="44" [attr.y]="22 + tick * 42" text-anchor="end">
            {{ prefix() }}{{ (max() * (4 - tick)) / 4 / divisor() | number: '1.0-0' }}{{ suffix() }}
          </text>
        }
        <path [attr.d]="area()" fill="var(--accent)" opacity=".10" />
        <path
          [attr.d]="path()"
          fill="none"
          stroke="var(--accent)"
          stroke-width="2.5"
          vector-effect="non-scaling-stroke"
        />
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
            y="211"
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
            fill="var(--accent)"
            pointer-events="none"
          />
        }
      </svg>
      <div class="chart-readout" aria-live="polite">
        @if (active() !== null && points()[active()!]; as p) {
          <span>{{ p.label }}</span
          ><strong>{{ prefix() }}{{ p.value | number: '1.0-2' }}</strong>
        } @else {
          <span>Hover or focus a point to explore values</span>
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
        width: 100%;
        height: 260px;
        overflow: visible;
      }
      text {
        fill: var(--muted);
        font:
          11px Inter,
          sans-serif;
      }
      line {
        opacity: 0.65;
      }
      circle:focus-visible {
        outline: none;
        stroke: var(--accent);
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
  readonly tickIndices = computed(() => {
    const last = this.points().length - 1;
    return [...new Set([0, Math.round(last / 3), Math.round((last * 2) / 3), last])].filter(
      (i) => i >= 0,
    );
  });
  shortLabel(label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
    return new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }
  readonly points = input<{ label: string; value: number }[]>([]);
  readonly label = input('Trading volume over time');
  readonly prefix = input('$');
  readonly max = computed(() => Math.max(1, ...this.points().map((p) => p.value)) * 1.15);
  readonly divisor = computed(() =>
    this.max() >= 1000000 ? 1000000 : this.max() >= 1000 ? 1000 : 1,
  );
  readonly suffix = computed(() =>
    this.divisor() === 1000000 ? 'M' : this.divisor() === 1000 ? 'K' : '',
  );
  x(i: number) {
    return 54 + (i / Math.max(1, this.points().length - 1)) * 572;
  }
  y(v: number) {
    return 186 - (v / this.max()) * 168;
  }
  readonly path = computed(() =>
    this.points()
      .map((p, i) => `${i ? 'L' : 'M'}${this.x(i)},${this.y(p.value)}`)
      .join(' '),
  );
  readonly area = computed(
    () => this.path() + ` L${this.x(this.points().length - 1)},186 L54,186 Z`,
  );
}
