import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
import type { AccessTokenSource } from './order-history-api';
import { centralDay, centralTime } from './app-time';

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
 * Header text for the market status, e.g. "Market closes in 2h 14m", "Market opens in 3h 5m" or
 * "Market closed · Opens Mon 8:30 AM CT" (Central time) when the open is a day or more away.
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
  const when = centralTime(opens, { weekday: 'short', hour: 'numeric', minute: '2-digit' }, locale);
  return `Market closed · Opens ${when} CT`;
}

/**
 * The header text with the state spelled out, so the status never rests on the coloured dot alone
 * (PS-28). "Market closed · Opens Mon 8:30 AM CT" already names the state, so it is left alone
 * rather than becoming "Closed · Market closed · …".
 */
export function marketStatusLabel(status: MarketStatus | null, now: Date, locale?: string): string {
  const detail = marketStatusText(status, now, locale);
  if (!status) {
    return detail;
  }
  const word = status.open ? 'Open' : 'Closed';
  return detail.toLowerCase().includes(word.toLowerCase()) ? detail : `${word} · ${detail}`;
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

/** "8:30 AM CT" today, or "Mon 8:30 AM CT" on another day, in Central time. */
export function localOpeningTime(instant: string, now: Date, locale?: string): string {
  const when = new Date(instant);
  const time = `${centralTime(when, { hour: 'numeric', minute: '2-digit' }, locale)} CT`;
  if (centralDay(when) === centralDay(now)) {
    return time;
  }
  return `${centralTime(when, { weekday: 'short' }, locale)} ${time}`;
}

/** Header badge (PS-02): "Open · Closes 3:00 PM CT" or "Closed · Opens Mon 8:30 AM CT", in Central time. */
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
