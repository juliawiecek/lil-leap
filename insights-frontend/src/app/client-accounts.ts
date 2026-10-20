import { InjectionToken } from '@angular/core';

/**
 * A trading account as the Clients page shows it, with its owner's name and email. Built from the
 * reporting dataset (`reports/trades.csv`) the Reports page also reads, so an account appears once it has a fill.
 */
export interface ClientSummary {
  accountId: string;
  accountNumber: string;
  accountName: string;
  clientName: string;
  email: string;
  traderLevel: 'NOVICE' | 'ADVANCED';
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'CLOSED';
  /** Executed trades (fills). */
  tradeCount: number;
  /** Total value of the fills, USD. */
  tradedValue: number;
  lastTradeAt: string;
}
export interface ClientHolding {
  symbol: string;
  instrumentName: string;
  quantity: number;
  averageCost: number;
  costBasis: number;
}
/** A filled order. */
export interface ClientOrder {
  orderId: string;
  filledAt: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  fillPrice: number;
}
export interface ClientDetail {
  account: ClientSummary;
  holdings: ClientHolding[];
}
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
/** List filters; empty strings mean "any". */
export interface ClientFilters {
  search: string;
  level: string;
  status: string;
  /** `key,asc` or `key,desc`. */
  sort: string;
  page: number;
}
export interface OrderFilters {
  /** A symbol prefix or a full order ID. */
  search: string;
  page: number;
}
export interface ClientAccounts {
  list(filters: ClientFilters): Promise<Page<ClientSummary>>;
  detail(accountId: string): Promise<ClientDetail>;
  orders(accountId: string, filters: OrderFilters): Promise<Page<ClientOrder>>;
}
export const CLIENT_ACCOUNTS = new InjectionToken<ClientAccounts>('Client accounts API');

export const PAGE_SIZE = 25;
export const DEFAULT_SORT = 'accountNumber,asc';
export const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query parameters for a request: empty values and defaults are left out. */
export function queryParams(values: Record<string, string | number>, size = PAGE_SIZE): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && !(key === 'page' && value === 0)) {
      params[key] = String(value).trim();
    }
  }
  params['size'] = String(size);
  return params;
}

/** Readable label for a code such as BLOCKED or CANCELLED. */
export function codeLabel(code: string): string {
  const words = code.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
