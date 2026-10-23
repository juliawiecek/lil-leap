/** Numerical chart contract shared by renderers, explanations and keyboard/audio consumers.
 * All times are Unix epoch milliseconds; currency values retain calculation precision.
 */
export interface ChartDataPoint { time: number; value: number }
export interface ChartSeries<P extends ChartDataPoint = ChartDataPoint> {
  id: string;
  label: string;
  unit: 'USD' | 'shares' | 'percent' | 'index';
  points: readonly P[];
  status: 'ready' | 'empty' | 'loading' | 'error' | 'unavailable';
  note?: string;
}

/** Last valid observation wins timestamp ties. Never coerce null/empty strings to zero. */
export function numericValue(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function orderedPoints<P extends ChartDataPoint>(points: readonly P[]): P[] {
  return [...new Map(points.filter(p => Number.isFinite(p.time) && p.time >= 0
    && Number.isFinite(new Date(p.time).getTime()) && Number.isFinite(p.value))
    .map(p => [p.time, p])).values()].sort((a, b) => a.time - b.time);
}
/** Compatibility adapter for the existing SVG geometry's {at, price/value} shape. */
export function chartPoints<T>(rows: readonly T[], time: (row: T) => number, value: (row: T) => number): ChartDataPoint[] {
  return orderedPoints(rows.map(row => ({ time: time(row), value: value(row) })));
}
