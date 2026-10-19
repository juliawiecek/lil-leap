/**
 * Live prices for every tradable stock (TS-14.7): the instrument list, each stock's latest quote,
 * and its first quote of the day. All reads go to the Holdings service with the user's token.
 */
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
import type { AccessTokenSource } from './order-history-api';

/** A quote older than this is shown as "Price delayed", matching the orders service's freshness rule. */
export const QUOTE_STALE_MS = 60000;
/** Width of each price-bar interval the holdings service offers. */
const BAR_MS: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
/** Rows of history read to find the day's first quote; the server caps history at 1000. */
const HISTORY_ROWS = 1000;

export interface ListedInstrument {
  instrumentId: string;
  symbol: string;
  name: string;
  sector: string;
}

/** One stock's latest price as the dashboards show it. */
export interface LiveQuote extends ListedInstrument {
  /** Midpoint of the latest bid and ask; 0 until the first quote arrives. */
  price: number;
  bid: number;
  ask: number;
  /** Percent change against the day's first quote; 0 when unknown. */
  change: number;
  /** When the latest quote was taken, ISO-8601; empty until the first quote arrives. */
  quotedAt: string;
  /** Which way the price moved on the last refresh, for the green/red flash. */
  direction: 'up' | 'down' | null;
  /** Increments whenever the price moves, so the view can restart the flash. */
  version: number;
}

/** Whether a quote is too old to trade on. A missing timestamp counts as delayed. */
export function isDelayed(quotedAt: string, now: number): boolean {
  const taken = Date.parse(quotedAt);
  return Number.isNaN(taken) || now - taken > QUOTE_STALE_MS;
}

/** Percent change from the day's first price, rounded to 2 decimals; 0 without a usable open. */
export function changeFrom(open: number | undefined, price: number): number {
  if (!open || !price) {
    return 0;
  }
  return Math.round(((price - open) / open) * 10000) / 100;
}

/** A listed stock before any quote has arrived. */
export function unpriced(instrument: ListedInstrument): LiveQuote {
  return { ...instrument, price: 0, bid: 0, ask: 0, change: 0, quotedAt: '', direction: null, version: 0 };
}

interface QuoteRow {
  bid: number | string;
  ask: number | string;
  midpoint: number | string;
  quotedAt: string;
}

/** One price at a moment, in epoch milliseconds. */
export interface PricePoint {
  at: number;
  price: number;
}

export interface PriceTick {
  price: number;
  bid: number;
  ask: number;
  quotedAt: string;
}

export class MarketFeedClient {
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

  /** Whether a user is signed in; the feed stops polling once this turns false. */
  get signedIn(): boolean {
    return !!this.#tokens.accessToken;
  }

  /** Tradable, enabled stocks from the seeded catalogue, in symbol order. */
  async instruments(): Promise<ListedInstrument[]> {
    const rows = await this.#get<
      { instrumentId: string; symbol: string; instrumentName: string; sector: string; enabled: boolean; tradable: boolean }[]
    >('/instruments');
    return rows
      .filter((row) => row.enabled && row.tradable)
      .map((row) => ({ instrumentId: row.instrumentId, symbol: row.symbol, name: row.instrumentName, sector: row.sector }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  /** The stock's latest quote. */
  async latest(instrumentId: string): Promise<PriceTick> {
    return tick(await this.#get<QuoteRow>(`/quotes/latest/by-instrument/${encodeURIComponent(instrumentId)}`));
  }

  /** Latest quote of each listed stock in one request (PS-10); stocks with no quote yet are absent. */
  async latestMany(instrumentIds: readonly string[]): Promise<Map<string, PriceTick>> {
    if (!instrumentIds.length) {
      return new Map();
    }
    const rows = await this.#get<(QuoteRow & { instrumentId: string })[]>(
      `/quotes/latest/by-instruments?ids=${instrumentIds.map(encodeURIComponent).join(',')}`,
    );
    return new Map(rows.map((row) => [row.instrumentId, tick(row)]));
  }

  /**
   * One stock's closing price per bar over the last `limit` bars of `interval` (1m, 5m, 15m, 1h,
   * 1d), oldest first, for the portfolio-value chart. A bar is dated by when it ends.
   */
  async closes(instrumentId: string, interval: string, limit: number, now = Date.now()): Promise<PricePoint[]> {
    const rows = await this.#get<{ time: string; close: number | string }[]>(
      `/quotes/candles/${encodeURIComponent(instrumentId)}?interval=${encodeURIComponent(interval)}&limit=${limit}`,
    );
    const width = BAR_MS[interval] ?? 0;
    return rows
      // The service dates a bar by its start; its close was taken at its end (or now, for the open bar).
      .map((row) => ({ at: Math.min(Date.parse(row.time) + width, now), price: Number(row.close) }))
      .filter((point) => Number.isFinite(point.at) && point.price > 0)
      .sort((a, b) => a.at - b.at);
  }

  /** Recent quotes of one stock, oldest first, for the price chart (PS-06). */
  async history(instrumentId: string, limit = HISTORY_ROWS): Promise<PricePoint[]> {
    const rows = await this.#get<QuoteRow[]>(`/quotes/history/${encodeURIComponent(instrumentId)}?limit=${limit}`);
    return rows
      .map((row) => ({ at: Date.parse(row.quotedAt), price: Number(row.midpoint) }))
      .filter((point) => Number.isFinite(point.at) && point.price > 0)
      .sort((a, b) => a.at - b.at);
  }

  /**
   * The earliest quote taken today (local time) among recent history, or undefined when today has
   * none. History is newest first and capped, so on a busy day this is the earliest quote still in it.
   */
  async dayOpen(instrumentId: string, now = new Date()): Promise<number | undefined> {
    const rows = await this.#get<QuoteRow[]>(
      `/quotes/history/${encodeURIComponent(instrumentId)}?limit=${HISTORY_ROWS}`,
    );
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = rows.filter((row) => Date.parse(row.quotedAt) >= startOfDay);
    return today.length ? tick(today.at(-1)!).price : undefined;
  }

  /** The shared transport adds the bearer token, and its interceptor ends the session on a 401. */
  async #get<T>(path: string): Promise<T> {
    if (!this.#tokens.accessToken) {
      throw new Error('Sign in to see live prices.');
    }
    try {
      return await firstValueFrom(this.#http.get<T>(`${this.#baseUrl}${path}`));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw new Error('Could not load prices.');
      }
      throw error;
    }
  }
}

function tick(row: QuoteRow): PriceTick {
  return { price: Number(row.midpoint), bid: Number(row.bid), ask: Number(row.ask), quotedAt: row.quotedAt };
}
