import { spokenAmount, spokenCompany } from './briefing';

/**
 * Order read-back (PS-23): before an order is confirmed, the app says exactly what is about to be
 * placed, so someone trading by ear (switch control with reading aloud on) hears it before
 * pressing Confirm. A pure function, so the wording is tested without a speech engine.
 */
export interface OrderReadBackInput {
  side: 'Buy' | 'Sell';
  quantity: number;
  symbol: string;
  /** The company's full name as listed; listed stocks are said by their everyday name. */
  name: string;
  /** Estimated total in dollars. */
  total: number;
  /** The review's closed-market warning, or '' while the market is open. */
  closedWarning: string;
  /** The price is older than the orders service accepts. */
  priceDelayed: boolean;
  limitPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
}

/**
 * "You're about to buy 2 shares of Apple for about $450. Press Confirm buy to place the order."
 * Adds the closed-market note and a delayed-price note when the review shows them.
 */
export function orderReadBack(o: OrderReadBackInput): string {
  const verb = o.side === 'Sell' ? 'sell' : 'buy';
  const shares = `${o.quantity} ${o.quantity === 1 ? 'share' : 'shares'}`;
  const parts = [`You're about to ${verb} ${shares} of ${spokenCompany(o.name, o.symbol)} for ${spokenAmount(o.total)}.`];
  const price = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
  if (o.limitPrice !== undefined) parts.push(`Limit price ${price(o.limitPrice)} per share, or better.`);
  if (o.takeProfit !== undefined) parts.push(`Take profit at ${price(o.takeProfit)}.`);
  if (o.stopLoss !== undefined) parts.push(`Stop loss triggers at ${price(o.stopLoss)}; the execution price may differ.`);
  if (o.closedWarning) {
    parts.push(o.closedWarning);
  }
  if (o.priceDelayed) {
    parts.push('The price is delayed, so the final total may be different.');
  }
  parts.push(`Press Confirm ${verb} to place the order.`);
  return parts.join(' ');
}
