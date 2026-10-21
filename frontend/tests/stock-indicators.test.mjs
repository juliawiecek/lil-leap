import assert from 'node:assert/strict';
import { test } from 'node:test';
import { movingAverage } from '../src/app/stock-indicators.ts';
const bars = [1, 2, 3, 7, 5].map((close, at) => ({ at, open: close, high: close, low: close, close }));
test('SMA uses each rolling window and EMA seeds from a full SMA', () => {
  assert.deepEqual(movingAverage(bars, 3, 'SMA'), [{ at: 2, price: 2 }, { at: 3, price: 4 }, { at: 4, price: 5 }]);
  assert.deepEqual(movingAverage(bars, 3, 'EMA'), [{ at: 2, price: 2 }, { at: 3, price: 4.5 }, { at: 4, price: 4.75 }]);
});
test('insufficient history or invalid periods produce no invented indicator values', () => {
  for (const period of [0, 1, 2.5, NaN, 201, 20]) assert.deepEqual(movingAverage(bars, period, 'SMA'), []);
  assert.deepEqual(movingAverage([], 2, 'EMA'), []);
});
