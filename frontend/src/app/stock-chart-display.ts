import type { StockPriceTick } from './stock-price-ticks';

export interface QuoteCandle {
  time: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Stable clock intervals keep candles legible as the plot resizes. Times are seconds. */
export function displayInterval(span: number, width: number): number {
  const target = span / Math.max(1, Math.min(100, Math.floor(width / 10)));
  return [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 86400]
    .find(interval => interval >= target) ?? 86400;
}

/** Aggregate chronological, normalized quotes. Empty intervals stay empty; no prices are invented. */
export function quoteCandles(points: readonly StockPriceTick[], interval: number): QuoteCandle[] {
  const candles: QuoteCandle[] = [];
  let previous = -Infinity;
  for (const point of points) {
    const bucket = Math.floor(point.time / interval);
    if (bucket !== previous) {
      candles.push({ time: point.time, endTime: point.time, open: point.price,
        high: point.price, low: point.price, close: point.price });
      previous = bucket;
    } else {
      const candle = candles.at(-1)!;
      candle.endTime = point.time;
      candle.high = Math.max(candle.high, point.price);
      candle.low = Math.min(candle.low, point.price);
      candle.close = point.price;
    }
  }
  return candles;
}

/** A quiet overview of interval closes; the original observations remain available for inspection. */
export function overviewPoints(points: readonly StockPriceTick[], interval: number): StockPriceTick[] {
  if (!points.length) return [];
  const closes = quoteCandles(points, interval).map(candle => ({ time: candle.endTime, price: candle.close }));
  return closes[0].time === points[0].time ? closes : [points[0], ...closes];
}
