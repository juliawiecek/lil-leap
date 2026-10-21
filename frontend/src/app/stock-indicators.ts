export interface Candle { at: number; open: number; high: number; low: number; close: number; }
export interface IndicatorPoint { at: number; price: number; }

/** SMA-seeded EMA; no values are emitted until a full period of observed bars exists. */
export function movingAverage(bars: readonly Candle[], period: number, kind: 'SMA' | 'EMA'): IndicatorPoint[] {
  if (!Number.isInteger(period) || period < 2 || period > 200 || bars.length < period) return [];
  const result: IndicatorPoint[] = [];
  let sum = 0, average = 0;
  const alpha = 2 / (period + 1);
  bars.forEach((bar, i) => {
    sum += bar.close;
    if (i >= period) sum -= bars[i - period].close;
    if (i < period - 1) return;
    average = kind === 'SMA' || i === period - 1 ? sum / period : alpha * bar.close + (1 - alpha) * average;
    result.push({ at: bar.at, price: average });
  });
  return result;
}
