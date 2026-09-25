import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTemplates } from './dom-helper.mjs';
import { APP_BOOTSTRAP_LISTENER, destroyPlatform } from '@angular/core';
const { appConfig } = await import('../src/app/app.config.ts');
await import('../src/app/app.ts');

test('real insights entry point starts the dashboard with configured providers', { timeout: 15000 }, async t => {
  await resolveTemplates();
  document.body.innerHTML = '<app-root></app-root>';
  let bootstrapped;
  const ready = new Promise(resolve => { bootstrapped = resolve; });
  const observer = { provide: APP_BOOTSTRAP_LISTENER, multi: true, useValue: bootstrapped };
  appConfig.providers.push(observer);
  t.after(() => { appConfig.providers.splice(appConfig.providers.indexOf(observer), 1); destroyPlatform(); });
  await import('../src/main.ts');
  const ref = await ready;
  assert.equal(ref.instance.page(), 'Overview');
  assert.match(document.querySelector('app-root').textContent, /Trading/);
  assert.ok(document.querySelector('app-insights-chart svg'));
});

test('entry point catches and reports bootstrap failure when the root host is missing', async t => {
  document.body.innerHTML = '';
  const errors = t.mock.method(console, 'error', () => {});
  t.after(() => destroyPlatform());
  await import('../src/main.ts?missing-host');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(errors.mock.calls.some(call => /app-root/.test(String(call.arguments[0]))));
});
