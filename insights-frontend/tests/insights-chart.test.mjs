import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signal } from '@angular/core';
import { component } from './component-helper.mjs';
const { InsightsChart } = await import('../src/app/shared/insights-chart.ts');

function chartWith(t, values) {
  const chart = component(t, InsightsChart);
  // Supply input values through a writable signal for class-level tests.
  // Template input binding and SVG rendering require a browser test fixture.
  chart.points = signal(values.map((value, i) => ({ label: `Point ${i}`, value })));
  return chart;
}

test('empty and zero-valued charts have finite scales and no invalid path coordinates', t => {
  const chart = chartWith(t, []);
  assert.equal(chart.path(), '');
  assert.ok(Number.isFinite(chart.y(0)));
  chart.points.set([{ label: 'Zero', value: 0 }]);
  assert.equal(chart.path(), 'M54,186');
  assert.deepEqual(chart.tickIndices(), [0]);
  assert.doesNotMatch(chart.area(), /NaN|Infinity/);
});

test('chart endpoints span the plot and labels stay unique for short series', t => {
  const chart = chartWith(t, [10, 20]);
  assert.equal(chart.x(0), 54); assert.equal(chart.x(1), 626);
  assert.ok(chart.y(20) < chart.y(10));
  assert.deepEqual(chart.tickIndices(), [0, 1]);
  assert.match(chart.path(), /^M54,.* L626,/);
  assert.match(chart.area(), /L626,186 L54,186 Z$/);
});

test('chart units and path recompute when input values change', t => {
  const chart = chartWith(t, [10, 20]);
  const before = chart.path();
  assert.equal(chart.suffix(), ''); assert.equal(chart.divisor(), 1);
  chart.points.set([{ label: 'Large', value: 2000 }]);
  assert.equal(chart.suffix(), 'K'); assert.equal(chart.divisor(), 1000);
  assert.notEqual(chart.path(), before);
  chart.points.set([{ label: 'Larger', value: 2000000 }]);
  assert.equal(chart.suffix(), 'M'); assert.equal(chart.divisor(), 1000000);
});

test('date labels use the UTC calendar date and preserve non-date labels', t => {
  const chart = chartWith(t, []);
  assert.equal(chart.shortLabel('2026-09-01'), 'Sep 1');
  assert.equal(chart.shortLabel('2026-01-01'), 'Jan 1');
  assert.equal(chart.shortLabel('Week 1'), 'Week 1');
});

test('timed points sit at their real times, so the gaps show how far apart they happened', t => {
  const chart = component(t, InsightsChart);
  chart.points = signal([{ label: 'a', value: 0, at: 0 }, { label: 'b', value: 1, at: 900 }, { label: 'c', value: 2, at: 1000 }]);
  assert.equal(chart.timed(), true);
  assert.equal(chart.x(0), 54);
  assert.equal(chart.x(2), 626);
  assert.ok(Math.abs(chart.x(1) - (54 + 0.9 * 572)) < 1e-9, 'the second point is 90% of the way across, not halfway');
  assert.equal(chart.xAt(500), 54 + 0.5 * 572);
  assert.match(chart.path(), /^M54,[\d.]+ L568\.8\d*,[\d.]+ L568\.8\d*,[\d.]+ L626,/, 'the step rises at the real time');
  assert.equal(chart.anchorAt(54), 'start');
  assert.equal(chart.anchorAt(340), 'middle');
  assert.equal(chart.anchorAt(620), 'end');
  chart.points.set([{ label: 'a', value: 1, at: 5 }, { label: 'b', value: 2 }]);
  assert.equal(chart.timed(), false, 'one point without a time spaces the points evenly');
  assert.equal(chart.x(1), 626);
  chart.points.set([{ label: 'a', value: 1, at: 5 }, { label: 'b', value: 1, at: 5 }]);
  assert.equal(chart.xAt(5), 54, 'two points at the same instant do not divide by zero');
});
