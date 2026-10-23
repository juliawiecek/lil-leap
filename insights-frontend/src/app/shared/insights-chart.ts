import { describeSeries, seriesPoints, seriesTable } from '../../../../shared/chart-description';
import { InsightsChartAccess } from './insights-chart-access';

import { Component, computed, input, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
let chartId = 0;
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe, InsightsChartAccess],
  template: ` @if (plotPoints().length) {
      <svg viewBox="0 0 640 220" role="img" tabindex="0" [attr.aria-label]="label()" [attr.aria-describedby]="id + '-summary'" (focus)="focusSummary()" (blur)="blurChart()" (keydown)="inspectKey($event)" preserveAspectRatio="none">
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
        @for (p of plotPoints(); track $index) {
          <circle
            [attr.cx]="x($index)"
            [attr.cy]="y(p.value)"
            r="12"
            fill="transparent"
            aria-hidden="true"
            (mouseenter)="active.set($index)"
            (mouseleave)="active.set(null)"
          >
            <title>{{ p.label }}: {{ prefix() }}{{ p.value | number: '1.0-2' }}</title>
          </circle>
        }
        @for (i of tickIndices(); track i) {
          <text
            [attr.x]="x(i)"
            y="211"
            [attr.text-anchor]="i === 0 ? 'start' : i === plotPoints().length - 1 ? 'end' : 'middle'"
          >
            {{ shortLabel(plotPoints()[i].label) }}
          </text>
        }
        @if (active() !== null && plotPoints()[active()!]; as p) {
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
        @if (active() !== null && plotPoints()[active()!]; as p) {
          <span>{{ p.label }}</span
          ><strong>{{ prefix() }}{{ p.value | number: '1.0-2' }}</strong>
        } @else {
          <span>Hover a point or use the arrow keys on the chart to explore values</span>
        }
      </div>
    } @else {
      <div class="empty">No observations in this period.</div>
    }
    <app-insights-chart-access #access [id]="id" [label]="label()" [summary]="description()" [table]="dataTable()" [rawTable]="allData()" [context]="context() + label()" />`,
  styles: [
    `
      svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
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
  readonly id = `insights-chart-${++chartId}`;
  readonly context = input('');
  readonly access = viewChild(InsightsChartAccess);
  readonly dated = computed(() => this.points().filter(p => Number.isFinite(p.value)).every(p => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(p.label) && Number.isFinite(Date.parse(p.label))));
  /** Normalize once: the renderer, explanation and table consume exactly these observations. */
  readonly dataPoints = computed(() => {
    const points = this.points().filter(p => Number.isFinite(p.value));
    const dated = this.dated();
    return seriesPoints(points.map((p, index) => ({
      at: dated ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(p.label) ? p.label + 'T12:00:00Z' : p.label) : index,
      label: p.label, value: p.value,
    })));
  });
  readonly plotPoints = computed(() => this.dataPoints().map(p => ({ label: p.label!, value: p.value })));
  readonly valueOptions = computed(() => ({ name: this.label(), currency: this.prefix() === '$' ? 'USD' : undefined, unit: this.prefix() === '' ? 'trades' : undefined, categorical: !this.dated() }));
  readonly description = computed(() => describeSeries(this.dataPoints(), this.valueOptions()));
  readonly dataTable = computed(() => seriesTable(this.dataPoints(), this.valueOptions(), true, this.prefix() === ''));
  readonly allData = computed(() => seriesTable(this.dataPoints(), this.valueOptions(), false));
  focusSummary(): void { this.access()?.focusSummary(); }
  blurChart(): void { this.active.set(null); this.access()?.focused.set(false); }
  inspectKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { this.active.set(null); return; }
    const last = this.plotPoints().length - 1;
    if (last < 0) return;
    const current = this.active() ?? (event.key === 'ArrowLeft' ? last + 1 : -1);
    this.active.set(event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, current + (event.key === 'ArrowLeft' ? -1 : 1))));
  }

  readonly active = signal<number | null>(null);
  readonly tickIndices = computed(() => {
    const last = this.plotPoints().length - 1;
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
  readonly prefix = input('$');
  readonly max = computed(() => Math.max(1, ...this.plotPoints().map((p) => p.value)) * 1.15);
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
    return 54 + (i / Math.max(1, this.plotPoints().length - 1)) * 572;
  }
  y(v: number) {
    return 186 - (v / this.max()) * 168;
  }
  readonly path = computed(() =>
    this.plotPoints()
      .map((p, i) => `${i ? 'L' : 'M'}${this.x(i)},${this.y(p.value)}`)
      .join(' '),
  );
  readonly area = computed(
    () => this.path() + ` L${this.x(this.plotPoints().length - 1)},186 L54,186 Z`,
  );
}
