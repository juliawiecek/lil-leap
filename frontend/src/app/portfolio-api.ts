/**
 * Client for the signed-in user's cash and holdings (Holdings service: GET /cash, GET /holdings)
 * and the latest quotes used to value them. Cash and holdings are scoped to the access token's user.
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
}

export interface Valuation {
  cash: number;
  holdings: ValuedHolding[];
  holdingsValue: number;
  /** Cash plus holdings at market value. */
  total: number;
  gain: number;
  gainPercent: number;
}

/**
 * Values each holding at its latest bid -- what selling now would fetch -- falling back to
 * average cost when no quote is available, so a missing quote never shows as a loss.
 */
export function valuePortfolio({ cash, holdings }: Portfolio, bids: ReadonlyMap<string, number>): Valuation {
  const valued = holdings.map((h) => {
    const price = bids.get(h.instrumentId) ?? h.averageCost;
    const cost = h.quantity * h.averageCost;
    const value = round(h.quantity * price);
    return { ...h, price, value, gain: round(value - cost), gainPercent: cost ? round(((value - cost) / cost) * 100) : 0 };
  });
  const holdingsValue = round(valued.reduce((sum, h) => sum + h.value, 0));
  const cost = holdings.reduce((sum, h) => sum + h.quantity * h.averageCost, 0);
  const gain = round(holdingsValue - cost);
  return {
    cash,
    holdings: valued,
    holdingsValue,
    total: round(cash + holdingsValue),
    gain,
    gainPercent: cost ? round((gain / cost) * 100) : 0,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export class PortfolioClient {
  #tokens: AccessTokenSource;
  #fetch: typeof fetch;
  #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/api/v1',
  ) {
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /** Loads cash and holdings together. Throws an Error whose message can be shown to the user. */
  async load(): Promise<Portfolio> {
    const [cash, holdings] = await Promise.all([
      this.#get<{ balance: number | string }[]>('/cash'),
      this.#get<
        { instrumentId: string; symbol: string; instrumentName: string; quantity: number | string; averageCost: number | string }[]
      >('/holdings'),
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

  /** Latest bid per instrument id. Instruments whose quote cannot be loaded are left out. */
  async latestBids(instrumentIds: readonly string[]): Promise<Map<string, number>> {
    const results = await Promise.allSettled(
      instrumentIds.map((id) => this.#get<{ bid: number | string }>(`/quotes/latest/by-instrument/${encodeURIComponent(id)}`)),
    );
    const bids = new Map<string, number>();
    results.forEach((result, i) => {
      const bid = result.status === 'fulfilled' ? Number(result.value.bid) : Number.NaN;
      if (Number.isFinite(bid) && bid > 0) bids.set(instrumentIds[i], bid);
    });
    return bids;
  }

  async #get<T>(path: string): Promise<T> {
    const token = this.#tokens.accessToken;
    if (!token) throw new Error('Sign in to see your balances.');
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!response.ok) throw new Error('Could not load your balances. Please try again.');
    return (await response.json()) as T;
  }
}
