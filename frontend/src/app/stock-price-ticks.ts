import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

/** One stock's price at a Unix timestamp in seconds (fractional seconds preserve backend timestamp precision). */
export interface StockPriceTick {
  readonly time: number;
  readonly price: number;
}

/** Provide a raw real-time stream, scoped to the chart's stock. */
export const STOCK_PRICE_TICKS = new InjectionToken<Observable<StockPriceTick>>(
  'STOCK_PRICE_TICKS',
);
