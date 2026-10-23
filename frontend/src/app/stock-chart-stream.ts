import {
  distinctUntilChanged,
  filter,
  sampleTime,
  scan,
  type MonoTypeOperatorFunction,
} from 'rxjs';
import type { StockPriceTick } from './stock-price-ticks';
import { validPrice } from './stock-chart-math';
export type ChartSampleMs = 5000 | 10000;
export function samplingInterval(value: number): ChartSampleMs {
  if (value !== 5000 && value !== 10000) {
    throw new RangeError('sampleMs must be 5000 or 10000.');
  }
  return value;
}
/** Apply only on the chart branch: the supplied source and other subscribers stay live. */
export function samplePrices<T extends StockPriceTick>(
  milliseconds: ChartSampleMs,
): MonoTypeOperatorFunction<T> {
  return (source) =>
    source.pipe(
      filter((point: T) => validPrice(point)),
      scan((latest, tick) => (tick.time < latest.time ? latest : tick)),
      sampleTime(samplingInterval(milliseconds)),
      distinctUntilChanged((a, b) => a.time === b.time && a.price === b.price),
    );
}
