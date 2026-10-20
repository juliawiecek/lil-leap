/**
 * One activity feed (PS-11): orders, fills, rejections and cash movements in a single newest-first
 * timeline. Orders come from order history; deposits and transfers from GET /accounts/cash-activity.
 */
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { ApiHttpClient } from '@lilleap/session-core/angular';
import type { AccessTokenSource, OrderHistoryRow } from './order-history-api';

/** A deposit, withdrawal, transfer or other non-trade cash movement. Amount is signed USD. */
export interface CashMovement {
  transactionId: string;
  accountId: string;
  accountName: string;
  type: string;
  amount: number;
  settlementStatus: string;
  occurredAt: string;
}

export type ActivityKind = 'All' | 'Orders' | 'Cash';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['All', 'Orders', 'Cash'];

/** One row of the feed, ready to show. */
export interface ActivityItem {
  id: string;
  kind: 'order' | 'cash';
  /** When it happened: the fill time for a filled order, otherwise when it was submitted or recorded. */
  at: string;
  /** "Bought 10 AAPL", "Deposit", "Transfer out". */
  title: string;
  /** "Filled at $227.40", "Rejected", "Growth Portfolio". */
  detail: string;
  /** Cash in (positive) or out (negative); null while an order has not filled or was rejected. */
  amount: number | null;
  /** FILLED, REJECTED, SUBMITTED… for orders; SETTLED or PENDING for cash. */
  status: string;
  /** The order behind an order row, so a waiting one can be cancelled (PS-14). */
  orderId?: string;
}

export interface ActivityFilters {
  from?: string;
  to?: string;
  accountId?: string;
}

const CASH_TITLES: Record<string, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  DIVIDEND: 'Dividend',
  FEE: 'Fee',
  CORRECTION: 'Correction',
};

/** "$1,234.56", with a sign only when asked: "+$25.00" / "−$25.00". */
export function formatMoney(value: number, signed = false): string {
  const text = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
  if (!signed || value === 0) {
    return value < 0 ? `−${text}` : text;
  }
  return value > 0 ? `+${text}` : `−${text}`;
}

/** "16 Oct 2026, 14:32 GMT+1": local date and time with the zone shown, so nobody guesses which clock. */
export function formatLocalTime(iso: string, locale?: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZoneName: 'short', timeZone,
  }).format(date);
}

/** An order as a feed row: what was traded, how it ended, and the cash it moved once filled. */
export function orderItem(row: OrderHistoryRow): ActivityItem {
  const buy = row.side.toUpperCase() !== 'SELL';
  const filled = row.status === 'FILLED' && row.fillPrice !== null;
  const shares = filled ? (row.filledQuantity ?? row.quantity) : row.quantity;
  const title = filled ? `${buy ? 'Bought' : 'Sold'} ${shares} ${row.symbol}` : `${buy ? 'Buy' : 'Sell'} ${shares} ${row.symbol}`;
  let detail: string;
  if (filled) {
    detail = `Filled at ${formatMoney(row.fillPrice!)}`;
  } else if (row.status === 'REJECTED') {
    detail = 'Rejected, nothing was charged';
  } else if (row.status === 'CANCELLED') {
    detail = 'Cancelled, nothing was charged';
  } else {
    detail = titleCase(row.status);
  }
  return {
    id: `order-${row.orderId}`,
    kind: 'order',
    at: (filled && row.filledAt) || row.submittedAt,
    title,
    detail,
    amount: filled ? round((buy ? -1 : 1) * shares * row.fillPrice!) : null,
    status: row.status,
    orderId: row.orderId,
  };
}

/** A cash movement as a feed row; a transfer says which way it went. */
export function cashItem(movement: CashMovement): ActivityItem {
  let title = CASH_TITLES[movement.type] ?? titleCase(movement.type);
  if (movement.type === 'TRANSFER') {
    title = movement.amount < 0 ? 'Transfer out' : 'Transfer in';
  }
  return {
    id: `cash-${movement.transactionId}`,
    kind: 'cash',
    at: movement.occurredAt,
    title,
    detail: movement.settlementStatus === 'PENDING' ? `${movement.accountName} · settling` : movement.accountName,
    amount: movement.amount,
    status: movement.settlementStatus,
  };
}

/** Orders and cash movements in one list, newest first, narrowed to the chosen kind. */
export function buildActivity(orders: readonly OrderHistoryRow[], cash: readonly CashMovement[], kind: ActivityKind = 'All'): ActivityItem[] {
  const items = [
    ...(kind === 'Cash' ? [] : orders.map(orderItem)),
    ...(kind === 'Orders' ? [] : cash.map(cashItem)),
  ];
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
}

export class CashActivityClient {
  readonly #tokens: AccessTokenSource;
  readonly #http: ApiHttpClient;
  readonly #baseUrl: string;

  constructor(tokens: AccessTokenSource, http: ApiHttpClient, baseUrl = '/api/v1') {
    this.#tokens = tokens;
    this.#http = http;
    this.#baseUrl = baseUrl;
  }

  /** The caller's non-trade cash movements, newest first. Throws an Error whose message can be shown. */
  async list(filters: ActivityFilters = {}): Promise<CashMovement[]> {
    if (!this.#tokens.accessToken) {
      throw new Error('Sign in to see your activity.');
    }
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'accountId'] as const) {
      const value = filters[key]?.trim();
      if (value) {
        params.set(key, value);
      }
    }
    const query = params.size ? `?${params}` : '';
    let rows: CashMovement[];
    try {
      rows = await firstValueFrom(this.#http.get<CashMovement[]>(`${this.#baseUrl}/accounts/cash-activity${query}`));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status !== 0) {
        throw new Error('Could not load your cash activity. Please try again.');
      }
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
  }
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
