/**
 * Live prices for every tradable stock (TS-14.7): the instrument list, each stock's latest quote,
 * and its regular-session baseline. All reads go to Holdings with the user's token.
 */
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
import type { AccessTokenSource } from './order-history-api';
import { numericValue, orderedPrices, quoteHistoryPoints } from './chart-data';

/** A quote older than this is shown as "Price delayed", matching the orders service's freshness rule. */
export const QUOTE_STALE_MS = 60000;
/** Width of each price-bar interval the holdings service offers. */
const BAR_MS: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '1d': 86400000 };
/** Recent history for charts; session baselines use a separate indexed lookup. */
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
  /** Percent change against the session open, or previous close before open; 0 when unknown. */
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
  /** Original OHLC metadata when supplied by the candle endpoint; raw quotes have none. */
  candle?: PriceCandle;
}

export interface PriceCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** The current backend does not report traded volume. Never substitute quote counts. */
  volume: number | null;
}

export function candleMetadata(row: { time: string; open?: unknown; high?: unknown; low?: unknown; close: unknown; volume?: unknown }): PriceCandle | undefined {
  const time = Date.parse(row.time), open = numericValue(row.open), high = numericValue(row.high), low = numericValue(row.low), close = numericValue(row.close);
  if (!Number.isFinite(time) || open === null || high === null || low === null || close === null || Math.min(open, high, low, close) <= 0 || high < Math.max(open, close) || low > Math.min(open, close)) {
    return undefined;
  }
  const volume = numericValue(row.volume);
  return { time, open, high, low, close, volume: volume !== null && Number.isFinite(volume) && volume >= 0 ? volume : null };
}

export interface PriceTick {
  price: number;
  bid: number;
  ask: number;
  quotedAt: string;
}

export class MarketFeedClient {
  readonly #historyCache = new Map<string, { expires: number; response: Promise<unknown> }>();
  #cacheToken: string | null = null;
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
  async closes(instrumentId: string, interval: string, limit: number, now = Date.now(), basis: 'midpoint' | 'bid' = 'midpoint'): Promise<PricePoint[]> {
    const rows = await this.#historyGet<{ time: string; observedAt?: string; bidClose?: unknown; close: number | string; open?: unknown; high?: unknown; low?: unknown; volume?: unknown }[]>(
      `/quotes/candles/${encodeURIComponent(instrumentId)}?interval=${encodeURIComponent(interval)}&limit=${limit}`,
    );
    if (!Array.isArray(rows)) {
      // A misrouted request can come back as a web page rather than JSON.
      throw new Error('Could not load prices.');
    }
    const width = BAR_MS[interval] ?? 0;
    return orderedPrices(rows
      // The service dates a bar by its start; its close was taken at its end (or now, for the open bar).
      .map((row) => {
        const value = numericValue(basis === 'bid' ? row.bidClose : row.close);
        // Legacy candle responses have no exact close time. They remain usable as midpoint
        // bars, but must not be passed off as historical bid observations.
        const at = row.observedAt ? Date.parse(row.observedAt) : basis === 'bid' ? NaN : Math.min(Date.parse(row.time) + width, now);
        const point: PricePoint = { at, price: value ?? NaN };
        const candle = candleMetadata(row);
        return candle && basis === 'midpoint' ? { ...point, candle } : point;
      })
      .filter((point) => point.at <= now && Number.isFinite(point.price)));
  }

  /** Recent quotes of one stock, oldest first, for the price chart (PS-06). */
  async history(instrumentId: string, limit = HISTORY_ROWS, basis: 'midpoint' | 'bid' = 'midpoint'): Promise<PricePoint[]> {
    const rows = await this.#historyGet<QuoteRow[]>(`/quotes/history/${encodeURIComponent(instrumentId)}?limit=${limit}`);
    if (!Array.isArray(rows)) throw new Error('Could not load prices.');
    return quoteHistoryPoints(rows, basis).filter(p => p.time <= Date.now()).map(p => ({ at: p.time, price: p.value }));
  }

  /** Coalesce concurrent chart reads and reuse them for one feed interval. Failures retry. */
  #historyGet<T>(path: string): Promise<T> {
    if (this.#cacheToken !== this.#tokens.accessToken) {
      this.#historyCache.clear();
      this.#cacheToken = this.#tokens.accessToken;
    }
    const saved = this.#historyCache.get(path);
    if (saved && saved.expires > Date.now()) return saved.response as Promise<T>;
    if (this.#historyCache.size >= 64) this.#historyCache.delete(this.#historyCache.keys().next().value!);
    const entry = { expires: Date.now() + 5000, response: this.#get<T>(path) };
    this.#historyCache.set(path, entry);
    entry.response.catch(() => { if (this.#historyCache.get(path) === entry) this.#historyCache.delete(path); });
    return entry.response;
  }

  /**
   * Session baselines in one bounded request. Holdings uses 09:30 America/New_York
   * (DST-aware), or the previous close before open, without a history-page limit.
   */
  async dayOpens(instrumentIds: readonly string[]): Promise<Map<string, number>> {
    if (!instrumentIds.length) {
      return new Map();
    }
    const rows = await this.#get<(QuoteRow & { instrumentId: string })[]>(
      `/quotes/day-opens?ids=${instrumentIds.map(encodeURIComponent).join(',')}`,
    );
    return new Map(rows.map((row) => [row.instrumentId, Number(row.midpoint)]));
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
