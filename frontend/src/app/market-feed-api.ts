/**
 * Live prices for every tradable stock (TS-14.7): the instrument list, each stock's latest quote,
 * and its first quote of the day. All reads go to the Holdings service with the user's token.
 */
import type { AccessTokenSource } from './order-history-api';

/** A quote older than this is shown as "Price delayed", matching the orders service's freshness rule. */
export const QUOTE_STALE_MS = 60000;
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

export interface PriceTick {
  price: number;
  bid: number;
  ask: number;
  quotedAt: string;
}

export class MarketFeedClient {
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

  async #get<T>(path: string): Promise<T> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to see live prices.');
    }
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) {
      this.#tokens.unauthorized?.(token);
    }
    if (!response.ok) {
      throw new Error('Could not load prices.');
    }
    return (await response.json()) as T;
  }
}

function tick(row: QuoteRow): PriceTick {
  return { price: Number(row.midpoint), bid: Number(row.bid), ask: Number(row.ask), quotedAt: row.quotedAt };
}
