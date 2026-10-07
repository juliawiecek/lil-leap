/**
 * Client for the signed-in user's cash and holdings (Holdings service: GET /cash, GET /holdings).
 * Both endpoints are scoped to the access token's user, so callers never pass an id.
 */
import type { AccessTokenSource } from './order-history-api';

/** One position as the dashboards need it. */
export interface PortfolioHolding {
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
      this.#get<{ symbol: string; instrumentName: string; quantity: number | string; averageCost: number | string }[]>(
        '/holdings',
      ),
    ]);
    return {
      cash: Math.round(cash.reduce((sum, row) => sum + Number(row.balance), 0) * 100) / 100,
      holdings: holdings
        .map((row) => ({
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
