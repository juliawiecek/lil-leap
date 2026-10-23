import { PriceFlash } from './price-flash';
import { TechnicalChart } from './technical-chart';
import { FinancialChange } from './financial-change';
import { Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import type { AdvancedDashboard } from './advanced-dashboard';
import { StockDashboardComponent } from './stock-dashboard.component';

@Component({
  selector: 'app-advanced-chart',
  imports: [FinancialChange, PriceFlash, TechnicalChart, CurrencyPipe, StockDashboardComponent],
  templateUrl: './advanced-chart.html',
  styleUrl: './advanced-chart.scss',
})
export class AdvancedChart {
  readonly desk = input.required<AdvancedDashboard>();
  readonly asset = computed(() => {
    const desk = this.desk();
    const quote = desk.selected();
    const instrument = desk.instruments().find(row => row.symbol === quote.symbol);
    return instrument ? { symbol: instrument.symbol, name: instrument.instrumentName, market: instrument.marketCode } : null;
  });
}
