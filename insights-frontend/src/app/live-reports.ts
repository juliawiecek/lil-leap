import { InjectionToken } from '@angular/core';

/** Today's totals for the current day, midnight to midnight US Central time (America/Chicago). */
export interface ReportSummary {
  /** The trading day, yyyy-mm-dd. */
  date: string;
  time_zone: string;
  /** Accounts that placed at least one order today. */
  accounts: number;
  /** Orders submitted today. */
  orders: number;
  /** Fills executed today. */
  fills: number;
  gross_executed_value: number | string;
}
/** A stock and how many times it traded today (New York trading day). */
export interface TopInstrument {
  instrument: string;
  tradeCount: number;
}
/** Trades in one New York hour of today, labelled "HH:00". */
export interface ActivityPoint {
  hour: string;
  tradeCount: number;
}
/** One order placed today, at the exact second it was placed. */
export interface PlacedOrder {
  /** When the order was submitted, as an ISO instant. */
  placedAt: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  /** Value of its fills so far; zero when nothing has filled. */
  filledValue: number | string;
}
/** Today's orders, oldest first, with the instant the Central day began. */
export interface OrdersToday {
  date: string;
  dayStart: string;
  orders: PlacedOrder[];
}
export interface LiveReports {
  load(): Promise<ReportSummary>;
  topInstruments(): Promise<TopInstrument[]>;
  activityTrend(): Promise<ActivityPoint[]>;
  ordersToday(): Promise<OrdersToday>;
}
export const LIVE_REPORTS = new InjectionToken<LiveReports>('Live reporting API');

/** CSV reports the insights service generates from its trade dataset. */
export type ReportKind =
  | 'instrument-report'
  | 'client-segment-report'
  | 'trading-activity-report'
  | 'buy-sell-balance-report';
export interface ReportFile {
  filename: string;
  csv: string;
}
/** Inclusive New York trading days, formatted yyyy-mm-dd. Both are required by the API. */
export interface ReportRange {
  startDate: string;
  endDate: string;
}
export interface ReportFiles {
  generate(kind: ReportKind, range: ReportRange): Promise<ReportFile>;
}
export const REPORT_FILES = new InjectionToken<ReportFiles>('CSV report generation API');

/** Longest range the reporting API accepts, in days (inclusive). */
export const MAX_REPORT_DAYS = 366;
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CENTRAL_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Central calendar date `daysBack` days before `now`, as yyyy-mm-dd, matching the API's days. */
export function centralIsoDate(now: Date = new Date(), daysBack = 0): string {
  const part = (type: string) => CENTRAL_DAY.formatToParts(now).find((p) => p.type === type)?.value;
  const today = Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  return new Date(today - daysBack * DAY_MS).toISOString().slice(0, 10);
}

function parseIsoDate(value: string): number | null {
  if (!ISO_DATE.test(value)) {
    return null;
  }
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value ? null : time;
}

/** Why a report range would be rejected, or '' when it can be requested. Mirrors the API rules. */
export function reportRangeError(startDate: string, endDate: string): string {
  if (!startDate || !endDate) {
    return 'Select both a start date and an end date to generate a report.';
  }
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (start === null || end === null) {
    return 'Enter valid start and end dates.';
  }
  if (start > end) {
    return 'The start date must be on or before the end date.';
  }
  if ((end - start) / DAY_MS + 1 > MAX_REPORT_DAYS) {
    return `Reports can cover at most ${MAX_REPORT_DAYS} days.`;
  }
  return '';
}

/** Fixed, caller-safe message for a failed report request; never echoes server or exception text. */
export function reportFailureMessage(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  switch (status) {
    case 400:
      return 'The report service rejected the selected dates. Check the range and try again.';
    case 401:
      return 'Your session has expired. Sign in again to generate reports.';
    case 403:
      return 'Your account is not permitted to generate reports.';
    default:
      return 'The report could not be generated. Please try again.';
  }
}

/** Reads the server-chosen filename from a Content-Disposition header. */
export function attachmentFilename(disposition: string | null, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1] ?? fallback;
}
