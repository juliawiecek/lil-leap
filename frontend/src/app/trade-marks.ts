/**
 * The client's own trades on the price chart (PS-13), read from order history. The chart draws
 * them as arrows on their bars, with the average cost as a price line (see AdvancedDashboard).
 */
import type { OrderHistoryRow } from './order-history-api';

export interface TradeMark {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  /** Fill time, ms since epoch. */
  at: number;
  /** Tooltip, e.g. "Bought 10 @ $227.40 · 14 Oct 15:02". */
  label: string;
}

/** Filled orders for one stock, oldest first, as chart markers. */
export function tradeMarks(rows: readonly OrderHistoryRow[], symbol: string, locale?: string): TradeMark[] {
  const when = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  return rows
    .filter((row) => row.symbol === symbol && row.status === 'FILLED' && row.fillPrice !== null && row.filledAt)
    .map((row) => {
      const side = row.side === 'SELL' ? 'SELL' : 'BUY';
      const quantity = Number(row.filledQuantity ?? row.quantity);
      const price = Number(row.fillPrice);
      const at = Date.parse(row.filledAt as string);
      const verb = side === 'BUY' ? 'Bought' : 'Sold';
      return { side, quantity, price, at, label: `${verb} ${quantity} @ ${money.format(price)} · ${when.format(at)}` } as TradeMark;
    })
    .filter((mark) => Number.isFinite(mark.at) && mark.price > 0)
    .sort((a, b) => a.at - b.at);
}
