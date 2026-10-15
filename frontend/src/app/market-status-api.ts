import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
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
  readonly #http: ApiHttpClient;
  readonly #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    http: ApiHttpClient,
    baseUrl = '/api/v1',
  ) {
    this.#tokens = tokens;
    this.#http = http;
    this.#baseUrl = baseUrl;
  }

  /** Loads the current status; throws an Error when it cannot be read. */
  async status(): Promise<MarketStatus> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to see the market status.');
    }
    try {
      return await firstValueFrom(this.#http.get<MarketStatus>(`${this.#baseUrl}/market/status`));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw new Error('Could not load the market status.');
      }
      throw error;
    }
  }
}
