/** Browser-local order templates. Prices are deliberately not reused across symbols. */
export interface OrderPreset {
  name: string;
  orderType: 'MARKET' | 'LIMIT';
  quantity: number;
  tolerance: number;
  profitPercent: number | null;
  stopPercent: number | null;
  riskBudget: number | null;
}

export function validPreset(value: unknown): value is OrderPreset {
  if (!value || typeof value !== 'object') return false;
  const p = value as OrderPreset;
  const distance = (n: unknown) => n === null || (typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 100);
  return typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 40
    && (p.orderType === 'MARKET' || p.orderType === 'LIMIT')
    && Number.isSafeInteger(p.quantity) && p.quantity > 0
    && Number.isFinite(p.tolerance) && p.tolerance >= 0.1 && p.tolerance <= 10
    && distance(p.profitPercent) && distance(p.stopPercent)
    && (p.riskBudget === null || (Number.isFinite(p.riskBudget) && p.riskBudget > 0));
}

export function parsePresets(raw: string | null): OrderPreset[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter(validPreset).filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    }).slice(0, 10);
  } catch { return []; }
}

/** Floors share counts and caps them by available resources. Never rounds risk upwards. */
export function riskQuantity(budget: number, entry: number, stop: number, side: string, capacity: number): number {
  if (![budget, entry, stop, capacity].every(Number.isFinite) || budget <= 0 || entry <= 0 || stop <= 0 || capacity < 1) return 0;
  const distance = side === 'Buy' ? entry - stop : stop - entry;
  if (distance <= 0) return 0;
  const shares = Math.min(Math.floor(budget / distance), Math.floor(capacity));
  return Number.isSafeInteger(shares) ? shares : 0;
}
