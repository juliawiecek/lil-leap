import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Subject } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
const { samplePrices, samplingInterval } = await import('../src/app/stock-chart-stream.ts');
const {
  chartPaths,
  smoothPricePath,
  mapX,
  mapY,
  nearestPoint,
  normalizeHistory,
  performancePalette,
  priceDomain,
  reducePoints,
} = await import('../src/app/stock-chart-math.ts');
const box = { left: 10, right: 110, top: 20, bottom: 120 },
  range = { from: 100, to: 200, min: 90, max: 110, reveal: 200 };
test('sampling emits the actual latest price and timestamp, rejects late/invalid data, and leaves raw ticks live', () => {
  const scheduler = new TestScheduler(() => {}),
    source = new Subject(),
    raw = [],
    sampled = [];
  scheduler.run(() => {
    source.subscribe((value) => raw.push(value));
    const sub = source.pipe(samplePrices(5000)).subscribe((value) => sampled.push(value));
    scheduler.schedule(() => source.next({ time: 100.123, price: 100 }), 0);
    scheduler.schedule(() => source.next({ time: 104.456, price: 104 }), 4500);
    scheduler.schedule(() => source.next({ time: 103, price: 999 }), 4600);
    scheduler.schedule(() => source.next({ time: 105, price: NaN }), 4700);
    scheduler.schedule(() => source.next({ time: 109, price: 98 }), 9000);
    scheduler.schedule(() => sub.unsubscribe(), 11000);
  });
  assert.equal(raw.length, 5);
  assert.deepEqual(sampled, [
    { time: 104.456, price: 104 },
    { time: 109, price: 98 },
  ]);
  assert.equal(samplingInterval(10000), 10000);
  assert.throws(() => samplingInterval(1000), RangeError);
});
test('neutral performance is green; down/up colors always derive from the official open', () => {
  assert.equal(performancePalette(100, 100).line, '#22c55e');
  assert.equal(performancePalette(99, 100).line, '#ef4444');
  assert.equal(performancePalette(101, 100).top, 'rgba(34, 197, 94, 0.3)');
  assert.equal(performancePalette(102, null).line, '#94a3b8');
});
test('time coordinates respect irregular spacing and line/area paths share exact vertices', () => {
  assert.equal(mapX(125, range, box), 35);
  assert.equal(mapY(100, range, box), 70);
  const points = [
    { time: 100, price: 90 },
    { time: 125, price: 110 },
    { time: 200, price: 100 },
  ];
  const paths = chartPaths(points, range, box);
  assert.equal(paths.line, 'M10,120 C18.333,86.667 26.667,20 35,20 C60,20 85,53.333 110,70');
  assert.equal(paths.area, paths.line + ' L110,120 L10,120 Z');
  assert.deepEqual(chartPaths([], range, box), { line: '', area: '' });
});
test('flat/single/descending prices yield finite padded paths without invented overshoots', () => {
  for (const prices of [[100], [100, 100, 100], [110, 100, 90]]) {
    const points = prices.map((price, i) => ({ time: 100 + i * 20, price }));
    const domain = priceDomain(points);
    assert.ok(domain.min < Math.min(...prices) && domain.max > Math.max(...prices));
    const paths = chartPaths(points, { ...range, ...domain }, box);
    assert.doesNotMatch(paths.line, /NaN|Infinity/);
  }
});
test('pixel reduction keeps significant highs/lows and endpoints without mutating source history', () => {
  const points = Array.from({ length: 10000 }, (_, i) => ({
    time: 100 + i / 100,
    price: i === 421 ? 200 : i === 422 ? 50 : 100 + Math.sin(i),
  }));
  const copy = structuredClone(points),
    reduced = reducePoints(points, range, 40);
  assert.ok(reduced.length <= 164);
  assert.ok(reduced.some((p) => p.price === 200));
  assert.ok(reduced.some((p) => p.price === 50));
  assert.equal(reduced[0], points[0]);
  assert.equal(reduced.at(-1), points.at(-1));
  assert.deepEqual(points, copy);
  assert.equal(nearestPoint(points, 104.21).price, 200);
});
test('history normalization preserves real time precision and handles duplicates and invalid data', () => {
  const source = [
    { time: 2.25, price: 100 },
    { time: 1, price: 101 },
    { time: 2.25, price: 102 },
    { time: 3, price: -1 },
  ];
  assert.deepEqual(normalizeHistory(source), [
    { time: 1, price: 101 },
    { time: 2.25, price: 102 },
  ]);
  assert.equal(source.length, 4);
});

test('monotone smoothing passes through every observation without price overshoot', () => {
  const points = [
    { x: 0, y: 100 },
    { x: 2, y: 40 },
    { x: 37, y: 110 },
    { x: 200, y: 110 },
    { x: 201, y: 30 },
  ];
  const path = smoothPricePath(points),
    segments = [...path.matchAll(/C([^CML]+)/g)];
  assert.equal(segments.length, points.length - 1);
  segments.forEach((match, index) => {
    const coordinates = match[1].trim().split(/[ ,]+/).map(Number);
    const a = points[index],
      b = points[index + 1];
    assert.deepEqual(coordinates.slice(-2), [b.x, b.y]);
    for (let step = 0; step <= 100; step++) {
      const t = step / 100,
        u = 1 - t;
      const y =
        u * u * u * a.y +
        3 * u * u * t * coordinates[1] +
        3 * u * t * t * coordinates[3] +
        t * t * t * b.y;
      assert.ok(y >= Math.min(a.y, b.y) - 1e-9 && y <= Math.max(a.y, b.y) + 1e-9);
    }
  });
});
