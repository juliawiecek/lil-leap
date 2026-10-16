import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
/**
 * Client for the signed-in user's order history (NEXT-117: GET /clients/{id}/orders).
 * The user id comes from the access token's subject, so callers never pass one.
 */

/** One order as returned by the Holdings service. Fill fields are null until the order fills. */
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

/** Statuses after which an order no longer changes. */
export const FINAL_ORDER_STATUSES: ReadonlySet<string> = new Set(['FILLED', 'REJECTED']);
/** How often, and for how long, a dashboard re-reads a just-submitted order while it executes. */
export const ORDER_TRACK_INTERVAL_MS = 2000;
export const ORDER_TRACK_LIMIT_MS = 300000;

/**
 * Optional filters. Dates are ISO days (yyyy-mm-dd), both inclusive; status is one order status;
 * accountId narrows to one of the user's accounts (PS-05).
 */
export interface OrderHistoryFilters {
  from?: string;
  to?: string;
  status?: string;
  accountId?: string;
}

/** Anything that can supply the current access token, such as AuthService. */
export interface AccessTokenSource {
  readonly accessToken: string | null;
}

export class OrderHistoryClient {
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

  /** Returns the user's orders, newest first. Throws an Error whose message can be shown to the user. */
  async list(filters: OrderHistoryFilters = {}): Promise<OrderHistoryRow[]> {
    const token = this.#tokens.accessToken;
    const userId = token ? subjectOf(token) : null;
    if (!token || !userId) {
      throw new Error('Sign in to see your orders.');
    }

    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'status', 'accountId'] as const) {
      const value = filters[key]?.trim();
      if (value) {
        params.set(key, value);
      }
    }
    const query = params.size ? `?${params}` : '';
    let rows: OrderHistoryRow[];
    try {
      rows = await firstValueFrom(this.#http.get<OrderHistoryRow[]>(`${this.#baseUrl}/clients/${encodeURIComponent(userId)}/orders${query}`));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status !== 0) {
        const message = typeof error.error?.message === 'string' ? error.error.message : 'Could not load your orders. Please try again.';
        throw new Error(message);
      }
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    return rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      fillPrice: row.fillPrice === null ? null : Number(row.fillPrice),
      filledQuantity: row.filledQuantity === null ? null : Number(row.filledQuantity),
    }));
  }

  /**
   * Cancels one of the caller's orders while it is still waiting (PS-14). Resolves when the orders
   * service has recorded it as CANCELLED; otherwise throws with a sentence the user can read, e.g.
   * when the order already started executing.
   */
  async cancel(orderId: string): Promise<void> {
    const token = this.#tokens.accessToken;
    if (!token) {
      throw new Error('Sign in to cancel an order.');
    }
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (response.status === 401) { this.#tokens.unauthorized?.(token); }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const message = typeof body?.message === 'string' ? body.message : null;
      throw new Error(response.status === 404 ? 'That order was not found.' : message ?? 'Could not cancel the order. Please try again.');
    }
  }
}

/** Reads the JWT subject (the user id) without verifying it; the server verifies every request. */
function subjectOf(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const { sub } = JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))) as { sub?: unknown };
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}
