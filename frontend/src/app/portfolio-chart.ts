import { Component, computed, input, output } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { CHART_PERIODS, ChartPeriod, ChartRange, ValuePoint, timeAxis, valueAxis, valuePath } from './portfolio-history';

const WIDTH = 780;
const HEIGHT = 140;

/**
 * The novice overview's portfolio-value line for the chosen period, drawn from the account's
 * real history (see portfolio-history.ts). Says plainly when the period starts at the account's
 * opening, or when there is not enough history yet to draw a line.
 */
@Component({
  selector: 'app-portfolio-chart',
  imports: [CurrencyPipe, DatePipe],
  template: `
    <div class="chart-head">
      <div class="period-picker" role="group" aria-label="Chart time range">
        @for (item of periods; track item) {
          <button type="button" [class.selected]="period() === item" [attr.aria-pressed]="period() === item" (click)="periodChange.emit(item)">
            {{ item }}
          </button>
        }
      </div>
      @if (change(); as move) {
        <span class="period-change" [class.positive]="move.amount > 0" [class.negative]="move.amount < 0">
          {{ move.amount > 0 ? '+' : '' }}{{ move.amount | currency }} ({{ move.amount > 0 ? '+' : '' }}{{ move.percent.toFixed(2) }}%) {{ periodLabel() }}
        </span>
      }
    </div>
    @if (error()) {
      <p class="chart-note" role="alert">{{ error() }}</p>
    } @else if (loading() && points().length < 2) {
      <p class="chart-note" aria-live="polite">Loading your portfolio history…</p>
    } @else if (points().length < 2) {
      <p class="chart-note">Your portfolio history will appear here as prices are recorded.</p>
    } @else {
      <div class="chart-body">
        <div class="y-axis" aria-hidden="true">
          @for (label of axis().labels; track $index) {
            <span>{{ label | currency: 'USD' : 'symbol' : (axis().cents ? '1.2-2' : '1.0-0') }}</span>
          }
        </div>
        <div class="plot">
          <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" role="img" [attr.aria-label]="summary()">
            <defs>
              <linearGradient id="novice-value-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#63ca74" stop-opacity=".22" />
                <stop offset="100%" stop-color="#63ca74" stop-opacity=".015" />
              </linearGradient>
            </defs>
            <path [attr.d]="gridLines" stroke="#293333" stroke-dasharray="2 3" fill="none" />
            <path [attr.d]="path() + ' L' + width + ' ' + height + ' L0 ' + height + ' Z'" fill="url(#novice-value-fill)" />
            <path [attr.d]="path()" fill="none" stroke="#8bdd88" stroke-width="1.6" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="x-axis" aria-hidden="true">
            @for (label of times(); track $index) {
              <span>{{ label }}</span>
            }
          </div>
        </div>
      </div>
      @if (range()?.fromOpening) {
        <p class="chart-note">Your account opened {{ range()!.start | date: 'MMM d, HH:mm' }}, so this shows everything since then.</p>
      }
    }
  `,
  styles: [`
    :host { display: block; margin-top: 16px; }
    .chart-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .period-picker { display: inline-flex; gap: 4px; padding: 3px; border-radius: 8px; background: #151c1f; }
    .period-picker button { min-width: 38px; min-height: 26px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: #a5b0ad; font: inherit; font-size: 12px; cursor: pointer; }
    .period-picker button.selected { background: #8bdd88; color: #0b1310; font-weight: 700; }
    .period-picker button:focus-visible { outline: 2px solid #8bdd88; outline-offset: 2px; }
    .period-change { color: #a5b0ad; font-size: 13px; }
    .period-change.positive { color: #63ca74; }
    .period-change.negative { color: #f05459; }
    .chart-body { display: flex; min-height: 160px; }
    .y-axis { display: flex; flex-direction: column; justify-content: space-between; width: 82px; padding: 0 8px 22px 0; color: #87918f; font-size: 11px; text-align: right; }
    .plot { flex: 1; min-width: 0; }
    svg { display: block; width: 100%; height: 140px; overflow: visible; }
    .x-axis { display: flex; justify-content: space-between; padding-top: 8px; color: #87918f; font-size: 11px; }
    .chart-note { margin: 8px 0 0; color: #87918f; font-size: 12px; }
  `],
})
export class PortfolioChart {
  readonly points = input<readonly ValuePoint[]>([]);
  readonly range = input<ChartRange | null>(null);
  readonly period = input<ChartPeriod>('1D');
  readonly loading = input(false);
  readonly error = input('');
  readonly periodChange = output<ChartPeriod>();

  readonly periods = CHART_PERIODS;
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly gridLines = `M0 0H${WIDTH}M0 ${HEIGHT / 3}H${WIDTH}M0 ${(2 * HEIGHT) / 3}H${WIDTH}M0 ${HEIGHT}H${WIDTH}`;
  readonly axis = computed(() => valueAxis(this.points()));
  readonly path = computed(() => {
    const range = this.range();
    return range ? valuePath(this.points(), range, this.axis(), WIDTH, HEIGHT) : '';
  });
  readonly times = computed(() => {
    const range = this.range();
    return range ? timeAxis(range) : [];
  });
  /** How much the value moved over the shown span. */
  readonly change = computed(() => {
    const points = this.points();
    if (points.length < 2) {
      return null;
    }
    const first = points[0].value;
    const amount = Math.round((points.at(-1)!.value - first) * 100) / 100;
    return { amount, percent: first > 0 ? (amount / first) * 100 : 0 };
  });
  readonly periodLabel = computed(() => (this.range()?.fromOpening ? 'since opening' : PERIOD_WORDS[this.period()]));
  /** What a screen reader hears instead of the drawing. */
  readonly summary = computed(() => {
    const points = this.points();
    const move = this.change();
    if (!move || !points.length) {
      return 'Portfolio value chart';
    }
    const word = move.amount > 0 ? 'up' : move.amount < 0 ? 'down' : 'unchanged';
    return `Portfolio value ${this.periodLabel()}: from $${points[0].value.toFixed(2)} to $${points.at(-1)!.value.toFixed(2)}, ${word} ${Math.abs(move.percent).toFixed(2)}%`;
  });
}

const PERIOD_WORDS: Record<ChartPeriod, string> = {
  '1D': 'past day', '1W': 'past week', '1M': 'past month', '3M': 'past 3 months', '1Y': 'past year', ALL: 'since opening',
};
