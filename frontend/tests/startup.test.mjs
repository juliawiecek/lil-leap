import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTemplates } from './dom-helper.mjs';
import { APP_BOOTSTRAP_LISTENER, ErrorHandler, destroyPlatform } from '@angular/core';
const { appConfig } = await import('../src/app/app.config.ts');
const { SafeErrorHandler } = await import('../src/app/safe-error-handler.ts');
await import('../src/app/app.ts');

test('real entry point bootstraps the auth screen with the safe error handler', { timeout: 15000 }, async t => {
  await resolveTemplates();
  document.body.innerHTML = '<app-root></app-root>';
  let bootstrapped;
  const ready = new Promise(resolve => { bootstrapped = resolve; });
  const observer = { provide: APP_BOOTSTRAP_LISTENER, multi: true, useValue: bootstrapped };
  appConfig.providers.push(observer);
  t.after(() => { appConfig.providers.splice(appConfig.providers.indexOf(observer), 1); destroyPlatform(); });
  await import('../src/main.ts');
  const ref = await ready;
  assert.match(document.querySelector('app-root').textContent, /Welcome back/);
  assert.ok(document.querySelector('#email'));
  assert.ok(ref.injector.get(ErrorHandler) instanceof SafeErrorHandler);
});

test('startup failure logs a fixed message instead of the bootstrap exception', async t => {
  document.body.innerHTML = '';
  const errors = t.mock.method(console, 'error', () => {});
  t.after(() => destroyPlatform());
  await import('../src/main.ts?missing-host');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(errors.mock.calls.some(call => call.arguments[0] === 'Application startup failed.'));
  assert.ok(errors.mock.calls.every(call => call.arguments.every(arg => typeof arg === 'string')));
});
