import type { TradeEvent, TradeRecord } from '../../trade-records';

/** One reconciliation check on a trade's permanent records. */
export interface TradeCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** What operations staff need first: the outcome, the money and shares it moved, and whether its records agree. */
export interface TradeCase {
  status: string | null;
  reason: string | null;
  side: 'BUY' | 'SELL' | null;
  quantity: string | null;
  price: string | null;
  cashDelta: string | null;
  sharesChange: string | null;
  firstAt: string | null;
  lastAt: string | null;
  checks: TradeCheck[];
}

const FINAL = new Set(['FILLED', 'REJECTED', 'CANCELLED']);

function text(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

/** Exact amount in cents of quantity x price, rounded half-up like settlement does; null if unparseable. */
export function notionalCents(quantity: string, price: string): bigint | null {
  if (!/^\d+$/.test(quantity) || !/^\d+(\.\d+)?$/.test(price)) {
    return null;
  }
  const [whole, fraction = ''] = price.split('.');
  const scale = fraction.length;
  const product = BigInt(quantity) * BigInt(whole + fraction);
  if (scale <= 2) {
    return product * 10n ** BigInt(2 - scale);
  }
  const divisor = 10n ** BigInt(scale - 2);
  return (product * 2n + divisor) / (2n * divisor);
}

/** Signed amount in cents, e.g. "-1234.5" -> -123450n; null if unparseable. */
export function cents(amount: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) {
    return null;
  }
  const value = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -value : value;
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Reads a trade's trail into a case summary. The checks mirror the parts settlement recovery
 * repairs (TS-10.3): a filled trade needs one fill, one cash movement and one holding movement,
 * and the cash and shares they moved must match the fill exactly.
 */
export function tradeCase(trail: Pick<TradeRecord, 'events'>): TradeCase {
  const of = (source: string) => trail.events.filter((event) => event.source === source);
  const statuses = of('STATUS');
  const fills = of('FILL');
  const cash = of('CASH');
  const holdings = of('HOLDING');
  const latest: TradeEvent | undefined = statuses.at(-1);
  const fill = fills[0];
  const movement = holdings[0];
  const quantity = text(fill?.details?.['quantity']);
  const price = text(fill?.details?.['price']);
  const side = (movement?.type ?? cash[0]?.type) as 'BUY' | 'SELL' | undefined;
  const status = latest?.type ?? null;
  const checks: TradeCheck[] = [];

  checks.push(of('AUDIT').length
    ? { label: 'Audit trail', ok: true, detail: `${of('AUDIT').length} audit entries recorded.` }
    : { label: 'Audit trail', ok: false, detail: 'No audit entries are recorded for this trade.' });
  checks.push(status && FINAL.has(status)
    ? { label: 'Final outcome', ok: true, detail: `The trade ended ${status.toLowerCase()}.` }
    : { label: 'Final outcome', ok: true, detail: 'The trade has not finished yet.' });

  if (status === 'FILLED' || fills.length) {
    const parts = [
      { label: 'Fill', count: fills.length },
      { label: 'Cash movement', count: cash.length },
      { label: 'Holding movement', count: holdings.length },
    ];
    for (const part of parts) {
      checks.push({
        label: part.label,
        ok: part.count === 1,
        detail: part.count === 1 ? 'Recorded once.' : part.count ? `Recorded ${part.count} times.` : 'Missing.',
      });
    }
    if (status !== 'FILLED') {
      checks.push({ label: 'Status', ok: false, detail: `A fill exists but the trade's status is ${status ?? 'missing'}.` });
    }
    const expected = quantity && price ? notionalCents(quantity, price) : null;
    const moved = cash.length === 1 ? cents(text(cash[0].details?.['amount']) ?? '') : null;
    if (expected !== null && moved !== null && side) {
      const signed = side === 'BUY' ? -expected : expected;
      checks.push({
        label: 'Cash matches fill',
        ok: moved === signed,
        detail: moved === signed
          ? `${formatCents(signed)} USD = ${quantity} × ${price}.`
          : `Moved ${formatCents(moved)} USD; the fill implies ${formatCents(signed)} USD.`,
      });
    }
    const change = holdings.length === 1 ? text(movement.details?.['quantityChange']) : null;
    if (quantity && change && side) {
      const expectedChange = side === 'BUY' ? quantity : `-${quantity}`;
      checks.push({
        label: 'Shares match fill',
        ok: change === expectedChange,
        detail: change === expectedChange
          ? `${change} shares.`
          : `Moved ${change} shares; the fill implies ${expectedChange}.`,
      });
    }
  }

  return {
    status,
    reason: text(latest?.details?.['reasonText']) ?? text(latest?.details?.['reasonCode']),
    side: side ?? null,
    quantity,
    price,
    cashDelta: cash.length === 1 ? text(cash[0].details?.['amount']) : null,
    sharesChange: holdings.length === 1 ? text(movement.details?.['quantityChange']) : null,
    firstAt: trail.events[0]?.occurredAt ?? null,
    lastAt: trail.events.at(-1)?.occurredAt ?? null,
    checks,
  };
}
