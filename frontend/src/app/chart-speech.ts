import type { ChartPeriod } from './portfolio-history';

/**
 * Chart wording for people who hear the app instead of seeing it: period buttons say "1 month",
 * not "1M", and choosing a period says how the portfolio moved over it. Pure functions, so the
 * sentences are tested without a browser or a speech engine.
 */

/** What each period button is called aloud and by screen readers. */
export const PERIOD_NAMES: Record<ChartPeriod, string> = {
  '1D': 'Today, Central time',
  '1W': 'Last 7 days',
  '1M': 'Last 30 days',
  '3M': 'Last 90 days',
  '1Y': 'Last 365 days',
  ALL: 'All available recorded history',
};

/** Where each period starts, as said in "At the start of the day you had …". */
const PERIOD_START: Record<ChartPeriod, string> = {
  '1D': 'At the start of the day',
  '1W': 'A week ago',
  '1M': '30 days ago',
  '3M': '90 days ago',
  '1Y': '365 days ago',
  ALL: 'At the first recorded value',
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
  partial?: boolean;
}

/**
 * "1 month. A month ago you had $24,000.00. Now you have $25,450.09, up 6.04 percent."
 */
export function chartSummary(s: ChartSummaryInput): string {
  const name = PERIOD_NAMES[s.period];
  if (!s.hasHistory) {
    return `${name}. There is no history for this period yet.`;
  }
  const percent = s.start > 0 ? ((s.end - s.start) / s.start) * 100 : null;
  if (s.balanceHidden) {
    return `${name}. Your balance is hidden, so amounts are not read out. ${percent === null ? 'Percentage change is unavailable for this range.' : 'Your portfolio is ' + spokenChange(percent) + '.'}${s.partial ? ' Only part of the requested period has recorded values.' : ''}`;
  }
  const opening = s.partial || s.fromOpening ? 'At the first available recorded value' : PERIOD_START[s.period];
  return `${name}. ${opening} you had ${DOLLARS.format(s.start)}. Now you have ${DOLLARS.format(s.end)}, ${percent === null ? 'percentage change unavailable because the starting value is zero' : spokenChange(percent)}.${s.partial ? ' Earlier history for the requested period is unavailable.' : ''} Account value includes deposits and transfers.`;
}
