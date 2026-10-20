import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { StockChartViewport } = await import('../src/app/stock-chart-viewport.ts');
const START = 1_700_000_000;
function chart(t, reduced = false, seconds = 60) {
  let now = 0,
    id = 0,
    last;
  const frames = new Map();
  t.mock.method(globalThis, 'requestAnimationFrame', (callback) => {
    frames.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, 'cancelAnimationFrame', (frame) => frames.delete(frame));
  t.mock.method(performance, 'now', () => now);
  const viewport = new StockChartViewport(
    (points, range) => {
      last = { points: [...points], range };
    },
    seconds,
    () => reduced,
  );
  t.after(() => viewport.destroy());
  return {
    viewport,
    frames,
    get last() {
      return last;
    },
    frame(time) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
  };
}
// Node has no native frame scheduler; tests drive every frame explicitly.
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
test('both viewport edges and Y scale ease smoothly while true historical values are untouched', (t) => {
  const c = chart(t);
  c.viewport.append({ time: START, price: 100 });
  const first = c.last.range;
  c.viewport.append({ time: START + 5, price: 102 });
  c.frame(120);
  assert.equal(c.last.range.from, first.from + 2.5);
  assert.equal(c.last.range.to, first.to + 2.5);
  assert.equal(c.last.range.reveal, START + 2.5);
  assert.equal(c.last.range.to - c.last.range.from, 60);
  assert.deepEqual(c.last.points, [
    { time: START, price: 100 },
    { time: START + 5, price: 102 },
  ]);
  c.frame(240);
  assert.equal(c.last.range.to, first.to + 5);
  assert.equal(c.frames.size, 0);
});
test('history preserves fractional timestamps, gaps and extrema; late/invalid live ticks cannot rewrite it', (t) => {
  const c = chart(t);
  c.viewport.setHistory([
    { time: START + 10.123, price: 103 },
    { time: START, price: 100 },
    { time: START + 5, price: 90 },
  ]);
  assert.deepEqual(
    c.last.points.map((p) => p.time),
    [START, START + 5, START + 10.123],
  );
  assert.ok(c.last.range.min < 90 && c.last.range.max > 103);
  const last = c.last;
  c.viewport.append({ time: START + 1, price: 200 });
  c.viewport.append({ time: START + 20, price: NaN });
  assert.equal(c.last, last);
});
test('inspection freezes prices and range, then resumes from the current viewport', (t) => {
  const c = chart(t);
  c.viewport.append({ time: START, price: 100 });
  c.viewport.pause();
  const old = c.last;
  c.viewport.append({ time: START + 5, price: 101 });
  c.frame(240);
  assert.equal(c.last, old);
  c.viewport.resume();
  c.frame(480);
  assert.equal(c.last.points.at(-1).price, 101);
  assert.equal(c.last.range.to, old.range.to + 5);
});
test('reduced motion commits immediately; clearing an asset removes its old viewport', (t) => {
  const c = chart(t, true);
  c.viewport.append({ time: START, price: 100 });
  c.viewport.append({ time: START + 5, price: 99 });
  assert.equal(c.frames.size, 0);
  c.viewport.setHistory([]);
  c.viewport.append({ time: START + 100, price: 200 });
  assert.equal(c.last.points.length, 1);
  assert.ok(c.last.range.min > 190);
});
test('cancellation, destruction, and input validation', (t) => {
  const c = chart(t);
  assert.throws(() => c.viewport.setWindowSeconds(0), RangeError);
  c.viewport.append({ time: START, price: 100 });
  c.viewport.append({ time: START + 5, price: 101 });
  assert.equal(c.frames.size, 1);
  c.viewport.destroy();
  assert.equal(c.frames.size, 0);
  const last = c.last;
  c.viewport.append({ time: START + 10, price: 102 });
  c.frame(500);
  assert.equal(c.last, last);
});

test('the fitted day window scrolls left at a stable width rather than stretching historical prices', (t) => {
  const c = chart(t, false, 86400);
  c.viewport.setHistory([
    { time: START, price: 100 },
    { time: START + 600, price: 102 },
  ]);
  const initial = c.last.range,
    span = initial.to - initial.from;
  c.viewport.append({ time: START + 605, price: 101 });
  c.frame(120);
  assert.ok(Math.abs(c.last.range.from - initial.from - 2.5) < 1e-6);
  assert.ok(Math.abs(c.last.range.to - c.last.range.from - span) < 1e-6);
  c.frame(240);
  assert.equal(c.last.range.to, initial.to + 5);
  assert.equal(c.last.points[0].time, START);
  assert.equal(c.last.points[0].price, 100);
});
