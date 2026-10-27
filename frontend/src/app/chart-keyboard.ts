import { spokenChange } from './chart-speech';
import { stockName } from './speech-text';
import type { PricePoint, TradeMarker } from './chart-sonification';

/**
 * Exploring a chart by keyboard (PS-26): which point each key moves to, and the sentence a
 * screen reader hears there ("Oct 14, $182.40, up 1.20 percent. You bought 2 shares of Apple
 * here at $180.00."). Every focusable chart uses these, so the wording is the same everywhere.
 * Pure functions, tested without a browser.
 */

/** A point the cursor can rest on: epoch milliseconds and its value. */
export interface SpokenPoint {
  at: number;
  value: number;
}

/** A fill the cursor can land on. `symbol` names the company when one chart holds many. */
export interface SpokenTrade {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  at: number;
  symbol?: string;
}

export interface PointWords {
  currency?: string;
  /** The zone the chart's own time labels use. */
  timeZone?: string;
  /** Balances are hidden: no amounts and no trades are said. */
  hidden?: boolean;
  /** Only the person's trades are private (the price itself is public): no trades are said. */
  tradesHidden?: boolean;
  /** The company the chart shows, said with its trades ("of Apple"). */
  company?: string;
  trades?: readonly SpokenTrade[];
  /** Anything else about the point, such as a candle's open, high and low. */
  detail?: string;
}

/** What D, T and Space do while a chart has focus. */
export type ChartCommand = 'summary' | 'table' | 'sound';

/** PageUp and PageDown move a tenth of the chart. */
const PAGE_SHARE = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;

/** How many points PageUp or PageDown moves: a tenth of them, at least one. */
export function pageSize(count: number): number {
  return Math.max(1, Math.round(count * PAGE_SHARE));
}

/**
 * The point a navigation key moves to among `count` points, from `index` (-1 when nothing is
 * selected yet, which starts at the latest). Left and Right step one; Home and End jump to the
 * ends; PageUp moves a tenth later and PageDown a tenth earlier, as on a slider. Null for any
 * other key.
 */
export function stepIndex(key: string, index: number, count: number): number | null {
  if (count < 1) {
    return null;
  }
  const last = count - 1;
  const from = index < 0 || index > last ? last : index;
  const page = pageSize(count);
  const targets: Record<string, number> = {
    ArrowLeft: from - 1,
    ArrowRight: from + 1,
    Home: 0,
    End: last,
    PageUp: from + page,
    PageDown: from - page,
  };
  return key in targets ? Math.max(0, Math.min(last, targets[key])) : null;
}

/**
 * D, T or Space pressed on a focused chart, with no Ctrl, Alt or Cmd held, so the app-wide
 * Alt + Shift shortcuts never reach a chart. A held-down key does not repeat.
 */
export function chartCommand(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'repeat'>): ChartCommand | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === 'd') {
    return 'summary';
  }
  if (key === 't') {
    return 'table';
  }
  return key === ' ' || event.code === 'Space' ? 'sound' : null;
}

function money(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/**
 * The date of `points[index]` as said aloud: "Oct 14" on charts over days, with the time when
 * the chart covers two days or less ("Oct 14, 2:05 PM"), the seconds when neighbouring points are
 * under a minute apart, and the year when it is not the latest point's year.
 */
export function pointDate(points: readonly SpokenPoint[], index: number, timeZone = 'America/New_York'): string {
  const point = points[index];
  const first = points[0].at,
    latest = points.at(-1)!.at;
  const neighbour = points[index - 1] ?? points[index + 1];
  const options: Intl.DateTimeFormatOptions = { timeZone, month: 'short', day: 'numeric' };
  if (latest - first <= 2 * DAY_MS) {
    Object.assign(options, { hour: 'numeric', minute: '2-digit' });
    if (neighbour && Math.abs(point.at - neighbour.at) < 60_000) {
      options.second = '2-digit';
    }
  }
  const year = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(at);
  if (year(point.at) !== year(latest)) {
    options.year = 'numeric';
  }
  return new Intl.DateTimeFormat('en-US', options).format(point.at);
}

/** "up 1.20 percent" from the point before; "first point" for the first. */
function changeFromPrevious(points: readonly SpokenPoint[], index: number, words: PointWords): string {
  if (index === 0) {
    return 'first point';
  }
  const before = points[index - 1].value,
    now = points[index].value;
  if (before === 0) {
    if (now === 0) {
      return 'unchanged';
    }
    const zero = words.hidden ? 'zero' : money(0, words.currency);
    return `${now > 0 ? 'up' : 'down'} from ${zero}`;
  }
  return spokenChange(((now - before) / Math.abs(before)) * 100);
}

/** The trades whose nearest point is `index`; trades outside the points' span are left out. */
export function tradesAt(points: readonly SpokenPoint[], index: number, trades: readonly SpokenTrade[]): SpokenTrade[] {
  if (!points.length) {
    return [];
  }
  const first = points[0].at,
    last = points.at(-1)!.at;
  return trades.filter((trade) => {
    if (!(trade.at >= first && trade.at <= last)) {
      return false;
    }
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].at - trade.at) < Math.abs(points[nearest].at - trade.at)) {
        nearest = i;
      }
    }
    return nearest === index;
  });
}

/**
 * "You bought 2 shares of Apple here at $180.00." One sentence per trade; nothing at all while
 * balances or trades are hidden, as the chart's summary and table leave them out then too.
 */
export function tradeWords(trades: readonly SpokenTrade[], words: PointWords = {}): string {
  if (words.hidden || words.tradesHidden) {
    return '';
  }
  return trades
    .map((trade) => {
      const company = (trade.symbol && (stockName(trade.symbol) ?? trade.symbol)) || words.company;
      const shares = `${trade.quantity} ${trade.quantity === 1 ? 'share' : 'shares'}`;
      const of = company ? ' of ' + company : '';
      return `You ${trade.side === 'SELL' ? 'sold' : 'bought'} ${shares}${of} here at ${money(trade.price, words.currency)}.`;
    })
    .join(' ');
}

/**
 * What is said when the cursor reaches `points[index]`: date, value and change from the point
 * before, then any trades made there. "Oct 14, $182.40, up 1.20 percent."
 */
export function pointAnnouncement(points: readonly SpokenPoint[], index: number, words: PointWords = {}): string {
  const point = points[index];
  if (!point) {
    return '';
  }
  const parts = [pointDate(points, index, words.timeZone)];
  if (!words.hidden) {
    parts.push(money(point.value, words.currency));
  }
  parts.push(changeFromPrevious(points, index, words));
  let text = parts.join(', ') + '.';
  if (index > 0 && index === points.length - 1) {
    text += ' Latest point.';
  }
  if (words.detail) {
    text += ` ${words.detail}`;
  }
  const trades = tradeWords(tradesAt(points, index, words.trades ?? []), words);
  return trades ? `${text} ${trades}` : text;
}

/** What Space plays: the points as a sweep, trades as clicks, the average cost as a hum. */
export interface ChartSound {
  points: readonly PricePoint[];
  markers: readonly TradeMarker[];
  averageCost: number | null;
}

/** The sound for a chart's shown points, its trades among them and, where known, its average cost. */
export function chartSound(points: readonly SpokenPoint[], trades: readonly SpokenTrade[] = [], averageCost: number | null = null): ChartSound {
  const first = points[0]?.at ?? 0,
    last = points.at(-1)?.at ?? 0;
  return {
    points: points.map((p) => ({ time: p.at, value: p.value })),
    markers: trades.filter((t) => t.at >= first && t.at <= last).map((t) => ({ time: t.at, side: t.side === 'SELL' ? 'sell' : 'buy' })),
    averageCost: averageCost !== null && Number.isFinite(averageCost) && averageCost > 0 ? averageCost : null,
  };
}

/** Whether live price updates are paused (PS-21's `livePrices` setting); not paused when unset. */
export function livePricesPaused(saved: unknown): boolean {
  return !!saved && typeof saved === 'object' && (saved as { paused?: unknown }).paused === true;
}
