import { type Candle, type CandleRow, type Timeframe, toCandles } from './chart-data';
import type { AccessTokenSource } from './order-history-api';

/** Client for price candles (GET /quotes/candles/{instrumentId}). */
export class MarketDataClient {
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

  /**
   * Loads one instrument's candles for a timeframe, oldest first. Throws an Error whose
   * message can be shown to the user.
   */
  async candles(instrumentId: string, timeframe: Timeframe): Promise<Candle[]> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to see price charts.');
    }
    const query = new URLSearchParams({ interval: timeframe.interval, limit: String(timeframe.limit) });
    let response: Response;
    try {
      response = await this.#fetch(
        `${this.#baseUrl}/quotes/candles/${encodeURIComponent(instrumentId)}?${query}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (response.status === 401) {
      this.#tokens.unauthorized?.(token);
    }
    if (!response.ok) {
      throw new Error('Could not load the price chart. Please try again.');
    }
    return toCandles((await response.json()) as CandleRow[]);
  }

  /** Loads candles for several instruments at once, keyed by instrument id; failed ones are left out. */
  async candlesFor(instrumentIds: readonly string[], timeframe: Timeframe): Promise<Map<string, Candle[]>> {
    const results = await Promise.allSettled(instrumentIds.map((id) => this.candles(id, timeframe)));
    const byId = new Map<string, Candle[]>();
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        byId.set(instrumentIds[i], result.value);
      }
    });
    return byId;
  }
}
