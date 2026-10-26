import { orderedPoints } from './chart-data.ts';
/** PS-25: data-only descriptions shared by both Angular applications. Times are epoch ms. */
export interface SeriesPoint { at: number; value: number; low?: number; high?: number; label?: string }
export interface ChartTable {
  columns: readonly string[]; rows: readonly (readonly string[])[]; note?: string; grouped?: boolean;
  references?: readonly { label: string; value: string }[];
}
export interface SeriesOptions {
  name?: string; period?: string; currency?: string; unit?: string; hidden?: boolean; empty?: string; precision?: number; categorical?: boolean;
}
export function chartPeriodLabel(period: string): string {
  return ({ '1D': 'one day', '1W': 'one week', '1M': 'one month', '3M': 'three months', '6M': 'six months', '1Y': 'one year', '5Y': 'five years', ALL: 'all recorded history', All: 'all recorded history' } as Record<string, string>)[period] ?? period;
}
const DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
export const chartDate = (at: number): string => DATE.format(at);
export function chartValue(value: number, options: SeriesOptions = {}): string {
  return new Intl.NumberFormat('en-US', options.currency
    ? { style: 'currency', currency: options.currency, maximumFractionDigits: options.precision ?? 8 }
    : { maximumFractionDigits: options.precision ?? 8 }).format(value) + (options.unit ? ` ${options.unit}` : '');
}
/** Copy, sort and deduplicate without inventing observations or treating missing values as zero. */
export function seriesPoints(points: readonly SeriesPoint[]): SeriesPoint[] {
  return orderedPoints(points.map(p => ({ ...p, time: p.at, low: Number.isFinite(p.low) ? p.low : undefined, high: Number.isFinite(p.high) ? p.high : undefined })))
    .map(({ time, ...p }) => p);
}
export function describeSeries(input: readonly SeriesPoint[], options: SeriesOptions = {}): string {
  const name = `${options.name ?? 'Recorded values'}${options.period ? `, ${chartPeriodLabel(options.period)}` : ''}`;
  const points = seriesPoints(input);
  if (options.hidden) return `${name}. Amounts are hidden. Show balances to read the values and their table.`;
  if (!points.length) return `${name}. ${options.empty ?? 'No recorded observations are available for this view.'}`;
  const first = points[0], last = points.at(-1)!;
  const format = (n: number) => chartValue(n, { ...options, precision: options.precision ?? 2 });
  const when = (p: SeriesPoint) => p.label ?? chartDate(p.at);
  if (points.length === 1) return `${name}. One observation: ${format(first.value)} on ${when(first)}. More observations are needed to describe a trend.`;
  const change = last.value - first.value;
  const trend = change > 0 ? 'rose' : change < 0 ? 'fell' : 'was unchanged';
  const magnitude = Math.abs(change / first.value * 100);
  const percent = first.value !== 0 ? magnitude > 0 && magnitude < .01 ? ' less than 0.01 percent' : ` ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(magnitude)} percent` : '';
  const lowOf = (p: SeriesPoint) => Number.isFinite(p.low) ? p.low! : p.value;
  const highOf = (p: SeriesPoint) => Number.isFinite(p.high) ? p.high! : p.value;
  const low = points.reduce((a, b) => lowOf(b) < lowOf(a) ? b : a);
  const high = points.reduce((a, b) => highOf(b) > highOf(a) ? b : a);
  return `${name} ${trend}${change ? percent : ''}, from ${format(first.value)} on ${when(first)} to ${format(last.value)} on ${when(last)}. Low was ${format(lowOf(low))} on ${when(low)}; high was ${format(highOf(high))} on ${when(high)}.${first.value === 0 && change ? ' Percentage change is unavailable because the starting value is zero.' : ''}`;
}
/** Large dated series default to exchange-day groups; users can always request every observation. */
export function seriesTable(input: readonly SeriesPoint[], options: SeriesOptions = {}, group = true, sum = false): ChartTable {
  const points = seriesPoints(input);
  if (options.hidden) return { columns: ['Time', 'Value'], rows: [], note: 'Amounts are hidden. Show balances to read the table.' };
  const grouped = group && points.length > 400 && !options.categorical;
  const format = (n: number) => chartValue(n, options);
  if (!grouped) return { columns: ['Time / category (New York)', options.unit ?? (options.currency ? `Value (${options.currency})` : 'Value')], rows: points.map(p => [p.label ?? chartDate(p.at), format(p.value)]) };
  const days = new Map<string, SeriesPoint[]>();
  for (const p of points) { const day = DAY.format(p.at); const bucket = days.get(day) ?? []; bucket.push(p); days.set(day, bucket); }
  return {
    grouped: true,
    columns: sum ? ['Day (New York)', 'Total', 'Observations'] : ['Day (New York)', 'First', 'Low', 'High', 'Last', 'Observations'],
    rows: [...days].map(([day, ps]) => sum ? [day, format(ps.reduce((n, p) => n + p.value, 0)), String(ps.length)]
      : [day, format(ps[0].value), format(ps.reduce((n, p) => Math.min(n, p.low ?? p.value), Infinity)), format(ps.reduce((n, p) => Math.max(n, p.high ?? p.value), -Infinity)), format(ps.at(-1)!.value), String(ps.length)]),
    note: `Grouped by New York calendar day from ${points.length} observations. ${sum ? 'Totals sum the reported values.' : 'First, last and extremes are retained.'} Choose every observation for exact timestamps.`,
  };
}
export interface Category { label: string; value: number; percent: number }
export function categoryDescription(name: string, categories: readonly Category[], hidden = false): string {
  if (hidden) return `${name}. Amounts are hidden. Show balances to read the allocation.`;
  if (!categories.length || categories.every(p => p.value === 0)) return `${name}. No assets are recorded yet.`;
  return `${name}. ${categories.map(p => `${p.label}: ${chartValue(p.value, { currency: 'USD' })}, ${chartValue(p.percent)} percent`).join('; ')}.`;
}
export function categoryTable(categories: readonly Category[], hidden = false): ChartTable {
  return { columns: ['Asset', 'Value (USD)', 'Share'], rows: hidden ? [] : categories.map(p => [p.label, chartValue(p.value, { currency: 'USD' }), `${chartValue(p.percent)}%`]), note: hidden ? 'Amounts are hidden.' : undefined };
}

export interface Comparison { label: string; value: number }
/** Cross-category returns are comparisons, not a time series trend from one category to another. */
export function comparisonDescription(name: string, values: readonly Comparison[]): string {
  const rows = values.filter(p => Number.isFinite(p.value));
  if (!rows.length) return `${name}. No recorded changes are available yet.`;
  return `${name}. ${rows.map(p => `${p.label}: ${p.value > 0 ? 'up' : p.value < 0 ? 'down' : 'unchanged at'} ${chartValue(Math.abs(p.value), { precision: 2 })} percent`).join('; ')}.`;
}
export function comparisonTable(values: readonly Comparison[]): ChartTable {
  return { columns: ['Category', 'Change today (%)'], rows: values.filter(p => Number.isFinite(p.value)).map(p => [p.label, `${p.value > 0 ? '+' : ''}${chartValue(p.value)}%`]) };
}
