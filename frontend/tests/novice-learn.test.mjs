import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { NoviceLearn } = await import('../src/app/novice-learn.ts');

function storage(t, saved = null) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map(saved === null ? [] : [['nexttrade-learning-v2', saved]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
  return data;
}

test('learning progress requires a correct answer and persists each lesson only once', t => {
  const saved = storage(t);
  const learn = component(t, NoviceLearn);
  learn.finish(); assert.deepEqual(learn.completed(), []);
  learn.answer.set((learn.current().correct + 1) % 3);
  learn.finish(); assert.deepEqual(learn.completed(), []);
  learn.answer.set(learn.current().correct); learn.finish(); learn.finish();
  assert.deepEqual(learn.completed(), [0]);
  assert.equal(saved.get('nexttrade-learning-v2'), '[0]');
});

for (const [saved, expected] of [
  ['broken json', []], ['{}', []], ['[0,2,-1,5,1.5,"1",null]', [0, 2]],
]) {
  test(`learning progress tolerates invalid saved data: ${saved}`, t => {
    storage(t, saved);
    assert.deepEqual(component(t, NoviceLearn).completed(), expected);
  });
}

test('learning remains usable when browser storage is unavailable', t => {
  storage(t);
  t.mock.method(globalThis.localStorage, 'getItem', () => { throw new Error('blocked'); });
  t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('blocked'); });
  const learn = component(t, NoviceLearn);
  assert.deepEqual(learn.completed(), []);
  learn.answer.set(learn.current().correct);
  assert.doesNotThrow(() => learn.finish());
  assert.deepEqual(learn.completed(), [0]);
});

test('topic changes select a matching lesson and clear the previous answer', t => {
  storage(t);
  const learn = component(t, NoviceLearn);
  const next = learn.lessons.findIndex(l => l.topic !== learn.current().topic);
  assert.ok(next > 0);
  learn.answer.set(1); learn.setTopic(learn.lessons[next].topic);
  assert.equal(learn.active(), next);
  assert.equal(learn.answer(), null);
  assert.ok(learn.filtered().every(l => l.topic === learn.current().topic));
  learn.setTopic('All topics');
  assert.equal(learn.filtered().length, learn.lessons.length);
});

test('compound calculator responds to principal, years, zero rates, and negative returns', t => {
  storage(t);
  const learn = component(t, NoviceLearn);
  learn.initial.set(100); learn.years.set(2); learn.rate.set(5);
  assert.ok(Math.abs(learn.future() - 110.25) < 1e-9);
  learn.rate.set(0); assert.equal(learn.future(), 100);
  learn.rate.set(-10); assert.equal(learn.future(), 81);
  learn.years.set(0); assert.equal(learn.future(), 100);
});
