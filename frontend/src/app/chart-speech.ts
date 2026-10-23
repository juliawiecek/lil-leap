import type { ChartPeriod } from './portfolio-history';

/**
 * Chart wording for people who hear the app instead of seeing it: period buttons say "1 month",
 * not "1M", and choosing a period says how the portfolio moved over it. Pure functions, so the
 * sentences are tested without a browser or a speech engine.
 */

/** What each period button is called aloud and by screen readers. */
export const PERIOD_NAMES: Record<ChartPeriod, string> = {
  '1D': '1 day',
  '1W': '1 week',
  '1M': '1 month',
  '3M': '3 months',
  '1Y': '1 year',
  ALL: 'All time',
};

/** Where each period starts, as said in "At the start of the day you had …". */
const PERIOD_START: Record<ChartPeriod, string> = {
  '1D': 'At the start of the day',
  '1W': 'A week ago',
  '1M': 'A month ago',
  '3M': 'Three months ago',
  '1Y': 'A year ago',
  ALL: 'When you opened your account',
};

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "up 1.25 percent", "down 0.04 percent" or "unchanged". Two decimals, since daily moves are small. */
export function spokenChange(percent: number): string {
  const size = Math.abs(percent);
  if (size < 0.005) {
    return 'unchanged';
  }
  return `${percent > 0 ? 'up' : 'down'} ${size.toFixed(2)} percent`;
}

export interface ChartSummaryInput {
  period: ChartPeriod;
  /** Value at the start of the period (or when money first arrived, if later). */
  start: number;
  /** Value now. */
  end: number;
  /** The period starts when the account was funded, not a full period back. */
  fromOpening: boolean;
  /** Balances are hidden: no amounts are said. */
  balanceHidden: boolean;
  /** Enough points to describe a change. */
  hasHistory: boolean;
}

/**
 * "1 month. A month ago you had $24,000.00. Now you have $25,450.09, up 6.04 percent."
 */
export function chartSummary(s: ChartSummaryInput): string {
  const name = PERIOD_NAMES[s.period];
  if (!s.hasHistory) {
    return `${name}. There is no history for this period yet.`;
  }
  const percent = s.start > 0 ? ((s.end - s.start) / s.start) * 100 : 0;
  if (s.balanceHidden) {
    return `${name}. Your balance is hidden, so amounts are not read out. Your portfolio is ${spokenChange(percent)}.`;
  }
  const opening = s.fromOpening ? 'When you first added money' : PERIOD_START[s.period];
  return `${name}. ${opening} you had ${DOLLARS.format(s.start)}. Now you have ${DOLLARS.format(s.end)}, ${spokenChange(percent)}.`;
}
