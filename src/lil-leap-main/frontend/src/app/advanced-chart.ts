import { Component, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import type { AdvancedDashboard } from './advanced-dashboard';

@Component({
  selector: 'app-advanced-chart',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './advanced-chart.html',
  styleUrl: './advanced-chart.scss',
})
export class AdvancedChart {
  readonly desk = input.required<AdvancedDashboard>();
}
