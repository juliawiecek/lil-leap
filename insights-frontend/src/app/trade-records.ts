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
/** One trade as the reporting dataset (`reports/trades.csv`) records it; the dataset holds filled orders only. */
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
}
export interface TradeRecords {
  load(orderId: string): Promise<TradeRecord>;
}
export const TRADE_RECORDS = new InjectionToken<TradeRecords>('Trade lookup API');
