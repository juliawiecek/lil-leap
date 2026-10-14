import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUY_COLOR, SELL_COLOR, closes, ema, fillMarkers, intervalSeconds, portfolioHistory, rsi, timeframeFor,
  toCandles, toFills, windowChange,
} from '../src/app/chart-data.ts';

const at = minute => Date.UTC(2026, 9, 14, 14, minute) / 1000;
const candle = (minute, open, close, high = Math.max(open, close), low = Math.min(open, close)) =>
  ({ time: at(minute), open, high, low, close });

test('period buttons map to candle widths, defaulting to one trading day', () => {
  assert.deepEqual(timeframeFor('1D'), { interval: '1m', limit: 390 });
  assert.deepEqual(timeframeFor('1W'), { interval: '15m', limit: 130 });
  assert.deepEqual(timeframeFor('ALL'), { interval: '1d', limit: 500 });
  assert.deepEqual(timeframeFor('unknown'), { interval: '1m', limit: 390 });
  assert.equal(intervalSeconds('1h'), 3600);
});

test('toCandles converts strings to numbers, sorts oldest first and drops malformed rows', () => {
  const rows = [
    { time: '2026-10-14T14:01:00Z', open: '2', high: '3', low: '1', close: '2.5' },
    { time: '2026-10-14T14:00:00Z', open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 'not a time', open: 1, high: 1, low: 1, close: 1 },
    { time: '2026-10-14T14:02:00Z', open: 'x', high: 1, low: 1, close: 1 },
  ];
  assert.deepEqual(toCandles(rows), [candle(0, 1, 1.5, 2, 0.5), candle(1, 2, 2.5, 3, 1)]);
});

test('closes and windowChange describe the charted window', () => {
  const candles = [candle(0, 100, 101), candle(1, 101, 99), candle(2, 99, 110)];
  assert.deepEqual(closes(candles).map(p => p.value), [101, 99, 110]);
  assert.deepEqual(windowChange(candles), { amount: 10, percent: 10 });
  assert.equal(windowChange([]), null);
  assert.equal(windowChange([candle(0, 0, 1)]), null);
});

test('ema seeds with the simple average and then weights recent values', () => {
  const points = [1, 2, 3, 4, 5].map((value, i) => ({ time: i, value }));
  const result = ema(points, 3);
  assert.deepEqual(result.map(p => p.time), [2, 3, 4]);
  assert.equal(result[0].value, 2);
  assert.equal(result[1].value, 3);
  assert.equal(result[2].value, 4);
  assert.deepEqual(ema(points, 6), []);
});

test('rsi is 100 on a steady rise, 0 on a steady fall and 50 when gains equal losses', () => {
  const series = values => values.map((value, i) => ({ time: i, value }));
  assert.deepEqual(rsi(series([1, 2, 3, 4]), 3).map(p => p.value), [100]);
  assert.deepEqual(rsi(series([4, 3, 2, 1]), 3).map(p => p.value), [0]);
  // Equal average gain and loss gives 50; Wilder smoothing then moves it: +1 -> 75, -1 -> 37.5.
  assert.deepEqual(rsi(series([1, 2, 1, 2, 1]), 2).map(p => p.value), [50, 75, 37.5]);
  assert.deepEqual(rsi(series([1, 2]), 14), []);
});

test('toFills keeps only filled orders, oldest first', () => {
  const rows = [
    { orderId: 'b', symbol: 'MSFT', side: 'sell', quantity: 2, status: 'FILLED', submittedAt: '', fillPrice: 505, filledQuantity: 2, filledAt: '2026-10-14T14:05:00Z' },
    { orderId: 'a', symbol: 'AAPL', side: 'BUY', quantity: 10, status: 'FILLED', submittedAt: '', fillPrice: 220, filledQuantity: null, filledAt: '2026-10-14T14:01:30Z' },
    { orderId: 'c', symbol: 'NVDA', side: 'BUY', quantity: 1, status: 'REJECTED', submittedAt: '', fillPrice: null, filledQuantity: null, filledAt: null },
  ];
  assert.deepEqual(toFills(rows), [
    { symbol: 'AAPL', side: 'BUY', quantity: 10, price: 220, time: at(1) + 30 },
    { symbol: 'MSFT', side: 'SELL', quantity: 2, price: 505, time: at(5) },
  ]);
});

test('fillMarkers snaps fills to their bar and skips other symbols and bars outside the chart', () => {
  const candles = [candle(0, 1, 1), candle(1, 1, 1), candle(2, 1, 1)];
  const fills = [
    { symbol: 'AAPL', side: 'BUY', quantity: 10, price: 220, time: at(1) + 45 },
    { symbol: 'AAPL', side: 'SELL', quantity: 3, price: 230.5, time: at(2) },
    { symbol: 'MSFT', side: 'BUY', quantity: 1, price: 500, time: at(1) },
    { symbol: 'AAPL', side: 'BUY', quantity: 1, price: 200, time: at(9) },
  ];
  assert.deepEqual(fillMarkers(fills, 'AAPL', candles, '1m'), [
    { time: at(1), position: 'belowBar', shape: 'arrowUp', color: BUY_COLOR, text: 'Buy 10 @ 220.00' },
    { time: at(2), position: 'aboveBar', shape: 'arrowDown', color: SELL_COLOR, text: 'Sell 3 @ 230.50' },
  ]);
  assert.deepEqual(fillMarkers(fills, 'AAPL', [], '1m'), []);
});

test('portfolioHistory undoes later fills so each bar shows what was actually held', () => {
  const candles = new Map([['AAPL', [candle(0, 100, 100), candle(1, 100, 110), candle(2, 110, 120)]]]);
  // Today: 10 AAPL and $1,000 cash, after buying the 10 shares at $105 during minute 1.
  const fills = [{ symbol: 'AAPL', side: 'BUY', quantity: 10, price: 105, time: at(1) + 20 }];
  const history = portfolioHistory(candles, new Map([['AAPL', 10]]), 1000, fills, '1m');
  assert.deepEqual(history.map(p => p.value), [
    2050, // before the buy: 1,000 + 1,050 cash, no shares
    2100, // after the buy at minute 1's close (110): 1,000 + 10 x 110
    2200, // minute 2 close 120
  ]);
});

test('portfolioHistory prices a holding with no earlier bar at its first open, and skips unpriced symbols', () => {
  const candles = new Map([['AAPL', [candle(0, 100, 100)]], ['MSFT', [candle(1, 50, 60)]]]);
  const history = portfolioHistory(candles, new Map([['AAPL', 1], ['MSFT', 2], ['NVDA', 5]]), 0, [], '1m');
  assert.deepEqual(history, [
    { time: at(0), value: 100 + 2 * 50 },
    { time: at(1), value: 100 + 2 * 60 },
  ]);
});
