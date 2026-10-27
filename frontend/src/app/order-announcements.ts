import type { LiveAnnouncer, Politeness } from './live-announcer';
import { usd } from './order-feedback';
import { stockName } from './speech-text';

/**
 * What screen reader users hear as an order moves along (PS-21): "Order sent", "Order accepted",
 * "Filled" and "Rejected", each once per order. Rejections interrupt; the rest wait for a pause.
 */

export type OrderStage = 'sent' | 'accepted' | 'filled' | 'rejected';

export interface AnnouncedOrder {
  side: string;
  quantity: number;
  symbol: string;
  /** Price per share it filled at, when known. */
  fillPrice?: number | null;
  /** Why it was rejected, in plain words. */
  reason?: string;
}

/** "2 shares of Apple": the company as people say it, or the symbol when it is not in the catalog. */
function shares(order: AnnouncedOrder): string {
  const company = stockName(order.symbol) ?? order.symbol;
  return `${order.quantity} ${order.quantity === 1 ? 'share' : 'shares'} of ${company}`;
}

/** The sentence for one stage of an order, and how urgently it is read. */
export function orderAnnouncement(stage: OrderStage, order: AnnouncedOrder): { text: string; politeness: Politeness } {
  const selling = order.side.toUpperCase() === 'SELL';
  const verb = selling ? 'sell' : 'buy';
  switch (stage) {
    case 'sent':
      return { text: `Order sent: ${verb} ${shares(order)}.`, politeness: 'polite' };
    case 'accepted':
      return { text: `Order accepted: ${verb} ${shares(order)}. Waiting for it to fill.`, politeness: 'polite' };
    case 'filled': {
      const price = order.fillPrice ? ` at ${usd(order.fillPrice)}` : '';
      return { text: `Filled: ${selling ? 'sold' : 'bought'} ${shares(order)}${price}.`, politeness: 'polite' };
    }
    case 'rejected':
      return {
        text: `Rejected: your order to ${verb} ${shares(order)} was not filled.${order.reason ? ` ${order.reason}` : ''}`,
        politeness: 'assertive',
      };
  }
}

/** Says each stage of each order once, however often the dashboard re-reads its status. */
export class OrderAnnouncements {
  readonly #said = new Set<string>();
  readonly #announcer: LiveAnnouncer;

  constructor(announcer: LiveAnnouncer) {
    this.#announcer = announcer;
  }

  /** Announces the stage unless it was already said for this order; true when it was said now. */
  say(orderId: string, stage: OrderStage, order: AnnouncedOrder): boolean {
    const key = `${orderId}:${stage}`;
    if (this.#said.has(key)) {
      return false;
    }
    this.#said.add(key);
    const { text, politeness } = orderAnnouncement(stage, order);
    this.#announcer.announce(text, politeness);
    return true;
  }
}
