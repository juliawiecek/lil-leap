/**
 * The novice portfolio-value chart: what the account was worth at each moment of the chosen
 * period, rebuilt from its real history. Cash follows every deposit, transfer and fill as it
 * happened; each holding is valued at its stock's recorded price at that moment. A period never
 * reaches back before the account opened. Pure functions, so every period can be tested.
 */

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
/** Bars per chart we aim for: enough detail without hundreds of requests' worth of data. */
const TARGET_BARS = 300;
/** Most bars the service returns in one request. */
const MAX_BARS = 500;

/** The time span a period shows. */
export interface ChartRange {
  start: number;
  end: number;
  /** The period reaches back before the account opened, so it starts at the opening instead. */
  fromOpening: boolean;
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
 * The span a period covers, ending now. It starts no earlier than the account's opening, and
 * "ALL" starts exactly there; with no opening time known it falls back to the period alone.
 */
export function chartRange(period: ChartPeriod, now: number, openedAt: number | null): ChartRange {
  const opened = openedAt !== null && Number.isFinite(openedAt) && openedAt < now ? openedAt : null;
  if (period === 'ALL') {
    return { start: opened ?? now - DAY, end: now, fromOpening: opened !== null };
  }
  const start = now - PERIOD_MS[period];
  return opened !== null && opened > start ? { start: opened, end: now, fromOpening: true } : { start, end: now, fromOpening: false };
}

/** The narrowest bar width that covers the span in about 300 bars, and how many bars to ask for. */
export function barStep(range: ChartRange): { interval: string; limit: number } {
  const span = Math.max(range.end - range.start, MINUTE);
  const step = BAR_STEPS.find((s) => span / s.ms <= TARGET_BARS) ?? BAR_STEPS.at(-1)!;
  return { interval: step.interval, limit: Math.min(MAX_BARS, Math.ceil(span / step.ms) + 1) };
}

/**
 * The account's value at every recorded moment in the range: the range's start and end, each
 * price bar and each deposit, transfer or fill inside it. Activity before the range still counts
 * (it set the starting cash and shares). A stock is valued at its last recorded price, else the
 * nearest one after, else its last fill price. `liveValue`, when given, ends the line.
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
  [...cash, ...shares].filter((e) => inside(e.at)).forEach((e) => times.add(e.at));
  const sortedCash = [...cash].sort((a, b) => a.at - b.at);
  const sortedShares = [...shares].sort((a, b) => a.at - b.at);
  const points = [...times].sort((a, b) => a - b).map((at) => ({ at, value: valueAt(at, sortedCash, sortedShares, prices) }));
  if (liveValue !== null && Number.isFinite(liveValue)) {
    points[points.length - 1] = { at: range.end, value: round(liveValue) };
  }
  return points;
}

function valueAt(at: number, cash: readonly CashEvent[], shares: readonly ShareEvent[], prices: ReadonlyMap<string, readonly PricePoint[]>): number {
  let total = cash.filter((e) => e.at <= at).reduce((sum, e) => sum + e.amount, 0);
  const held = new Map<string, { quantity: number; lastFill: number }>();
  for (const e of shares) {
    if (e.at > at) {
      break;
    }
    const current = held.get(e.symbol) ?? { quantity: 0, lastFill: e.price };
    held.set(e.symbol, { quantity: current.quantity + e.quantity, lastFill: e.price });
  }
  for (const [symbol, { quantity, lastFill }] of held) {
    if (quantity) {
      const series = prices.get(symbol) ?? [];
      // At the very start of a range the first bar may not have closed yet; its price is the nearest record.
      total += quantity * (priceAt(series, at) ?? series.find((p) => p.at >= at)?.price ?? lastFill);
    }
  }
  return round(total);
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
