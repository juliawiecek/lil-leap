import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayInterval, overviewPoints, quoteCandles } from '../src/app/stock-chart-display.ts';

test('quote candles retain actual OHLC, interval gaps, flat and single quotes without editing history', () => {
  const points = [
    { time: 120, price: 100 }, { time: 125, price: 105 },
    { time: 130, price: 95 }, { time: 150, price: 102 },
    { time: 180, price: 102 }, { time: 185, price: 99 },
    { time: 300, price: 101 },
  ];
  const original = structuredClone(points);
  assert.deepEqual(quoteCandles(points, 60), [
    { time: 120, endTime: 150, open: 100, high: 105, low: 95, close: 102 },
    { time: 180, endTime: 185, open: 102, high: 102, low: 99, close: 99 },
    { time: 300, endTime: 300, open: 101, high: 101, low: 101, close: 101 },
  ]);
  assert.deepEqual(points, original);
  assert.deepEqual(quoteCandles([], 60), []);
  assert.deepEqual(overviewPoints([], 60), []);
  assert.deepEqual(overviewPoints(points, 60), [points[0], points[3], points[5], points[6]]);
});

test('adaptive intervals limit clutter at desktop and mobile widths, and overview retains endpoints', () => {
  const points = Array.from({ length: 1000 }, (_, i) => ({ time: 120 + i * 2, price: 100 + Math.sin(i) }));
  for (const width of [280, 600, 1200]) {
    const interval = displayInterval(2000, width);
    const display = overviewPoints(points, interval);
    assert.ok(display.length <= Math.min(100, width / 10) + 2);
    assert.deepEqual(display[0], points[0]);
    assert.deepEqual(display.at(-1), points.at(-1));
    assert.ok(display.every(p => points.some(raw => raw.time === p.time && raw.price === p.price)));
  }
});
