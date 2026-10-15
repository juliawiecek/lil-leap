import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-portfolio-value-chart',
  imports: [CurrencyPipe],
  template: `
    <section class="pv-chart" aria-label="Portfolio value history">
      <div class="pv-y-axis">
        <span>{{ axis()[0] | currency }}</span><span>{{ axis()[1] | currency }}</span><span>{{ axis()[2] | currency }}</span><span>{{ axis()[3] | currency }}</span>
      </div>
      <div class="pv-plot">
        <span class="pv-price">{{ currentValue() | currency }}</span>
        <svg viewBox="0 0 780 155" preserveAspectRatio="none" [attr.aria-label]="period() + ' portfolio value chart'" role="img">
          <defs>
            <linearGradient [attr.id]="gradientId()" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#63ca74" stop-opacity=".22" />
              <stop offset="100%" stop-color="#63ca74" stop-opacity=".015" />
            </linearGradient>
          </defs>
          <path d="M0 15H780M0 55H780M0 95H780M0 135H780" stroke="#293333" stroke-dasharray="2 3" fill="none" />
          <path [attr.d]="path() + 'L780 150H0Z'" [attr.fill]="'url(#' + gradientId() + ')'" />
          <path [attr.d]="path()" fill="none" stroke="#8bdd88" stroke-width="1.6" vector-effect="non-scaling-stroke" />
          <circle cx="780" [attr.cy]="endY()" r="3.8" fill="#87df88" />
          <path d="M0 150H780" stroke="#2a3337" />
        </svg>
        <div class="pv-x-axis">@for (label of labels(); track $index) { <span>{{ label }}</span> }</div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .pv-chart { display: flex; min-height: 185px; }
    .pv-y-axis { width: 62px; display: flex; flex-direction: column; justify-content: space-between; padding: 5px 8px 30px 0; color: #87918f; font-size: 11px; text-align: right; }
    .pv-plot { position: relative; flex: 1; min-width: 0; }
    .pv-plot svg { display: block; width: 100%; height: 155px; overflow: visible; }
    .pv-price { position: absolute; right: 2px; top: -4px; color: #bce9b9; font-size: 12px; }
    .pv-x-axis { display: flex; justify-content: space-between; padding-top: 8px; color: #87918f; font-size: 11px; line-height: 16px; }
  `],
})
export class PortfolioValueChart {
  readonly values = input<readonly number[]>([]);
  readonly currentValue = input(0);
  readonly period = input('1D');
  readonly labels = input<readonly string[]>([]);
  readonly gradientId = input('portfolio-value-fill');

  readonly range = computed(() => {
    const values = this.values().length ? this.values() : [this.currentValue()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, Math.max(max, 1) * 0.0025);
    return { min: min - padding, max: max + padding };
  });
  readonly axis = computed(() => {
    const { min, max } = this.range();
    const step = (max - min) / 3;
    return [max, max - step, max - step * 2, min];
  });
  readonly path = computed(() => {
    const values = this.values().length ? this.values() : [this.currentValue()];
    const { min, max } = this.range();
    return values.map((value, index) => {
      const x = values.length === 1 ? 780 : (index / (values.length - 1)) * 780;
      const y = 10 + ((max - value) / (max - min || 1)) * 130;
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  });
  readonly endY = computed(() => {
    const values = this.values();
    const value = values.length ? values[values.length - 1] : this.currentValue();
    const { min, max } = this.range();
    return 10 + ((max - value) / (max - min || 1)) * 130;
  });
}