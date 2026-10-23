import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
/**
 * Client for the signed-in user's cash and holdings (Holdings service: GET /cash, GET /holdings)
 * and the latest quotes used to value them. Cash and holdings are scoped to the access token's user,
 * and optionally to one of their accounts (PS-05).
 */
import type { AccessTokenSource } from './order-history-api';

/** How often dashboards re-price holdings; matches how often the quote service publishes. */
export const QUOTE_REFRESH_MS = 5000;

/** One position as the dashboards need it. */
export interface PortfolioHolding {
  instrumentId: string;
  symbol: string;
  instrumentName: string;
  quantity: number;
  /** Average cost per share in USD. */
  averageCost: number;
}

/** Cash across the user's accounts plus their non-empty positions. */
export interface Portfolio {
  cash: number;
  holdings: PortfolioHolding[];
}

/** A position valued at a market price, with its unrealised gain against average cost. */
export interface ValuedHolding extends PortfolioHolding {
  price: number;
  value: number;
  gain: number;
  gainPercent: number;
  /** Today's move in the position's value, from the stock's change since the day's first quote. */
  dayGain: number;
  /** The stock's percent change today; 0 when unknown. */
  dayChangePercent: number;
}

export interface Valuation {
  cash: number;
  holdings: ValuedHolding[];
  holdingsValue: number;
  /** Cash plus holdings at market value. */
  total: number;
  gain: number;
  gainPercent: number;
  /** Today's move across all positions, in USD and as % of their value at the day's start. */
  dayGain: number;
  dayGainPercent: number;
}

/** Allocation cannot label book-cost fallbacks as current market value. */
export function hasMarketValuation(portfolio: Portfolio, bids: ReadonlyMap<string, number>): boolean {
  return Number.isFinite(portfolio.cash) && portfolio.cash >= 0 && portfolio.holdings.every(h =>
    Number.isFinite(h.quantity) && h.quantity > 0 && Number.isFinite(bids.get(h.instrumentId)) && bids.get(h.instrumentId)! > 0);
}

/**
 * Values each holding at its latest bid -- what selling now would fetch -- falling back to
 * average cost when no quote is available, so a missing quote never shows as a loss. Today's
 * gain uses each stock's percent change since the day's first quote; an unknown change counts as 0.
 */
export function valuePortfolio(
  { cash, holdings }: Portfolio,
  bids: ReadonlyMap<string, number>,
  dayChanges: ReadonlyMap<string, number> = new Map(),
): Valuation {
  const valued = holdings.map((h) => {
    const price = bids.get(h.instrumentId) ?? h.averageCost;
    const cost = h.quantity * h.averageCost;
    const value = round(h.quantity * price);
    const dayChangePercent = dayChanges.get(h.instrumentId) ?? 0;
    return {
      ...h, price, value, gain: round(value - cost), gainPercent: cost ? round(((value - cost) / cost) * 100) : 0,
      dayGain: dayGainOf(value, dayChangePercent), dayChangePercent,
    };
  });
  const holdingsValue = round(valued.reduce((sum, h) => sum + h.value, 0));
  const cost = holdings.reduce((sum, h) => sum + h.quantity * h.averageCost, 0);
  const gain = round(holdingsValue - cost);
  const dayGain = round(valued.reduce((sum, h) => sum + h.dayGain, 0));
  const dayStart = holdingsValue - dayGain;
  return {
    cash,
    holdings: valued,
    holdingsValue,
    total: round(cash + holdingsValue),
    gain,
    gainPercent: cost ? round((gain / cost) * 100) : 0,
    dayGain,
    dayGainPercent: dayStart > 0 ? round((dayGain / dayStart) * 100) : 0,
  };
}

/** The part of a value gained today, given today's percent change: value − value / (1 + change). */
export function dayGainOf(value: number, changePercent: number): number {
  return changePercent ? round(value - value / (1 + changePercent / 100)) : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export class PortfolioClient {
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

  /**
   * Loads cash and holdings together, for one account or across all of them when none is given.
   * Throws an Error whose message can be shown to the user.
   */
  async load(accountId?: string): Promise<Portfolio> {
    const scope = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    const [cash, holdings] = await Promise.all([
      this.#get<{ balance: number | string }[]>(`/cash${scope}`),
      this.#get<
        { instrumentId: string; symbol: string; instrumentName: string; quantity: number | string; averageCost: number | string }[]
      >(`/holdings${scope}`),
    ]);
    return {
      cash: round(cash.reduce((sum, row) => sum + Number(row.balance), 0)),
      holdings: holdings
        .map((row) => ({
          instrumentId: row.instrumentId,
          symbol: row.symbol,
          instrumentName: row.instrumentName,
          quantity: Number(row.quantity),
          averageCost: Number(row.averageCost),
        }))
        .filter((row) => row.quantity > 0),
    };
  }

  async #get<T>(path: string): Promise<T> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to see your balances.');
    }
    try {
      return await firstValueFrom(this.#http.get<T>(`${this.#baseUrl}${path}`));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status !== 0) {
        throw new Error('Could not load your balances. Please try again.');
      }
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
  }
}
