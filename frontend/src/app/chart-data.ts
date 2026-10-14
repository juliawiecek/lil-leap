import type { OrderHistoryRow } from './order-history-api';

/** One candle as returned by GET /quotes/candles/{instrumentId}. */
export interface CandleRow {
  time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
}

/** Chart-ready candle; time is UTC seconds. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** One point of a line or area series; time is UTC seconds. */
export interface Point {
  time: number;
  value: number;
}

export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '1d';

/** How many candles of which width each period button asks for. */
export interface Timeframe {
  interval: CandleInterval;
  limit: number;
}

const INTERVAL_SECONDS: Record<CandleInterval, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };

/** Trading-day sized windows: a 6.5-hour session is 390 minutes or 26 fifteen-minute bars. */
export const TIMEFRAMES: Record<string, Timeframe> = {
  '1D': { interval: '1m', limit: 390 },
  '1W': { interval: '15m', limit: 130 },
  '1M': { interval: '1h', limit: 154 },
  '3M': { interval: '1d', limit: 63 },
  '6M': { interval: '1d', limit: 126 },
  '1Y': { interval: '1d', limit: 252 },
  '5Y': { interval: '1d', limit: 500 },
  ALL: { interval: '1d', limit: 500 },
};

/** The timeframe for a period button, falling back to one trading day. */
export function timeframeFor(period: string): Timeframe {
  return TIMEFRAMES[period] ?? TIMEFRAMES['1D'];
}

/** @returns the candle width in seconds */
export function intervalSeconds(interval: CandleInterval): number {
  return INTERVAL_SECONDS[interval];
}

function seconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

/** Converts API candles to numbers, oldest first, dropping malformed rows. */
export function toCandles(rows: readonly CandleRow[]): Candle[] {
  return rows
    .map((row) => ({
      time: seconds(row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }))
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

/** Close prices as a line. */
export function closes(candles: readonly Candle[]): Point[] {
  return candles.map((c) => ({ time: c.time, value: c.close }));
}

/** Change from the first open to the last close of the window, in dollars and percent. */
export function windowChange(candles: readonly Candle[]): { amount: number; percent: number } | null {
  if (candles.length === 0 || candles[0].open === 0) {
    return null;
  }
  const amount = candles[candles.length - 1].close - candles[0].open;
  return { amount, percent: (amount / candles[0].open) * 100 };
}

/** Exponential moving average, seeded with the simple average of the first `period` values. */
export function ema(points: readonly Point[], period: number): Point[] {
  if (points.length < period) {
    return [];
  }
  const k = 2 / (period + 1);
  let average = points.slice(0, period).reduce((sum, p) => sum + p.value, 0) / period;
  const result: Point[] = [{ time: points[period - 1].time, value: average }];
  for (const point of points.slice(period)) {
    average = point.value * k + average * (1 - k);
    result.push({ time: point.time, value: average });
  }
  return result;
}

/** Wilder's relative strength index (0-100). */
export function rsi(points: readonly Point[], period = 14): Point[] {
  if (points.length <= period) {
    return [];
  }
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = points[i].value - points[i - 1].value;
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  const result: Point[] = [{ time: points[period].time, value: value() }];
  for (let i = period + 1; i < points.length; i++) {
    const change = points[i].value - points[i - 1].value;
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    result.push({ time: points[i].time, value: value() });
  }
  return result;
}

/** A filled order, reduced to what the chart needs. */
export interface Fill {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time: number;
}

/** The caller's filled orders, oldest first. */
export function toFills(rows: readonly OrderHistoryRow[]): Fill[] {
  return rows
    .filter((r) => r.status === 'FILLED' && r.filledAt && r.fillPrice != null)
    .map((r) => ({
      symbol: r.symbol,
      side: (r.side.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as Fill['side'],
      quantity: Number(r.filledQuantity ?? r.quantity),
      price: Number(r.fillPrice),
      time: seconds(r.filledAt!),
    }))
    .sort((a, b) => a.time - b.time);
}

/** A buy or sell arrow on the bar where the fill happened. */
export interface FillMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  shape: 'arrowUp' | 'arrowDown';
  color: string;
  text: string;
}

export const BUY_COLOR = '#22c55e';
export const SELL_COLOR = '#ef4444';

/** Markers for one symbol's fills that fall inside the charted bars, snapped to their bar. */
export function fillMarkers(fills: readonly Fill[], symbol: string, candles: readonly Candle[], interval: CandleInterval): FillMarker[] {
  if (candles.length === 0) {
    return [];
  }
  const width = intervalSeconds(interval);
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  return fills
    .filter((f) => f.symbol === symbol)
    .map((f) => ({ fill: f, bar: Math.floor(f.time / width) * width }))
    .filter(({ bar }) => bar >= first && bar <= last)
    .map(({ fill, bar }) => ({
      time: bar,
      position: fill.side === 'BUY' ? 'belowBar' : 'aboveBar',
      shape: fill.side === 'BUY' ? 'arrowUp' : 'arrowDown',
      color: fill.side === 'BUY' ? BUY_COLOR : SELL_COLOR,
      text: `${fill.side === 'BUY' ? 'Buy' : 'Sell'} ${fill.quantity} @ ${fill.price.toFixed(2)}`,
    }));
}

/**
 * Portfolio value at the close of each bar: cash plus shares times that bar's price.
 * Holdings and cash at a past bar are today's figures with every later fill undone, so the
 * line reflects what the client actually held at the time.
 */
export function portfolioHistory(
  candlesBySymbol: ReadonlyMap<string, readonly Candle[]>,
  holdings: ReadonlyMap<string, number>,
  cash: number,
  fills: readonly Fill[],
  interval: CandleInterval,
): Point[] {
  const width = intervalSeconds(interval);
  const times = [...new Set([...candlesBySymbol.values()].flatMap((list) => list.map((c) => c.time)))].sort((a, b) => a - b);
  const symbols = new Set([...holdings.keys(), ...fills.map((f) => f.symbol)]);
  return times.map((time) => {
    const end = time + width;
    let cashAt = cash;
    const shares = new Map([...symbols].map((s) => [s, holdings.get(s) ?? 0]));
    for (const fill of fills) {
      if (fill.time >= end) {
        const signed = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
        shares.set(fill.symbol, (shares.get(fill.symbol) ?? 0) - signed);
        cashAt += signed * fill.price;
      }
    }
    let value = cashAt;
    for (const [symbol, quantity] of shares) {
      const price = priceAt(candlesBySymbol.get(symbol), time);
      if (quantity !== 0 && price != null) {
        value += quantity * price;
      }
    }
    return { time, value: Math.round(value * 100) / 100 };
  });
}

/** Close of the last bar at or before `time`, or the first bar's open before trading started. */
function priceAt(candles: readonly Candle[] | undefined, time: number): number | null {
  if (!candles || candles.length === 0) {
    return null;
  }
  let price: number | null = null;
  for (const candle of candles) {
    if (candle.time > time) {
      break;
    }
    price = candle.close;
  }
  return price ?? candles[0].open;
}
