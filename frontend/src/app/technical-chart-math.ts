import type { PricePoint } from './market-feed-api';
import { orderedPrices } from './chart-data';
export interface Indicator {
  name: 'EMA 50' | 'EMA 200' | 'VWAP';
  dash: string;
  token: string;
  points: PricePoint[];
  unavailable: string;
}

/** Seed with the actual period's SMA; no invented warm-up values or displaced timestamps. */
export function ema(points: readonly PricePoint[], period: number): PricePoint[] {
  points = orderedPrices(points);
  if (!Number.isInteger(period) || period < 1 || points.length < period) {
    return [];
  }
  let value = points.slice(0, period).reduce((sum, p) => sum + p.price, 0) / period;
  const output = [{ at: points[period - 1].at, price: value }];
  for (const p of points.slice(period)) {
    value += (p.price - value) * 2 / (period + 1);
    output.push({ at: p.at, price: value });
  }
  return output;
}

/** Bar VWAP uses reported traded volume and typical OHLC price, reset each exchange day. */
export function vwap(points: readonly PricePoint[]): PricePoint[] {
  points = orderedPrices(points);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  let session = '', weighted = 0, volume = 0;
  const output: PricePoint[] = [];
  for (const p of points) {
    const bar = p.candle;
    // A missing bar/volume makes a cumulative VWAP unknowable, including subsequent points.
    if (!bar || bar.volume === null || !Number.isFinite(bar.volume) || bar.volume < 0) {
      return [];
    }
    if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
        Math.min(bar.open, bar.high, bar.low, bar.close) <= 0 ||
        bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      return [];
    }
    const next = day.format(bar.time);
    if (next !== session) { session = next; weighted = volume = 0; }
    weighted += (bar.high + bar.low + bar.close) / 3 * bar.volume;
    volume += bar.volume;
    if (volume > 0) {
      output.push({ at: p.at, price: weighted / volume });
    }
  }
  return output;
}

/** Wilder RSI: SMA of the first N gains/losses, then Wilder's recursive smoothing.
 * N changes need N+1 prices. Flat prices are neutral (50); zero loss alone is 100.
 */
export function rsi(points: readonly PricePoint[], period = 14): PricePoint[] {
  points = orderedPrices(points);
  if (!Number.isInteger(period) || period < 1 || points.length <= period) { return []; }
  let gain = 0, loss = 0;
  const output: PricePoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].price - points[i - 1].price;
    if (i <= period) { gain += Math.max(0, delta) / period; loss += Math.max(0, -delta) / period; }
    else { gain = (gain * (period - 1) + Math.max(0, delta)) / period; loss = (loss * (period - 1) + Math.max(0, -delta)) / period; }
    if (i >= period) { output.push({ at: points[i].at, price: loss === 0 ? gain === 0 ? 50 : 100 : Math.max(0, Math.min(100, 100 - 100 / (1 + gain / loss))) }); }
  }
  return output;
}

export function indicators(points: readonly PricePoint[]): Indicator[] {
  const bars = points.filter(point => point.candle);
  return [
    { name: 'EMA 50', dash: '', token: 'var(--chart-1)', points: ema(bars, 50), unavailable: 'Needs 50 recorded bars' },
    { name: 'EMA 200', dash: '8 5', token: 'var(--chart-2)', points: ema(bars, 200), unavailable: 'Needs 200 recorded bars' },
    { name: 'VWAP', dash: '1 5', token: 'var(--chart-3)', points: vwap(points), unavailable: 'Unavailable: traded volume is not supplied' },
  ];
}

/** Display aggregation preserves true OHLC extremes and never changes the source or indicator inputs. */
export function displayCandles(points: readonly PricePoint[], limit: number): PricePoint[] {
  const bars = points.filter(p => p.candle);
  const step = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor(limit))));
  const output: PricePoint[] = [];
  for (let i = 0; i < bars.length; i += step) {
    const bucket = bars.slice(i, i + step), first = bucket[0].candle!, last = bucket.at(-1)!;
    output.push({ at: last.at, price: last.price, candle: {
      time: first.time, open: first.open, close: last.candle!.close,
      high: Math.max(...bucket.map(p => p.candle!.high)), low: Math.min(...bucket.map(p => p.candle!.low)),
      volume: bucket.every(p => p.candle!.volume !== null) ? bucket.reduce((sum, p) => sum + p.candle!.volume!, 0) : null,
    } });
  }
  return output;
}

/** Keep every label inside the plot with a minimum gap, without hiding colliding series. */
export function placeEndLabels<T extends { y: number }>(labels: readonly T[], height: number, gap = 20, inset = 10): (T & { labelY: number })[] {
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  const actualGap = Math.min(gap, (height - inset * 2) / Math.max(1, sorted.length - 1));
  const placed = sorted.map((label, i) => ({ ...label, labelY: Math.max(inset + i * actualGap, Math.min(height - inset, label.y)) }));
  for (let i = 1; i < placed.length; i++) {
    placed[i].labelY = Math.max(placed[i].labelY, placed[i - 1].labelY + actualGap);
  }
  for (let i = placed.length - 1; i >= 0; i--) {
    placed[i].labelY = Math.min(placed[i].labelY, height - inset - (placed.length - 1 - i) * actualGap);
  }
  return placed;
}
