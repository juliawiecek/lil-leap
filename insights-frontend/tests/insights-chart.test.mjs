import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signal } from '@angular/core';
import { component } from './component-helper.mjs';
const chartModule = await import('../src/app/shared/insights-chart.ts');
const { InsightsChart } = chartModule;

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
  assert.match(chart.path(), /^M54,[\d.]+ C.* 626,[\d.]+$/, 'a smooth curve from the first point to the last');
  assert.match(chart.area(), /L626,186 L54,186 Z$/);
});

test('the curve is smooth but never overshoots: flat stretches stay flat and rises stay between their points', () => {
  const { monotonePath } = chartModule;
  const points = [[0, 100], [10, 100], [20, 60], [30, 60], [40, 10]];
  const segments = monotonePath(points).split(' C').slice(1).map((s) => s.split(' ').map((xy) => xy.split(',').map(Number)));
  assert.equal(segments.length, 4);
  segments.forEach(([c1, c2, end], i) => {
    const [from, to] = [points[i][1], points[i + 1][1]];
    const [low, high] = [Math.min(from, to), Math.max(from, to)];
    for (const [, y] of [c1, c2]) {
      assert.ok(y >= low && y <= high, `segment ${i}: control point y=${y} stays within ${low}..${high}`);
    }
    assert.deepEqual(end, points[i + 1]);
  });
  assert.equal(monotonePath([]), '');
  assert.equal(monotonePath([[5, 5]]), 'M5,5');
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
