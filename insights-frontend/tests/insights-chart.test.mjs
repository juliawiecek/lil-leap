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

test('empty and single-point charts have finite coordinates', t => {
  const chart = chartWith(t, []);
  assert.equal(chart.path(), '');
  assert.ok(Number.isFinite(chart.y(0)));
  assert.equal(chart.last(), 0);
  chart.points.set([{ label: 'Zero', value: 0 }]);
  assert.equal(chart.path(), 'M10,210', 'a lone zero sits on the floor, inside the padding');
  assert.ok(Number.isFinite(chart.startY()));
});

test('the line runs in straight segments across the full width, higher values higher up', t => {
  const chart = chartWith(t, [10, 20, 15]);
  assert.equal(chart.x(0), 10);
  assert.equal(chart.x(2), 630);
  assert.ok(chart.y(20) < chart.y(15) && chart.y(15) < chart.y(10));
  assert.match(chart.path(), /^M10,[\d.]+ L320,[\d.]+ L630,[\d.]+$/);
  assert.ok(chart.y(20) > 10, 'the highest point keeps some headroom below the top');
});

test('the dotted line marks the starting value, and a falling series turns red', t => {
  const rising = chartWith(t, [0, 4, 9]);
  assert.equal(rising.startY(), rising.y(0));
  assert.equal(rising.falling(), false);
  assert.equal(rising.last(), 9);
  const falling = chartWith(t, [9, 4, 2]);
  assert.equal(falling.startY(), falling.y(9));
  assert.equal(falling.falling(), true);
  assert.equal(chartWith(t, [5, 5]).falling(), false, 'level counts as not falling');
});

test('the path recomputes when the values change', t => {
  const chart = chartWith(t, [10, 20]);
  const before = chart.path();
  chart.points.set([{ label: 'a', value: 2000 }, { label: 'b', value: 100 }]);
  assert.notEqual(chart.path(), before);
  assert.doesNotMatch(chart.path(), /NaN|Infinity/);
});
