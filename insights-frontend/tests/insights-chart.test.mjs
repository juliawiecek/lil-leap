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

test('PS-25 summaries and table values follow the plotted labels, units and updates', t => {
  const chart = chartWith(t, [10, 20]);
  chart.prefix = signal('$');
  assert.match(chart.description(), /rose 100 percent/);
  assert.match(chart.description(), /Point 0.*Point 1/);
  assert.equal(chart.dataTable().rows.length, 2);
  chart.prefix.set('');
  chart.points.set([{ label: '09:00', value: 8 }, { label: '10:00', value: 4 }]);
  assert.match(chart.description(), /fell 50 percent/);
  assert.match(chart.description(), /8 trades on 09:00/);
  assert.deepEqual(chart.dataTable().rows, [['09:00', '8 trades'], ['10:00', '4 trades']]);
  chart.points.set([]);
  assert.match(chart.description(), /No recorded observations/);
  assert.deepEqual(chart.dataTable().rows, []);
});

test('PS-25 large dated counts group by day and every underlying observation remains available', t => {
  const chart = chartWith(t, []);
  chart.prefix = signal('');
  chart.points.set(Array.from({ length: 500 }, (_, i) => ({ label: new Date(Date.UTC(2026, 9, 1) + i * 3600000).toISOString(), value: 2 })));
  assert.match(chart.dataTable().note, /Grouped by New York/);
  assert.equal(chart.allData().rows.length, 500);
  assert.equal(chart.dataTable().rows.reduce((sum, row) => sum + Number(row[1].replace(/[^\d.]/g, '')), 0), 1000);
});

test('unsorted, duplicate and invalid observations share one normalized plot and alternative source', t => {
  const chart = chartWith(t, []);
  chart.points.set([{ label: '2026-10-22', value: 20 }, { label: '2026-10-21', value: 10 }, { label: '2026-10-21', value: 12 }, { label: '2026-10-23', value: NaN }]);
  assert.deepEqual(chart.plotPoints(), [{ label: '2026-10-21', value: 12 }, { label: '2026-10-22', value: 20 }]);
  assert.deepEqual(chart.dataTable().rows.map(row => row[1]), ['$12.00', '$20.00']);
  assert.match(chart.description(), /from \$12\.00 on 2026-10-21 to \$20\.00 on 2026-10-22/);
  assert.doesNotMatch(chart.path(), /NaN|Infinity/);
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
