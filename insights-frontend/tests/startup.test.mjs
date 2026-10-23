import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTemplates } from './dom-helper.mjs';
import { Router } from '@angular/router';
import { APP_BOOTSTRAP_LISTENER, destroyPlatform } from '@angular/core';
const { appConfig } = await import('../src/app/app.config.ts');
await import('../src/app/shell/shell.ts');

test('real insights entry point starts at login without a stored session', { timeout: 15000 }, async t => {
  await resolveTemplates();
  document.body.innerHTML = '<app-root></app-root>';
  let bootstrapped;
  const ready = new Promise(resolve => { bootstrapped = resolve; });
  const observer = { provide: APP_BOOTSTRAP_LISTENER, multi: true, useValue: bootstrapped };
  appConfig.providers.push(observer);
  t.after(() => { appConfig.providers.splice(appConfig.providers.indexOf(observer), 1); destroyPlatform(); });
  await import('../src/main.ts');
  const ref = await ready;
  const router = ref.injector.get(Router);
  await router.navigateByUrl('/login');
  await resolveTemplates();
  ref.changeDetectorRef.detectChanges();
  assert.equal(router.url, '/login');
  assert.match(document.querySelector('app-root').textContent, /Welcome back/);
  assert.ok(document.querySelector('#email'));
  assert.equal(document.querySelector('app-insights-workspace'), null);
});

test('entry point catches and reports bootstrap failure when the root host is missing', async t => {
  document.body.innerHTML = '';
  const errors = t.mock.method(console, 'error', () => {});
  t.after(() => destroyPlatform());
  await import('../src/main.ts?missing-host');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(errors.mock.calls.some(call => call.arguments[0] === 'Application startup failed.'));
});
