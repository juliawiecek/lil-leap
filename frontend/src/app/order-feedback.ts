/**
 * What the client is told about an order (PS-15): the one-line review before it is sent, and the
 * plain-English reason when it is rejected. Every rejection code is mapped here and nowhere else.
 */
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
import type { AccessTokenSource } from './order-history-api';

const REJECTION_REASONS: Record<string, string> = {
  INSUFFICIENT_CASH: 'There was not enough cash in this account to pay for it.',
  INSUFFICIENT_HOLDINGS: 'You do not hold enough shares to sell that many.',
  PRICE_OUT_OF_TOLERANCE: 'The price moved past your price protection before it could fill.',
  PRICE_MOVED: 'The price moved past your price protection before it could fill. Nothing was charged.',
  ACCOUNT_NOT_ACTIVE: 'This account is not open for trading.',
  INSTRUMENT_NOT_TRADABLE: 'This stock cannot be traded right now.',
  LOCATION_RESTRICTED: 'Trading this stock is not permitted from your location.',
  MARKET_CLOSED: 'The market was closed.',
  EXECUTION_FAILED: 'It could not be executed. Please try again.',
};
const UNKNOWN_REJECTION = 'It could not be completed. Check Orders for details.';

/** Plain-English reason for a rejection code; a generic sentence for codes not yet mapped. */
export function rejectionReason(code: string | null | undefined): string {
  return (code && REJECTION_REASONS[code]) || UNKNOWN_REJECTION;
}

/**
 * The reason to show for a rejected order: the service's own explanation when it gave one (price
 * protection says how far the price moved), otherwise the sentence for its code.
 */
export function rejectionMessage(status: Pick<OrderStatus, 'reasonCode' | 'reasonText'>): string {
  return status.reasonText?.trim() || rejectionReason(status.reasonCode);
}

export interface OrderReview {
  side: 'Buy' | 'Sell';
  quantity: number;
  symbol: string;
  /** Indicative price per share. */
  price: number;
  /** Price protection: how far, in percent, the price may move against the order before it is rejected. */
  tolerancePercent: number;
  /** Empty while the market is open; otherwise when it opens, e.g. "14:30". */
  opensAt: string;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Formats a dollar amount as "$1,234.56". */
export function usd(amount: number): string {
  return USD.format(amount);
}

/**
 * One review line, e.g. "Buy 10 AAPL · about $2,274.00 · fills at up to $2,319.50 · market closed,
 * fills at the open (14:30)". A sell names the least it will fill for.
 */
export function orderReviewSummary(review: OrderReview): string {
  const estimate = review.quantity * review.price;
  const moved = estimate * (review.tolerancePercent / 100);
  const bound = review.side === 'Buy'
    ? `fills at up to ${usd(estimate + moved)}`
    : `fills at no less than ${usd(Math.max(0, estimate - moved))}`;
  const parts = [`${review.side} ${review.quantity} ${review.symbol}`, `about ${usd(estimate)}`, bound];
  if (review.opensAt) {
    parts.push(`market closed, fills at the open (${review.opensAt})`);
  }
  return parts.join(' · ');
}

export interface OrderStatus {
  status: string;
  reasonCode: string | null;
  /** The service's own explanation, e.g. how far the price moved; null when it gave none. */
  reasonText: string | null;
}

/** Reads one order's latest status and reason from the orders service. */
export class OrderStatusClient {
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

  /** The order's status and reason code; throws when it cannot be read. */
  async status(orderId: string): Promise<OrderStatus> {
    if (!this.#tokens.accessToken) {
      throw new Error('Sign in to see your orders.');
    }
    let body: { status: string; reasonCode?: string | null; reasonText?: string | null };
    try {
      body = await firstValueFrom(this.#http.get<typeof body>(`${this.#baseUrl}/orders/${encodeURIComponent(orderId)}/status`));
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw new Error('Could not load the order status.');
      }
      throw error;
    }
    return { status: body.status, reasonCode: body.reasonCode ?? null, reasonText: body.reasonText ?? null };
  }
}
