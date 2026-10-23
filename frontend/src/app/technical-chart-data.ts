import { chartDate, chartValue, type ChartTable } from '../../../shared/chart-description';
import type { PricePoint } from './market-feed-api';
import type { TradeMark } from './trade-marks';
import type { Indicator } from './technical-chart-math';

export function describeTrades(trades: readonly TradeMark[], last: number | undefined, cost: number | null, hidden = false): string {
  if (hidden) return 'Your trade details and average cost are hidden.';
  const recorded = trades.filter(t => Number.isFinite(t.at) && Number.isFinite(t.quantity) && t.quantity > 0 && Number.isFinite(t.price));
  const lines = recorded.slice(-3).map(t => `You ${t.side === 'BUY' ? 'bought' : 'sold'} ${t.quantity} ${t.quantity === 1 ? 'share' : 'shares'} on ${chartDate(t.at)} at ${chartValue(t.price, { currency: 'USD' })}.`);
  if (recorded.length > 3) lines.unshift(`${recorded.length} trades are recorded in this view; the latest three follow. The table includes every trade.`);
  if (last !== undefined && cost !== null && Number.isFinite(cost)) lines.push(`The latest price is ${last > cost ? 'above' : last < cost ? 'below' : 'equal to'} your average cost of ${chartValue(cost, { currency: 'USD' })}.`);
  return lines.join(' ');
}

/** OHLC, indicator values, missing-volume states and every visible trade share the plotted source. */
export function technicalTable(points: readonly PricePoint[], series: readonly Indicator[], trades: readonly TradeMark[], group = true, hidden = false, averageCost: number | null = null): ChartTable {
  const grouped = group && points.length > 400;
  const buckets = new Map<string, PricePoint[]>();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  for (const [index, p] of points.entries()) { const key = grouped ? day.format(p.at) : String(index); const ps = buckets.get(key) ?? []; ps.push(p); buckets.set(key, ps); }
  const number = (n: number | null | undefined) => n !== null && n !== undefined && Number.isFinite(n) ? chartValue(n, { precision: 4 }) : 'Unavailable';
  const values = series.map(s => new Map(s.points.map(p => [p.at, p.price])));
  const includedTrades = new Set<TradeMark>();
  const rows = [...buckets].map(([key, ps]) => {
    const first = ps[0], last = ps.at(-1)!;
    const bars = ps.flatMap(p => p.candle ? [p.candle] : []);
    const complete = bars.length === ps.length;
    const volumes = bars.map(b => b.volume);
    const matches = trades.filter(t => t.at >= first.at && t.at <= last.at && !includedTrades.has(t));
    for (const trade of matches) includedTrades.add(trade);
    return [grouped ? key : chartDate(first.at), number(complete ? bars[0].open : null),
      number(complete ? Math.max(...bars.map(b => b.high)) : null), number(complete ? Math.min(...bars.map(b => b.low)) : null),
      number(last.price), ...values.map(v => number(v.get(last.at))),
      number(complete && volumes.every(v => v !== null) ? volumes.reduce((a, b) => a! + b!, 0) : null),
      hidden ? 'Hidden' : matches.map(t => `${t.side === 'BUY' ? 'Bought' : 'Sold'} ${t.quantity} at ${chartValue(t.price, { currency: 'USD' })} on ${chartDate(t.at)}`).join('; ') || 'None',
    ];
  });
  // Fills can occur between price observations. Include them explicitly rather than rounding
  // their times or silently omitting markers that do not coincide with an OHLC close.
  if (!hidden) for (const t of trades) {
    if (includedTrades.has(t)) continue;
    rows.push([chartDate(t.at), 'Not a price observation', '', '', '', ...series.map(() => ''), '', `${t.side === 'BUY' ? 'Bought' : 'Sold'} ${t.quantity} at ${chartValue(t.price, { currency: 'USD' })}`]);
  }
  return { grouped, columns: ['Time (New York)', 'Open (USD)', 'High (USD)', 'Low (USD)', 'Close / price (USD)', ...series.map(s => `${s.name} (USD)`), 'Reported volume (shares)', 'Your trades'], rows,
    references: !hidden && averageCost !== null && Number.isFinite(averageCost) ? [{ label: 'Average cost reference', value: chartValue(averageCost, { currency: 'USD' }) }] : [],
    note: grouped ? `Grouped by New York day from ${points.length} observations. Open is first, high/low retain extremes, close and indicators are last, and volume is summed only when every bar reports it. Trade times are preserved. Choose every observation for exact prices.` : 'Unavailable means the feed did not provide OHLC/volume or the indicator has insufficient data. Trades between observations have their own rows.' };
}

/** Volume bars may aggregate several observations. Preserve missing bars and their intervals. */
export function volumeTable(points: readonly PricePoint[], aggregated = false): ChartTable {
  return {
    grouped: aggregated,
    columns: ['Bar start (New York)', 'Bar end (New York)', 'Reported volume (shares)'],
    rows: points.map(p => [chartDate(p.candle?.time ?? p.at), chartDate(p.at),
      p.candle?.volume !== null && p.candle?.volume !== undefined && Number.isFinite(p.candle.volume)
        ? chartValue(p.candle.volume, { unit: 'shares' }) : 'Unavailable']),
    note: aggregated
      ? 'Displayed bars combine consecutive observations. Volume is summed only when every observation reports it. Choose every observation for the original timestamps and values.'
      : 'Unavailable means the feed did not report volume. Zero means a reported volume of zero.',
  };
}
