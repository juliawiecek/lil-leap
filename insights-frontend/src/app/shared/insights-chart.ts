import { describeSeries, seriesPoints, seriesTable, type SeriesPoint, type ChartTable } from '../../../../shared/chart-description';
import { InsightsChartAccess } from './insights-chart-access';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';

let chartId = 0;

/** One point on the chart. */
export interface ChartPoint {
  label: string;
  value: number;
  /** When it happened, in milliseconds since 1970; places the point at its real time. */
  at?: number;
  /** A detail shown after the label when the point is hovered or focused. */
  note?: string;
}
@Component({
  selector: 'app-insights-chart',
  imports: [DecimalPipe, InsightsChartAccess],
  template: ` @if (plotPoints().length) {
      <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" [style.height.px]="height()" role="img" [attr.aria-label]="label()" tabindex="0" [attr.aria-describedby]="id + '-summary'" (focus)="focusSummary()" (blur)="blurChart()" (keydown)="inspectKey($event)">
        @for (tick of yTicks(); track tick) {
          <line x1="54" [attr.x2]="right()" [attr.y1]="y(tick)" [attr.y2]="y(tick)" stroke="var(--line)" />
          <text x="44" [attr.y]="y(tick) + 4" text-anchor="end">
            {{ prefix() }}{{ tick / divisor() | number: '1.0-1' }}{{ suffix() }}
          </text>
        }
        <path [attr.d]="area()" fill="var(--chart-fill, #121a10)" />
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
        @if (ticks().length) {
          @for (tick of ticks(); track tick.at) {
            <text [attr.x]="xAt(tick.at)" [attr.y]="height() - 9" [attr.text-anchor]="anchorAt(xAt(tick.at))">{{ tick.label }}</text>
          }
        } @else {
          @for (i of tickIndices(); track i) {
            <text
              [attr.x]="x(i)"
              [attr.y]="height() - 9"
              [attr.text-anchor]="i === 0 ? 'start' : i === plotPoints().length - 1 ? 'end' : 'middle'"
            >
              {{ shortLabel(plotPoints()[i].label) }}
            </text>
          }
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
          <span>{{ p.label }}</span>
          @if (p.note) {
            <span class="note">{{ p.note }}</span>
          }
          @if (valueLabel()) {
            <span>{{ valueLabel() }}</span>
          }
          <strong>{{ prefix() }}{{ p.value | number: '1.0-2' }}</strong>
        } @else if (hint()) {
          <span>{{ hint() }}</span>
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
        display: block;
        overflow: visible;
      }
      text {
        fill: var(--muted);
        font: 500 11px var(--font-mono, monospace);
      }
      line {
        opacity: 0.65;
      }
      /* No browser focus box: clicking a point would draw a square over the line. Keyboard focus gets a round ring. */
      circle:focus {
        outline: none;
      }
      circle:focus-visible {
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
      .chart-readout .note {
        color: var(--text);
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
  readonly validPoints = computed(() => this.points().filter(p => Number.isFinite(p.value) && (p.at === undefined || Number.isFinite(p.at))));
  readonly sourceTimed = computed(() => this.validPoints().length > 1 && this.validPoints().every(p => p.at !== undefined));
  readonly dated = computed(() => this.sourceTimed() || this.validPoints().every(p => /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(p.label) && Number.isFinite(Date.parse(p.label))));
  /** Normalize once so timestamps, order details, paths and alternatives stay together. */
  readonly dataPoints = computed(() => seriesPoints(this.validPoints().map((p, index) => ({
    ...p,
    at: this.sourceTimed() ? p.at! : this.dated() ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(p.label) ? p.label + 'T12:00:00Z' : p.label) : index,
  }))) as (SeriesPoint & { note?: string })[]);
  readonly plotPoints = computed(() => this.dataPoints().map(p => ({
    label: p.label!, value: p.value,
    ...(this.sourceTimed() ? { at: p.at } : {}),
    ...(p.note ? { note: p.note } : {}),
  })));
  readonly valueOptions = computed(() => ({ name: this.label(), currency: this.prefix() === '$' ? 'USD' : undefined,
    unit: this.prefix() === '' ? this.valueLabel().toLowerCase().includes('order') ? 'orders' : 'trades' : undefined,
    categorical: !this.dated() }));
  readonly description = computed(() => describeSeries(this.dataPoints(), this.valueOptions())
    + this.plotPoints().filter(p => p.note).map(p => ` ${p.label}: ${p.note}.`).join(''));
  readonly dataTable = computed(() => this.withOrderDetails(seriesTable(this.dataPoints(), this.valueOptions(), !this.sourceTimed(), this.valueOptions().unit === 'trades')));
  readonly allData = computed(() => this.withOrderDetails(seriesTable(this.dataPoints(), this.valueOptions(), false)));
  private withOrderDetails(table: ChartTable): ChartTable {
    if (this.sourceTimed()) { table = { ...table, columns: ['Time (Central)', ...table.columns.slice(1)] }; }
    if (table.grouped || !this.plotPoints().some(p => p.note)) { return table; }
    return { ...table, columns: [...table.columns, 'Order details'],
      rows: table.rows.map((row, index) => [...row, this.plotPoints()[index]?.note ?? '']) };
  }
  focusSummary(): void { this.access()?.focusSummary(); }
  blurChart(): void { this.active.set(null); this.access()?.focused.set(false); }
  inspectKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) { return; }
    event.preventDefault();
    if (event.key === 'Escape') { this.active.set(null); return; }
    const last = this.plotPoints().length - 1;
    if (last < 0) { return; }
    const current = this.active() ?? (event.key === 'ArrowLeft' ? last + 1 : -1);
    this.active.set(event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, current + (event.key === 'ArrowLeft' ? -1 : 1))));
  }


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
  /** Each point's label and value; `at` (milliseconds) places it at its real time, `note` adds a detail line. */
  readonly points = input<ChartPoint[]>([]);
  /** Labels along the bottom at real times; used instead of point labels when the points are timed. */
  readonly ticks = input<{ at: number; label: string }[]>([]);
  /** Words before the value in the readout, e.g. "Orders so far". */
  readonly valueLabel = input('');
  readonly label = input('Trading volume over time');
  /** Text under the chart until a point is hovered or focused. */
  readonly hint = input('Hover a point or use the arrow keys on the chart to explore values');
  readonly prefix = input('$');
  /** Gap between y-axis lines: a round number (1, 2, 2.5 or 5 times a power of ten), at least 1 for whole counts. */
  readonly step = computed(() => {
    const values = this.plotPoints().map((p) => p.value);
    const top = Math.max(1, ...values);
    const raw = top / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
    return values.every(Number.isInteger) ? Math.max(1, Math.ceil(nice)) : nice;
  });
  /** Top of the scale: one step above the largest value, so the line never touches the top edge. */
  readonly max = computed(() => {
    const top = Math.max(0, ...this.plotPoints().map((p) => p.value));
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
  /** True when every point has a time, so points sit at their real times instead of evenly apart. */
  readonly timed = computed(() => this.plotPoints().length > 1 && this.plotPoints().every((p) => p.at !== undefined));
  x(i: number) {
    if (this.timed()) {
      return this.xAt(this.plotPoints()[i].at!);
    }
    return 54 + (i / Math.max(1, this.plotPoints().length - 1)) * (this.right() - 54);
  }
  /** Horizontal position of a time, between the first and last timed points. */
  xAt(at: number) {
    const points = this.plotPoints();
    const first = points[0]?.at ?? 0;
    const span = (points.at(-1)?.at ?? first) - first || 1;
    return 54 + ((at - first) / span) * (this.right() - 54);
  }
  /** Keeps labels near either edge inside the chart. */
  anchorAt(x: number) {
    if (x < 90) {
      return 'start';
    }
    return x > this.right() - 36 ? 'end' : 'middle';
  }
  y(v: number) {
    return this.bottom() - (v / this.max()) * (this.bottom() - 18);
  }
  /** A stepped line: a running total holds level, then rises at the point where it changed. */
  readonly path = computed(() =>
    this.plotPoints()
      .map((p, i, all) =>
        i ? `L${this.x(i)},${this.y(all[i - 1].value)} L${this.x(i)},${this.y(p.value)}` : `M${this.x(i)},${this.y(p.value)}`,
      )
      .join(' '),
  );
  readonly area = computed(
    () => this.path() + ` L${this.x(this.plotPoints().length - 1)},${this.bottom()} L54,${this.bottom()} Z`,
  );
}
