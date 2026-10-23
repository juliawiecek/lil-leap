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

test('the line is a smooth curve across the full width that never overshoots a point, higher values higher up', t => {
  const chart = chartWith(t, [10, 20, 15]);
  assert.equal(chart.x(0), 10);
  assert.equal(chart.x(2), 630);
  assert.ok(chart.y(20) < chart.y(15) && chart.y(15) < chart.y(10));
  assert.match(chart.path(), /^M10,[\d.]+ C[\d., ]+ C[\d., ]+$/);
  assert.ok(chart.path().endsWith(`630,${Math.round(chart.y(15) * 100) / 100}`));
  const controlYs = [...chart.path().matchAll(/C([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/g)].flatMap(m => [Number(m[2]), Number(m[4])]);
  assert.ok(controlYs.every(y => y >= chart.y(20) - 0.01), 'no bend rises above the highest point');
  assert.ok(chart.y(20) > 10, 'the highest point keeps some headroom below the top');
});

test('the fill closes the line down to the bottom edge', t => {
  const chart = chartWith(t, [1, 3]);
  assert.match(chart.areaPath(), /^M10,.* L630,220 L10,220 Z$/);
  assert.equal(chartWith(t, [4]).areaPath(), '', 'one point has no area');
});

test('pointing anywhere picks the nearest point, and the arrow keys step along the line', t => {
  const chart = chartWith(t, [1, 2, 3, 4, 5]);
  const svg = { getBoundingClientRect: () => ({ left: 100, width: 640 }) };
  chart.scrubAt({ currentTarget: svg, clientX: 100 + 330 });
  assert.equal(chart.active(), 2);
  chart.scrubAt({ currentTarget: svg, clientX: 0 });
  assert.equal(chart.active(), 0, 'left of the chart clamps to the first point');
  chart.scrubAt({ currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 0 }) }, clientX: 5 });
  assert.equal(chart.active(), 0, 'a chart with no width is ignored');
  chart.active.set(null);
  const key = (name) => { let stopped = false; chart.scrubKey({ key: name, preventDefault: () => { stopped = true; } }); return stopped; };
  assert.equal(key('ArrowLeft'), true);
  assert.equal(chart.active(), 3, 'the first arrow starts from the latest point');
  key('Home'); assert.equal(chart.active(), 0);
  key('ArrowLeft'); assert.equal(chart.active(), 0, 'stays on the line');
  key('End'); key('ArrowRight'); assert.equal(chart.active(), 4);
  assert.deepEqual(chart.activeSpot(), { x: 630, y: chart.y(5) });
  assert.equal(chart.labelLeft(), 630 / 640 * 100);
  assert.equal(key('Tab'), false, 'other keys pass through');
  key('Escape'); assert.equal(chart.active(), null);
  assert.equal(chart.labelLeft(), 0);
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
