import { InjectionToken } from '@angular/core';

/** The account behind a trade, with its owner's name and email. */
export interface TradeAccount {
  accountId: string;
  accountNumber: string;
  accountName: string;
  clientName: string;
  email: string;
  traderLevel: 'NOVICE' | 'ADVANCED';
  status: string;
}
/** One recorded step of a trade, from the trading database's status, audit, fill, cash and holding records. */
export interface TradeEvent {
  /** STATUS, AUDIT, FILL, CASH or HOLDING: which record it came from. */
  source: string;
  type: string;
  actor: string | null;
  occurredAt: string;
  details: Record<string, unknown> | null;
}
/** One filled trade, read from the reporting replica. */
export interface TradeRecord {
  orderId: string;
  filledAt: string;
  symbol: string;
  instrumentName: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  /** Execution price per share, USD. */
  price: number;
  /** Quantity times price, USD. */
  value: number;
  account: TradeAccount;
  /** Every recorded step, oldest first. */
  events: TradeEvent[];
}
export interface TradeRecords {
  load(orderId: string): Promise<TradeRecord>;
}
export const TRADE_RECORDS = new InjectionToken<TradeRecords>('Trade lookup API');
