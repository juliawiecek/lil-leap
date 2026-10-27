import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { tradeMarks, periodWindow, priceRange, priceY, plotMarks, timeLabels, priceLabels } = await import('../src/app/trade-marks.ts');

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

test('a client who bought twice and sold once has an average cost matching the holding', t => {
  const desk = component(t, AdvancedDashboard, [feedProvider(fakeFeed([{ symbol: 'AAPL', name: 'Apple Inc.', price: 235 }]))]);
  desk.currentTime.set(new Date(NOW));
  desk.historyRows.set(HISTORY);
  // The holding after those fills: 15 shares at an average cost of 225.
  desk.applyPortfolio({ cash: 1000, holdings: [{ instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple', quantity: 15, averageCost: 225 }] });
  assert.equal(desk.selected().symbol, 'AAPL');
  assert.deepEqual(desk.tradeMarks().map((m) => m.side), ['BUY', 'BUY', 'SELL']);
  assert.equal(desk.averageCost(), 225);
});

test('without a holding there is no average-cost line', t => {
  const desk = component(t, AdvancedDashboard, [feedProvider(fakeFeed([{ symbol: 'AAPL', price: 235 }]))]);
  desk.historyRows.set([]);
  assert.equal(desk.averageCost(), null);
});

test('periods, scales and labels map trades onto the chart', () => {
  const marks = tradeMarks(HISTORY, 'AAPL');
  assert.deepEqual(periodWindow('1D', NOW), { start: NOW - 86400000, end: NOW });
  assert.deepEqual(periodWindow('ALL', NOW, marks), { start: NOW - 86400000, end: NOW }, 'at least a day is shown');
  assert.equal(periodWindow('ALL', NOW, [{ ...marks[0], at: NOW - 40 * 86400000 }]).start, NOW - 40 * 86400000);
  assert.equal(periodWindow('ALL', NOW).start, NOW - 30 * 86400000);
  assert.deepEqual(priceRange([200, 0, Number.NaN, 250]), { low: 196, high: 255 });
  assert.equal(priceRange([0]), null);
  const range = { low: 100, high: 200 };
  assert.equal(priceY(200, range, 160), 0);
  assert.equal(priceY(100, range, 160), 160);
  const plotted = plotMarks([{ ...marks[0], at: NOW - 43200000, price: 150 }], periodWindow('1D', NOW), range, 824, 160);
  assert.deepEqual(plotted.map((m) => [m.x, m.y]), [[412, 80]]);
  assert.deepEqual(priceLabels(range), [200, 175, 150, 125, 100]);
  assert.equal(timeLabels('1D', periodWindow('1D', NOW), 'en-GB').length, 7);
  assert.match(timeLabels('1W', periodWindow('1W', NOW), 'en-GB')[0], /^[A-Z][a-z]{2}$/);
  assert.match(timeLabels('1M', periodWindow('1M', NOW), 'en-GB')[6], /^14 Oct$/);
});
