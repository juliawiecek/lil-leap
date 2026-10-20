import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { SvgRangeAnimation } = await import('../src/app/svg-range-animation.ts');
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};
const range = { from: 0, to: 100, min: 90, max: 110, reveal: 99 };
function animation(t) {
  let time = 0,
    id = 0,
    reduced = false,
    current;
  const frames = new Map();
  t.mock.method(globalThis, 'requestAnimationFrame', (callback) => {
    frames.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, 'cancelAnimationFrame', (frame) => frames.delete(frame));
  t.mock.method(performance, 'now', () => time);
  const animator = new SvgRangeAnimation(
    (value) => (current = value),
    () => reduced,
  );
  t.after(() => animator.destroy());
  return {
    animator,
    frames,
    get current() {
      return current;
    },
    reduce() {
      reduced = true;
    },
    frame(now) {
      time = now;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(now));
    },
  };
}
test('a new viewport scrolls both edges together without stretching; interruptions continue from the last rendered coordinates', (t) => {
  const a = animation(t);
  a.animator.move(range);
  a.animator.move({ ...range, from: 5, to: 105 });
  a.frame(120);
  assert.equal(a.current.from, 2.5);
  assert.equal(a.current.to, 102.5);
  a.animator.move({ ...range, from: 10, to: 110 });
  assert.equal(a.frames.size, 1);
  a.frame(240);
  assert.equal(a.current.from, 6.25);
  assert.equal(a.current.to - a.current.from, 100);
  a.frame(360);
  assert.equal(a.current.from, 10);
  assert.equal(a.frames.size, 0);
});
test('reduced motion and teardown cancel outstanding frames and retain the exact target scale', (t) => {
  const a = animation(t);
  a.animator.move(range);
  const target = { ...range, from: 5, to: 105, min: 80 };
  a.animator.move(target);
  a.reduce();
  a.animator.finish();
  assert.deepEqual(a.current, target);
  assert.equal(a.frames.size, 0);
  a.animator.move({ ...target, to: 110 });
  assert.equal(a.frames.size, 0);
  a.animator.destroy();
  const last = a.current;
  a.animator.move(range);
  a.frame(1000);
  assert.equal(a.current, last);
});
