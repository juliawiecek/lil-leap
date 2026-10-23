import { numericValue, orderedPoints, type ChartDataPoint } from '../../../shared/chart-data';
export { chartPoints, numericValue, orderedPoints, type ChartDataPoint, type ChartSeries } from '../../../shared/chart-data';
import type { PricePoint } from './market-feed-api';

export interface HistoricalQuote { quotedAt: string; midpoint?: unknown; bid?: unknown }
/** The API returns newest first, including its tie-break order. Preserve the newest tie. */
export function quoteHistoryPoints(rows: readonly HistoricalQuote[], basis: 'midpoint' | 'bid' = 'midpoint'): ChartDataPoint[] {
  return orderedPoints([...rows].reverse().flatMap(row => {
    const value = numericValue(row[basis]);
    return value !== null && value > 0 ? [{ time: Date.parse(row.quotedAt), value }] : [];
  }));
}
export function orderedPrices(points: readonly PricePoint[]): PricePoint[] {
  return orderedPoints(points.map(p => ({ ...p, time: p.at, value: p.price })))
    .filter(p => p.value > 0).map(({ time, value, ...p }) => p);
}

/** Both allocation renderers use these exact percentages, including the zero-total case. */
export function allocation(stocks: number, cash: number) {
  const valid = [stocks, cash].every(n => Number.isFinite(n) && n >= 0);
  const total = valid ? stocks + cash : 0;
  const stocksPercent = total > 0 ? Math.round(stocks / total * 1000) / 10 : 0;
  return { total, stocksValue: stocks, cashValue: cash, stocksPercent,
    cashPercent: total > 0 ? Math.round((100 - stocksPercent) * 10) / 10 : 0, available: valid };
}
