/**
 * Client for the signed-in user's order history (NEXT-117: GET /clients/{id}/orders).
 * The user id comes from the access token's subject, so callers never pass one.
 */

/** One order as returned by the orders service. Fill fields are null until the order fills. */
export interface OrderHistoryRow {
  orderId: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  submittedAt: string;
  fillPrice: number | null;
  filledQuantity: number | null;
  filledAt: string | null;
}

/** Optional filters. Dates are ISO days (yyyy-mm-dd), both inclusive; status is one order status. */
export interface OrderHistoryFilters {
  from?: string;
  to?: string;
  status?: string;
}

/** Anything that can supply the current access token, such as AuthService. */
export interface AccessTokenSource {
  readonly accessToken: string | null;
}

export class OrderHistoryClient {
  #tokens: AccessTokenSource;
  #fetch: typeof fetch;
  #baseUrl: string;

  constructor(
    tokens: AccessTokenSource,
    fetchImpl: typeof fetch = (input, init) => fetch(input, init),
    baseUrl = '/api/orders',
  ) {
    this.#tokens = tokens;
    this.#fetch = fetchImpl;
    this.#baseUrl = baseUrl;
  }

  /** Returns the user's orders, newest first. Throws an Error whose message can be shown to the user. */
  async list(filters: OrderHistoryFilters = {}): Promise<OrderHistoryRow[]> {
    const token = this.#tokens.accessToken;
    const userId = token ? subjectOf(token) : null;
    if (!token || !userId) throw new Error('Sign in to see your orders.');

    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'status'] as const) {
      const value = filters[key]?.trim();
      if (value) params.set(key, value);
    }
    const query = params.size ? `?${params}` : '';
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/clients/${encodeURIComponent(userId)}/orders${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message = typeof body?.message === 'string' ? body.message : null;
      throw new Error(message ?? 'Could not load your orders. Please try again.');
    }
    const rows = (await response.json()) as OrderHistoryRow[];
    return rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      fillPrice: row.fillPrice === null ? null : Number(row.fillPrice),
      filledQuantity: row.filledQuantity === null ? null : Number(row.filledQuantity),
    }));
  }
}

/** Reads the JWT subject (the user id) without verifying it; the server verifies every request. */
function subjectOf(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const { sub } = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}
