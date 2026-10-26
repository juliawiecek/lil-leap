import './component-helper.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresets, riskQuantity } from '../src/app/order-presets.ts';

test('risk sizing floors quantities, respects capacity and reverses stop direction for sells', () => {
  assert.equal(riskQuantity(100, 50, 47, 'Buy', 1000), 33);
  assert.equal(riskQuantity(100, 50, 47, 'Buy', 12), 12);
  assert.equal(riskQuantity(100, 50, 53, 'Sell', 20), 20);
  for (const stop of [50, 51, 0, NaN]) assert.equal(riskQuantity(100, 50, stop, 'Buy', 20), 0);
  assert.equal(riskQuantity(2, 50, 47, 'Buy', 20), 0);
  assert.equal(riskQuantity(Infinity, 50, 47, 'Buy', 20), 0);
});

test('preset storage ignores corrupt, unbounded and duplicate entries', () => {
  const preset = { name: 'Swing', orderType: 'LIMIT', quantity: 10, tolerance: 2, profitPercent: 5, stopPercent: 2, riskBudget: 100 };
  assert.deepEqual(parsePresets('invalid'), []);
  assert.deepEqual(parsePresets('{}'), []);
  assert.deepEqual(parsePresets(JSON.stringify([null, preset, preset, { ...preset, stopPercent: -1 }, { ...preset, quantity: 1.5 }])), [preset]);
  assert.equal(parsePresets(JSON.stringify(Array.from({ length: 20 }, (_, n) => ({ ...preset, name: String(n) })))).length, 10);
});
