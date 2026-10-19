/**
 * The client's own trades on the price chart (PS-13): one marker per fill at its time and price,
 * and their average cost as a horizontal line. Built from order history; no new data.
 */
import type { OrderHistoryRow } from './order-history-api';

export interface TradeMark {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  /** Fill time, ms since epoch. */
  at: number;
  /** Tooltip, e.g. "Bought 10 @ $227.40 · 14 Oct 15:02". */
  label: string;
}

export interface PlottedMark extends TradeMark {
  x: number;
  y: number;
}

export interface ChartWindow {
  start: number;
  end: number;
}

export interface PriceRange {
  low: number;
  high: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };
/** Room above and below the plotted prices, as a share of the price. */
const PRICE_PADDING = 0.02;
const LABEL_COUNT = 7;
const LABEL_FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  '1D': { hour: '2-digit', minute: '2-digit' },
  '1W': { weekday: 'short' },
};

/** Filled orders for one stock, oldest first, as chart markers. */
export function tradeMarks(rows: readonly OrderHistoryRow[], symbol: string, locale?: string): TradeMark[] {
  const when = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  return rows
    .filter((row) => row.symbol === symbol && row.status === 'FILLED' && row.fillPrice !== null && row.filledAt)
    .map((row) => {
      const side = row.side === 'SELL' ? 'SELL' : 'BUY';
      const quantity = Number(row.filledQuantity ?? row.quantity);
      const price = Number(row.fillPrice);
      const at = Date.parse(row.filledAt as string);
      const verb = side === 'BUY' ? 'Bought' : 'Sold';
      return { side, quantity, price, at, label: `${verb} ${quantity} @ ${money.format(price)} · ${when.format(at)}` } as TradeMark;
    })
    .filter((mark) => Number.isFinite(mark.at) && mark.price > 0)
    .sort((a, b) => a.at - b.at);
}

/** The time span a chart period shows, ending now; "ALL" starts at the first trade (or a month back). */
export function periodWindow(period: string, now: number, marks: readonly TradeMark[] = []): ChartWindow {
  const days = PERIOD_DAYS[period];
  if (days) {
    return { start: now - days * DAY_MS, end: now };
  }
  const first = marks[0]?.at ?? now - PERIOD_DAYS['1M'] * DAY_MS;
  return { start: Math.min(first, now - DAY_MS), end: now };
}

/** A price range covering every value with a little padding; null when there is nothing to show. */
export function priceRange(values: readonly number[]): PriceRange | null {
  const prices = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!prices.length) {
    return null;
  }
  return { low: Math.min(...prices) * (1 - PRICE_PADDING), high: Math.max(...prices) * (1 + PRICE_PADDING) };
}

/** Vertical position of a price in a chart of the given height (top is high). */
export function priceY(price: number, range: PriceRange, height: number): number {
  return ((range.high - price) / (range.high - range.low)) * height;
}

/** Markers inside the window, placed on a width × height chart. */
export function plotMarks(
  marks: readonly TradeMark[],
  window: ChartWindow,
  range: PriceRange,
  width: number,
  height: number,
): PlottedMark[] {
  const span = window.end - window.start;
  return marks
    .filter((mark) => mark.at >= window.start && mark.at <= window.end)
    .map((mark) => ({ ...mark, x: ((mark.at - window.start) / span) * width, y: priceY(mark.price, range, height) }));
}

/**
 * The recorded prices inside the window as one SVG line on a width × height chart (PS-06);
 * empty when fewer than two prices fall inside it.
 */
export function pricePath(
  points: readonly { at: number; price: number }[],
  window: ChartWindow,
  range: PriceRange,
  width: number,
  height: number,
): string {
  const span = window.end - window.start;
  const inside = points.filter((p) => p.at >= window.start && p.at <= window.end);
  if (inside.length < 2 || span <= 0) {
    return '';
  }
  return inside
    .map((p, i) => `${i ? 'L' : 'M'}${(((p.at - window.start) / span) * width).toFixed(1)},${priceY(p.price, range, height).toFixed(1)}`)
    .join(' ');
}

/** Evenly spaced time labels across the window, formatted for the period. */
export function timeLabels(period: string, window: ChartWindow, locale?: string): string[] {
  const format = new Intl.DateTimeFormat(locale, LABEL_FORMATS[period] ?? { day: 'numeric', month: 'short' });
  const step = (window.end - window.start) / (LABEL_COUNT - 1);
  return Array.from({ length: LABEL_COUNT }, (_, i) => format.format(window.start + step * i));
}

/** Five evenly spaced price labels from high to low. */
export function priceLabels(range: PriceRange): number[] {
  const step = (range.high - range.low) / 4;
  return [0, 1, 2, 3, 4].map((i) => Math.round((range.high - step * i) * 100) / 100);
}
