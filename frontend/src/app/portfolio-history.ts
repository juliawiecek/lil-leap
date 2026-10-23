/**
 * The novice portfolio-value chart: what the account was worth at each moment of the chosen
 * period, rebuilt from its real history. Cash follows every deposit, transfer and fill as it
 * happened; each holding is valued at its stock's recorded price at that moment. A period never
 * reaches back before the account opened. Pure functions, so every period can be tested.
 */

import { numericValue, orderedPoints, type ChartCoverage } from './chart-data';
import type { Portfolio } from './portfolio-api';
import type { OrderHistoryRow } from './order-history-api';
import { APP_TIME_ZONE } from './app-time';
export const CHART_PERIODS = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PERIOD_MS: Record<Exclude<ChartPeriod, 'ALL'>, number> = {
  '1D': DAY, '1W': 7 * DAY, '1M': 30 * DAY, '3M': 90 * DAY, '1Y': 365 * DAY,
};
/** Price-bar widths the holdings service offers, narrowest first. */
const BAR_STEPS = [
  { interval: '1m', ms: MINUTE }, { interval: '5m', ms: 5 * MINUTE }, { interval: '15m', ms: 15 * MINUTE },
  { interval: '1h', ms: HOUR }, { interval: '1d', ms: DAY },
] as const;
/** Bars per chart we aim for: a whole trading session at one-minute bars, without more than the service returns. */
const TARGET_BARS = 400;
/** The exchange's regular session, in minutes after midnight exchange time: 9:30 to 16:00. */
const SESSION_OPEN = 9 * 60 + 30;
const SESSION_CLOSE = 16 * 60;
/** Most bars the service returns in one request. */
const MAX_BARS = 500;

/** The time span a period shows. */
export interface ChartRange {
  start: number;
  end: number;
  /** The period reaches back before the account opened, so it starts at the opening instead. */
  fromOpening: boolean;
  /**
   * 1D only: the trading session shown. The chart spans the whole session, so the line grows
   * across it through the day; without it, the closed hours between sessions take no room.
   */
  session?: Session;
}

/** A trading session's opening and closing instants. */
export interface Session {
  open: number;
  close: number;
}

/** A dated cash movement into (+) or out of (−) the account: deposits, transfers, fills. */
export interface CashEvent {
  at: number;
  amount: number;
}

/** A dated change in shares held: positive for a buy, negative for a sell, at its fill price. */
export interface ShareEvent {
  at: number;
  symbol: string;
  quantity: number;
  price: number;
}

/** One recorded price, oldest first per stock. */
export interface PricePoint {
  at: number;
  price: number;
}

export interface ValuePoint {
  at: number;
  value: number;
}

/**
 * Account-day values start at midnight Central time, including weekends and holidays.
 * Other ranges are rolling days, clamped to first funding. An explicitly supplied session
 * remains supported for consumers that chart a trading session rather than an account day.
 */
export function chartRange(period: ChartPeriod, now: number, openedAt: number | null, session: Session | null = null): ChartRange {
  const opened = openedAt !== null && Number.isFinite(openedAt) && openedAt <= now ? openedAt : null;
  // An explicit session opts into session boundaries instead of the default account day.
  const sessionEnd = session ? Math.min(now, session.close) : 0;
  if (period === '1D' && session && (opened === null || opened < sessionEnd)) {
    const start = opened !== null && opened > session.open ? opened : session.open;
    return { start, end: sessionEnd, fromOpening: start !== session.open, session };
  }
  if (period === 'ALL') {
    return { start: opened ?? now - DAY, end: now, fromOpening: opened !== null };
  }
  const start = period === '1D' ? zonedTime(zonedDate(now, APP_TIME_ZONE), 0, APP_TIME_ZONE) : now - PERIOD_MS[period];
  // No financial observations exist before the account opened.
  return opened !== null && opened > start ? { start: opened, end: now, fromOpening: true } : { start, end: now, fromOpening: false };
}

/** Coverage refers to the requested account range, not the width of the fitted SVG. */
export function historyCoverage(range: ChartRange | null, points: readonly ValuePoint[]): ChartCoverage {
  const first = points[0], last = points.at(-1);
  const requested = { requestedStart: range?.start ?? null, requestedEnd: range?.end ?? null };
  if (!first || !last) return { status: 'empty', start: null, end: null, ...requested };
  return { status: range && (first.at > range.start || last.at < range.end) ? 'partial' : 'complete',
    start: first.at, end: last.at, ...requested };
}

export const PORTFOLIO_PERIOD_LABELS: Record<ChartPeriod, string> = {
  '1D': 'Today', '1W': 'Past 7 days', '1M': 'Past 30 days', '3M': 'Past 90 days', '1Y': 'Past 365 days', ALL: 'Available history',
};

export function portfolioPeriodLabel(period: ChartPeriod, range: ChartRange | null, points: readonly ValuePoint[]): string {
  const coverage = historyCoverage(range, points);
  if (coverage.status === 'empty') return 'Change unavailable';
  if (coverage.status === 'partial') return 'Available history';
  return range?.fromOpening ? 'Since first record' : PORTFOLIO_PERIOD_LABELS[period];
}

/** Preserve a real zero opening value; the caller must not divide by that baseline. */
export function startValue(points: readonly ValuePoint[]): number {
  return points[0]?.value ?? 0;
}

/**
 * The latest trading session that has opened by `now`: today's if the exchange has opened today,
 * otherwise the last weekday's. Weekdays 9:30 to 16:00 in the exchange's time zone; holidays are
 * not known here, so a holiday shows as a flat session.
 */
export function tradingSession(now: number, timeZone = 'America/New_York'): Session {
  for (let back = 0; back < 8; back++) {
    const day = zonedDate(now - back * DAY, timeZone);
    if (day.weekday === 'Sat' || day.weekday === 'Sun') {
      continue;
    }
    const open = zonedTime(day, SESSION_OPEN, timeZone);
    if (open <= now) {
      return { open, close: zonedTime(day, SESSION_CLOSE, timeZone) };
    }
  }
  return { open: now - DAY, close: now };
}

/** The calendar date and weekday of an instant in a time zone. */
function zonedDate(at: number, timeZone: string): { year: number; month: number; day: number; weekday: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { year: Number(parts['year']), month: Number(parts['month']), day: Number(parts['day']), weekday: parts['weekday'] };
}

/** The instant a wall-clock time (minutes after midnight) falls on a date in a time zone. */
function zonedTime(date: { year: number; month: number; day: number }, minutes: number, timeZone: string): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  let at = wall - zoneOffset(wall, timeZone);
  // Across a daylight-saving change the offset at the answer can differ from the first guess's.
  at = wall - zoneOffset(at, timeZone);
  return at;
}

/** How far a time zone's wall clock is ahead of UTC at an instant, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second']));
  return wall - Math.floor(at / 1000) * 1000;
}

/** The narrowest bar width that covers the span in about 400 bars, how many bars to ask for, and the width in ms. */
export function barStep(range: ChartRange): { interval: string; limit: number; ms: number } {
  const span = Math.max(range.end - range.start, MINUTE);
  const step = BAR_STEPS.find((s) => span / s.ms <= TARGET_BARS) ?? BAR_STEPS.at(-1)!;
  return { interval: step.interval, limit: Math.min(MAX_BARS, Math.ceil(span / step.ms) + 1), ms: step.ms };
}

/**
 * The account's value at every recorded moment in the range: the range's start and end, each
 * price bar and each deposit, transfer or fill inside it. Activity before the range still counts
 * (it set the starting cash and shares). A stock is valued only at its last recorded price.
 * Missing prices limit the line to its continuously supported suffix. `liveValue`, when given,
 * is an observed snapshot, never an interpolated or estimated value.
 */
export function portfolioSeries(
  range: ChartRange,
  cash: readonly CashEvent[],
  shares: readonly ShareEvent[],
  prices: ReadonlyMap<string, readonly PricePoint[]>,
  liveValue: number | null = null,
): ValuePoint[] {
  const inside = (at: number) => at >= range.start && at <= range.end;
  const times = new Set<number>([range.start, range.end]);
  for (const series of prices.values()) {
    series.filter((p) => inside(p.at)).forEach((p) => times.add(p.at));
  }
  // A moment before each deposit, transfer or fill too, so the line steps at it instead of sloping from the previous point.
  [...cash, ...shares].filter((e) => inside(e.at)).forEach((e) => {
    times.add(e.at);
    if (e.at - 1 > range.start) {
      times.add(e.at - 1);
    }
  });
  const sortedCash = [...cash].sort((a, b) => a.at - b.at);
  const sortedShares = [...shares].sort((a, b) => a.at - b.at);
  const recorded = new Map([...prices].map(([symbol, ps]) => [symbol,
    orderedPoints(ps.filter(p => Number.isFinite(p.price) && p.price > 0).map(p => ({ time: p.at, value: p.price })))
      .map(p => ({ at: p.time, price: p.value }))]));
  const points: ValuePoint[] = [];
  for (const at of [...times].sort((a, b) => a - b)) {
    const value = valueAt(at, sortedCash, sortedShares, recorded);
    // Keep only the continuous supported suffix. Connecting across an unknown valuation
    // would imply performance that cannot be established from the observations.
    if (value === null) points.length = 0;
    else points.push({ at, value });
  }
  if (liveValue !== null && Number.isFinite(liveValue)) {
    if (points.at(-1)?.at === range.end) points.pop();
    points.push({ at: range.end, value: liveValue });
  }
  return points;
}

function valueAt(at: number, cash: readonly CashEvent[], shares: readonly ShareEvent[], prices: ReadonlyMap<string, readonly PricePoint[]>): number | null {
  let total = cash.filter((e) => e.at <= at).reduce((sum, e) => sum + e.amount, 0);
  const held = new Map<string, number>();
  for (const e of shares) {
    if (e.at > at) {
      break;
    }
    held.set(e.symbol, (held.get(e.symbol) ?? 0) + e.quantity);
  }
  for (const [symbol, quantity] of held) {
    if (quantity) {
      const series = prices.get(symbol) ?? [];
      const price = priceAt(series, at);
      if (price === null || quantity < -1e-8) return null;
      total += quantity * price;
    }
  }
  return total;
}

/** Map each executed transaction once; unsettled cash and open orders do not change value. */
export function portfolioEvents(movements: readonly { transactionId?: string; occurredAt: string; amount: unknown; settlementStatus?: string }[], orders: readonly OrderHistoryRow[]): { cash: CashEvent[]; shares: ShareEvent[] } {
  const shares: ShareEvent[] = [];
  const cash: CashEvent[] = [];
  const seen = new Set<string>();
  for (const row of orders) {
    if (row.status !== 'FILLED' || seen.has(row.orderId)) continue;
    seen.add(row.orderId);
    const at = Date.parse(row.filledAt ?? ''), price = numericValue(row.fillPrice), quantity = numericValue(row.filledQuantity);
    if (!Number.isFinite(at) || price === null || price <= 0 || quantity === null || quantity <= 0 || !['BUY', 'SELL'].includes(row.side) || !row.symbol) {
      throw new Error('Executed transaction details are incomplete.');
    }
    const signed = row.side === 'SELL' ? -quantity : quantity;
    shares.push({ at, symbol: row.symbol, price, quantity: signed });
    // Orders settle each fill in whole cents (price x quantity, half up), and the cash balance is
    // the sum of those settled amounts. Unrounded sub-cent fill prices drift a cent or two from it
    // after a handful of trades and made ledgerMatches reject every demo account's history.
    const settled = Math.round((quantity * price + Number.EPSILON) * 100) / 100;
    cash.push({ at, amount: signed < 0 ? settled : -settled });
  }
  seen.clear();
  for (const row of movements) {
    if (row.settlementStatus && row.settlementStatus !== 'SETTLED') continue;
    if (row.transactionId && seen.has(row.transactionId)) continue;
    if (row.transactionId) seen.add(row.transactionId);
    const at = Date.parse(row.occurredAt), amount = numericValue(row.amount);
    if (!Number.isFinite(at) || amount === null) throw new Error('Cash history is incomplete.');
    cash.push({ at, amount });
  }
  return { cash, shares };
}

/** A capped/imported ledger must agree with the current snapshot before claiming history. */
export function ledgerMatches(snapshot: Portfolio, cash: readonly CashEvent[], shares: readonly ShareEvent[]): boolean {
  if (!cash.every(e => Number.isFinite(e.at) && Number.isFinite(e.amount)) ||
      !shares.every(e => Number.isFinite(e.at) && Number.isFinite(e.quantity) && Number.isFinite(e.price) && e.price > 0 && !!e.symbol) ||
      !snapshot.holdings.every(h => !!h.symbol && Number.isFinite(h.quantity) && h.quantity > 0)) return false;
  if (Math.abs(snapshot.cash - cash.reduce((sum, e) => sum + e.amount, 0)) > .011) return false;
  const quantities = new Map<string, number>();
  for (const e of shares) quantities.set(e.symbol, (quantities.get(e.symbol) ?? 0) + e.quantity);
  for (const h of snapshot.holdings) quantities.set(h.symbol, (quantities.get(h.symbol) ?? 0) - h.quantity);
  return Number.isFinite(snapshot.cash) && [...quantities.values()].every(q => Number.isFinite(q) && Math.abs(q) < 1e-8);
}

/** The last recorded price at or before the moment, if any. */
export function priceAt(series: readonly PricePoint[], at: number): number | null {
  let found: number | null = null;
  for (const point of series) {
    if (point.at > at) {
      break;
    }
    found = point.price;
  }
  return found;
}

/**
 * Reduce display density using real observations, retaining first/last and each time bucket's
 * opening, closing, lowest and highest values. Never attach an average to an observation's time.
 * Inputs are normalized chronologically by the chart; calculations retain the full source.
 */
export function plotSeries(points: readonly ValuePoint[], limit: number): ValuePoint[] {
  if (!Number.isFinite(limit) || limit < 2 || points.length <= limit) return [...points];
  const count = Math.floor(limit);
  if (count < 6) return [points[0], points[points.length - 1]];
  const buckets = Math.max(1, Math.floor((count - 2) / 4));
  const first = points[0], last = points[points.length - 1];
  const span = Math.max(1, last.at - first.at);
  const grouped = new Map<number, ValuePoint[]>();
  for (const point of points.slice(1, -1)) {
    const key = Math.min(buckets - 1, Math.floor((point.at - first.at) / span * buckets));
    const group = grouped.get(key) ?? [];
    group.push(point);
    grouped.set(key, group);
  }
  const output: ValuePoint[] = [points[0]];
  for (const group of grouped.values()) {
    const low = group.reduce((a, b) => b.value < a.value ? b : a);
    const high = group.reduce((a, b) => b.value > a.value ? b : a);
    output.push(...[...new Set([group[0], low, high, group[group.length - 1]])].sort((a, b) => a.at - b.at));
  }
  output.push(last);
  return output;
}

/** A quiet period uses a wider scale without changing any observed values. */
export function valueScale(values: readonly number[]): { low: number; high: number } {
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  // A flat line still gets a visible band around it: a hundredth of a percent of its value, at least a cent.
  const pad = Math.max((max - min) * 0.12, Math.abs(max) * 0.0001, 0.01);
  let low = min - pad;
  let high = max + pad;
  // Fitting the axis to the values alone magnifies a quiet period: a portfolio that moved a
  // quarter of a percent would fill the chart, so ordinary price noise reads as a dramatic line.
  // Half a percent of the account's value is the narrowest band worth drawing; above that the
  // scale still fits the values, so real moves keep their shape.
  const minSpan = Math.max(Math.abs(max) * 0.005, 0.02);
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  return { low, high };
}
