import type { AccessTokenSource } from './order-history-api';

/** GET /market/status: instants are UTC ISO strings. */
export interface MarketStatus {
  open: boolean;
  exchangeTimeZone: string;
  nextOpen: string;
  nextClose: string;
}

/** How often the dashboards re-read the market status. */
export const MARKET_STATUS_REFRESH_MS = 60000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2h 14m", "45m" or "under 1m" until a future instant. */
export function countdown(until: Date, now: Date): string {
  const minutes = Math.floor((until.getTime() - now.getTime()) / 60000);
  if (minutes < 1) {
    return 'under 1m';
  }
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * Header text for the market status in the user's local time, e.g. "Market closes in 2h 14m",
 * "Market opens in 3h 5m" or "Market closed · Opens Mon 2:30 PM" when the open is a day or more away.
 */
export function marketStatusText(status: MarketStatus | null, now: Date, locale?: string): string {
  if (!status) {
    return 'Market status unavailable';
  }
  if (status.open) {
    return `Market closes in ${countdown(new Date(status.nextClose), now)}`;
  }
  const opens = new Date(status.nextOpen);
  if (opens.getTime() - now.getTime() < DAY_MS) {
    return `Market opens in ${countdown(opens, now)}`;
  }
  const when = new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(opens);
  return `Market closed · Opens ${when}`;
}

/** Client for the exchange's open/closed status. */
export class MarketStatusClient {
  readonly #tokens: AccessTokenSource;
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/api/v1',
  ) {
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /** Loads the current status; throws an Error when it cannot be read. */
  async status(): Promise<MarketStatus> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to see the market status.');
    }
    const response = await this.#fetch(`${this.#baseUrl}/market/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      this.#tokens.unauthorized?.(token);
    }
    if (!response.ok) {
      throw new Error('Could not load the market status.');
    }
    return (await response.json()) as MarketStatus;
  }
}

/** "14:30" today, or "Mon 14:30" on another day, in the user's time zone. */
export function localOpeningTime(instant: string, now: Date, locale?: string): string {
  const when = new Date(instant);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(when);
  if (when.toDateString() === now.toDateString()) {
    return time;
  }
  return `${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(when)} ${time}`;
}

/** Header badge (PS-02): "Open · Closes 21:00" or "Closed · Opens 14:30", in the user's local time. */
export function marketBadgeText(status: MarketStatus | null, now: Date, locale?: string): string {
  if (!status) {
    return 'Market status unavailable';
  }
  return status.open
    ? `Open · Closes ${localOpeningTime(status.nextClose, now, locale)}`
    : `Closed · Opens ${localOpeningTime(status.nextOpen, now, locale)}`;
}

/** Order-ticket warning while the market is closed (PS-02); empty while it is open or unknown. */
export function closedMarketWarning(status: MarketStatus | null, now: Date, locale?: string): string {
  if (!status || status.open) {
    return '';
  }
  return `The market is closed. Your order will fill when it opens at ${localOpeningTime(status.nextOpen, now, locale)}.`;
}
