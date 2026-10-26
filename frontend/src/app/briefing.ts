import type { MarketStatus } from './market-status-api';
import { stockName } from './speech-text';

/**
 * Spoken market briefing: turns what the dashboard already shows into a few short sentences
 * that can be read aloud ("Good afternoon. The market is open…"). Pure functions only, so the
 * wording can be tested without a browser or a speech engine.
 */

/** One stock the user holds. dayChangePercent is the stock's move today, from the live feed. */
export interface BriefingHolding {
  symbol: string;
  name: string;
  dayChangePercent: number | null;
}

/** One order from the history, as the Holdings service returns it. */
export interface BriefingOrder {
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  submittedAt: string;
  fillPrice: number | null;
  filledQuantity: number | null;
  filledAt: string | null;
}

/** Everything a briefing can mention. Leave a field out (or null) and its sentence is skipped. */
export interface BriefingSnapshot {
  now: Date;
  market: MarketStatus | null;
  /** The user chose to hide balances; amounts are then never spoken. */
  balanceHidden: boolean;
  total: number;
  /** Gain or loss since purchase across all holdings, and as a percent of what they cost. */
  gain: number;
  gainPercent: number;
  buyingPower: number;
  holdings: BriefingHolding[];
  /** Orders, any order; only those that changed since `since` are mentioned. */
  orders: BriefingOrder[];
  /** The last briefing, so an order is only reported once. Null reports the last 24 hours. */
  since: Date | null;
  /** Prices are older than the orders service accepts. */
  pricesDelayed: boolean;
  locale?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Orders reported at most, so a busy day does not turn into a long list. */
const MAX_ORDERS = 3;

/** "Good morning" before noon, "Good afternoon" before 6 PM, otherwise "Good evening". */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * A dollar amount that sounds natural aloud: whole dollars under $1,000, and three significant
 * figures above that with "about" when rounding changed it ("about $24,500").
 */
export function spokenAmount(value: number, locale = 'en-US'): string {
  const size = Math.abs(value);
  const digits = size >= 1000 ? Math.floor(Math.log10(size)) - 2 : 0;
  const step = 10 ** digits;
  const rounded = Math.round(size / step) * step;
  const text = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(rounded);
  return Math.abs(rounded - size) >= 0.5 ? `about ${text}` : text;
}

/** "1.2 percent", one decimal, without a sign. */
export function spokenPercent(value: number): string {
  return `${Math.abs(value).toFixed(1).replace(/\.0$/, '')} percent`;
}

/** "2 hours and 14 minutes", "45 minutes", "1 hour" or "less than a minute". */
export function spokenDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) {
    return 'less than a minute';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (!hours) {
    return part(rest, 'minute');
  }
  return rest ? `${part(hours, 'hour')} and ${part(rest, 'minute')}` : part(hours, 'hour');
}

/**
 * A company name as people say it: listed stocks by their everyday name ("GOOGL" is "Google"),
 * others with the legal suffix dropped ("Acme Holdings Inc." becomes "Acme"). Falls back to the symbol.
 */
export function spokenCompany(name: string, symbol: string): string {
  const known = stockName(symbol);
  if (known) {
    return known;
  }
  let words = name.split(' ').filter(Boolean);
  const bare = (word: string) => word.replaceAll(',', '').replaceAll('.', '').toLowerCase();
  const full = words.length;
  if (words.length > 2 && bare(words.at(-2)!) === 'class' && /^[A-Z]$/.test(words.at(-1)!)) {
    words = words.slice(0, -2);
  }
  while (words.length > 1 && LEGAL_SUFFIXES.has(bare(words.at(-1)!))) {
    words = words.slice(0, -1);
  }
  // "The" reads naturally only with the full legal name ("The Acme Company", but "Acme").
  if (words.length < full && words.length > 1 && bare(words[0]) === 'the') {
    words = words.slice(1);
  }
  const short = words.join(' ').replace(/[,.]$/, '');
  return short || symbol;
}

const LEGAL_SUFFIXES = new Set(['inc', 'corp', 'corporation', 'company', 'co', 'ltd', 'limited', 'plc', 'holdings', 'group', 'incorporated']);

/** The market sentence: when it closes if open, or when it opens if closed. */
export function marketSentence(market: MarketStatus | null, now: Date, locale?: string): string {
  if (!market) {
    return 'The market status is not available right now.';
  }
  if (market.open) {
    return `The market is open and closes in ${spokenDuration(new Date(market.nextClose).getTime() - now.getTime())}.`;
  }
  const opens = new Date(market.nextOpen);
  const away = opens.getTime() - now.getTime();
  if (away < DAY_MS) {
    return `The market is closed. It opens in ${spokenDuration(away)}.`;
  }
  const when = new Intl.DateTimeFormat(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(opens);
  return `The market is closed. It opens ${when.replace(/^(\w+)\s/, '$1 at ')}.`;
}

/** The holding that moved most today, up or down, or null when no move is known. */
export function biggestMover(holdings: readonly BriefingHolding[]): BriefingHolding | null {
  let best: BriefingHolding | null = null;
  for (const holding of holdings) {
    const move = holding.dayChangePercent;
    if (move === null || !Number.isFinite(move) || move === 0) {
      continue;
    }
    if (!best || Math.abs(move) > Math.abs(best.dayChangePercent!)) {
      best = holding;
    }
  }
  return best;
}

/** Orders that filled or were rejected after `since` (or in the last day), newest first. */
export function recentOrders(orders: readonly BriefingOrder[], since: Date | null, now: Date): BriefingOrder[] {
  const from = (since ?? new Date(now.getTime() - DAY_MS)).getTime();
  const changedAt = (order: BriefingOrder) => new Date(order.filledAt ?? order.submittedAt).getTime();
  return orders
    .filter((order) => (order.status === 'FILLED' || order.status === 'REJECTED') && changedAt(order) > from)
    .sort((a, b) => changedAt(b) - changedAt(a));
}

/** "You bought 2 shares of Apple at $182." or "Your order to sell 5 shares of NVIDIA was not filled." */
export function orderSentence(order: BriefingOrder, names: ReadonlyMap<string, string>, balanceHidden: boolean, locale?: string): string {
  const company = names.get(order.symbol) ?? order.symbol;
  const selling = order.side.toUpperCase() === 'SELL';
  if (order.status !== 'FILLED') {
    return `Your order to ${selling ? 'sell' : 'buy'} ${shares(order.quantity)} of ${company} was not filled.`;
  }
  const count = order.filledQuantity ?? order.quantity;
  const price = order.fillPrice !== null && !balanceHidden ? ` at ${spokenAmount(order.fillPrice, locale)}` : '';
  return `You ${selling ? 'sold' : 'bought'} ${shares(count)} of ${company}${price}.`;
}

function shares(count: number): string {
  return `${count} ${count === 1 ? 'share' : 'shares'}`;
}

/** The briefing as sentences, in the order they are read. */
export function buildBriefing(s: BriefingSnapshot): string[] {
  const lines = [`${greeting(s.now)}.`, marketSentence(s.market, s.now, s.locale)];
  const names = new Map(s.holdings.map((h) => [h.symbol, spokenCompany(h.name, h.symbol)]));

  if (s.balanceHidden) {
    lines.push('Your balance is hidden, so amounts are not read out.');
  } else if (s.holdings.length) {
    const direction = s.gain >= 0 ? 'up' : 'down';
    lines.push(
      `Your portfolio is worth ${spokenAmount(s.total, s.locale)}, ${direction} ${spokenAmount(s.gain, s.locale)}, ` +
        `or ${spokenPercent(s.gainPercent)}, since you bought.`,
    );
  } else {
    lines.push(`You don't own any stocks yet. You have ${spokenAmount(s.buyingPower, s.locale)} to invest.`);
  }

  const mover = biggestMover(s.holdings);
  if (mover) {
    const move = mover.dayChangePercent!;
    lines.push(`Your biggest mover today is ${names.get(mover.symbol)}, ${move > 0 ? 'up' : 'down'} ${spokenPercent(move)}.`);
  }

  const changed = recentOrders(s.orders, s.since, s.now);
  if (changed.length) {
    const intro = s.since ? 'since your last briefing' : 'today';
    lines.push(changed.length === 1 ? `One order changed ${intro}.` : `${changed.length} orders changed ${intro}.`);
    for (const order of changed.slice(0, MAX_ORDERS)) {
      lines.push(orderSentence(order, names, s.balanceHidden, s.locale));
    }
    if (changed.length > MAX_ORDERS) {
      lines.push('The rest are under Activity.');
    }
  }

  if (s.holdings.length && !s.balanceHidden) {
    lines.push(`You have ${spokenAmount(s.buyingPower, s.locale)} in buying power.`);
  }
  if (s.pricesDelayed) {
    lines.push('Some prices are delayed, so these numbers may be a little behind.');
  }
  return lines;
}

/** An unavailable history must not hold up the rest of the briefing. */
export async function briefingOrders<T>(request: Promise<T[]>, timeoutMs = 1500): Promise<T[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request.catch(() => []), new Promise<T[]>(resolve => {
      timer = setTimeout(() => resolve([]), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
