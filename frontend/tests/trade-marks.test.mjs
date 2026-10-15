import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { AdvancedDashboard, AVERAGE_COST_COLOR } = await import('../src/app/advanced-dashboard.ts');
const { tradeMarks } = await import('../src/app/trade-marks.ts');

const NOW = Date.parse('2026-10-14T16:00:00Z');
const row = (side, quantity, fillPrice, filledAt, extra = {}) => ({
  orderId: `${side}-${filledAt}`, symbol: 'AAPL', side, quantity, status: 'FILLED',
  submittedAt: filledAt, fillPrice, filledQuantity: quantity, filledAt, ...extra,
});
// Bought twice and sold once today, plus orders that must not be drawn.
const HISTORY = [
  row('BUY', 10, 220, '2026-10-14T13:40:00Z'),
  row('BUY', 10, 230, '2026-10-14T14:10:00Z'),
  row('SELL', 5, 233.5, '2026-10-14T15:02:00Z'),
  row('BUY', 3, 400, '2026-10-14T15:10:00Z', { symbol: 'MSFT' }),
  row('BUY', 2, null, '2026-10-14T15:20:00Z', { status: 'REJECTED', filledAt: null }),
];

test('fills become markers with a plain tooltip; other stocks and unfilled orders are left out', () => {
  const marks = tradeMarks(HISTORY, 'AAPL', 'en-GB');
  assert.deepEqual(marks.map((m) => [m.side, m.quantity, m.price]), [['BUY', 10, 220], ['BUY', 10, 230], ['SELL', 5, 233.5]]);
  assert.match(marks[2].label, /^Sold 5 @ \$233\.50 · 14 Oct,? \d\d:\d\d$/);
  assert.match(marks[0].label, /^Bought 10 @ \$220\.00 · /);
});

// One-minute bars on 14 Oct, in UTC seconds like the candles endpoint.
const minute = (hour, min) => Date.UTC(2026, 9, 14, hour, min) / 1000;
const bars = (from, count) => Array.from({ length: count }, (_, i) =>
  ({ time: from + i * 60, open: 225, high: 236, low: 219, close: 225 + (i % 7) - 3 }));
const flush = () => new Promise(resolve => setImmediate(resolve));

/** An advanced desk charting AAPL, whose candle requests return the given bars. */
function chartDesk(t, candles) {
  const desk = component(t, AdvancedDashboard, [feedProvider(fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 235 }]))]);
  const requests = [];
  desk.marketData = { candles: async (instrumentId, timeframe) => { requests.push({ instrumentId, timeframe }); return candles; } };
  return { desk, requests };
}

test('a client who bought twice and sold once sees three arrows and an average-cost line matching the holding', async t => {
  const { desk, requests } = chartDesk(t, bars(minute(13, 30), 150));
  desk.historyRows.set(HISTORY);
  // The holding after those fills: 15 shares at an average cost of 225.
  desk.applyPortfolio({ cash: 1000, holdings: [{ instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple', quantity: 15, averageCost: 225 }] });
  await desk.refreshChart();
  assert.deepEqual(requests.at(-1), { instrumentId: 'aapl-uuid', timeframe: { interval: '1m', limit: 390 } });
  const chart = desk.priceChart();
  assert.equal(chart.kind, 'candles');
  assert.equal(chart.key, 'AAPL-1D');
  assert.equal(chart.data.length, 150);
  assert.deepEqual(chart.markers.map((m) => [m.shape, m.time]),
    [['arrowUp', minute(13, 40)], ['arrowUp', minute(14, 10)], ['arrowDown', minute(15, 2)]]);
  assert.deepEqual(chart.priceLines, [{ price: 225, color: AVERAGE_COST_COLOR, title: 'Avg cost' }]);
  assert.equal(desk.tradesOutsidePeriod(), 0);
  assert.equal(desk.chartStatus(), '');
});

test('fills before the first bar are counted, not drawn, and without a holding there is no average-cost line', async t => {
  const { desk } = chartDesk(t, bars(minute(14, 0), 120));
  desk.historyRows.set(HISTORY);
  await desk.refreshChart();
  assert.equal(desk.priceChart().markers.length, 2);
  assert.equal(desk.tradesOutsidePeriod(), 1);
  assert.equal(desk.averageCost(), null);
  assert.deepEqual(desk.priceChart().priceLines, []);
});

test('the EMA legend and RSI pane come from the bars, and stay empty until there are enough of them', async t => {
  const { desk } = chartDesk(t, bars(minute(9, 0), 30));
  await desk.refreshChart();
  assert.deepEqual(desk.indicators().ema50, null);
  assert.equal(desk.priceChart().overlays[0].data.length, 0);
  desk.marketData = { candles: async () => bars(minute(9, 0), 250) };
  await desk.refreshChart();
  const { ema50, ema200, rsi } = desk.indicators();
  assert.ok(ema50 > 219 && ema50 < 236 && ema200 > 219 && ema200 < 236);
  assert.ok(rsi >= 0 && rsi <= 100);
  assert.deepEqual(desk.rsiChart().range, { min: 0, max: 100 });
  assert.equal(desk.priceChart().overlays[1].data.length, 51);
});

test('switching period reloads that timeframe; a stale answer is dropped and a failure says it will retry', async t => {
  const { desk, requests } = chartDesk(t, bars(minute(13, 30), 10));
  desk.selectPeriod('1W');
  await flush();
  assert.deepEqual(requests.at(-1).timeframe, { interval: '15m', limit: 130 });
  assert.equal(desk.priceCandles().length, 10);

  desk.marketData = { candles: async () => { desk.period.set('1M'); return bars(minute(13, 30), 3); } };
  await desk.refreshChart();
  assert.equal(desk.priceCandles().length, 10, 'bars for a period the user left are not shown');

  desk.marketData = { candles: async () => { throw new Error('down'); } };
  await desk.refreshChart();
  assert.match(desk.chartStatus(), /Could not load the chart/);
});

test('the chart type switch draws the same bars as candles, a close-price line or an area', async t => {
  const { desk } = chartDesk(t, bars(minute(13, 30), 150));
  desk.historyRows.set(HISTORY);
  await desk.refreshChart();
  assert.equal(desk.chartType(), 'Candles');
  assert.equal(desk.priceChart().kind, 'candles');
  desk.chartType.set('Line');
  const line = desk.priceChart();
  assert.equal(line.kind, 'line');
  assert.deepEqual(line.data[0], { time: minute(13, 30), value: 222 });
  assert.equal(line.markers.length, 3, 'your trades stay marked on a line chart');
  desk.chartType.set('Area');
  assert.equal(desk.priceChart().kind, 'area');
  assert.equal(desk.priceChart().data.length, 150);
});
