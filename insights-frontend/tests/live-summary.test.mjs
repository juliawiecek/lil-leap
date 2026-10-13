import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
const { App } = await import('../src/app/app.ts');
const { LIVE_REPORTS } = await import('../src/app/live-reports.ts');
const summary = { accounts: 7, orders: 12, fills: 9, gross_executed_value: '1234.50' };

test('live summary renders actual service values and delegates sign-out', async t => {
  let logouts = 0;
  const fixture = await render(t, App, {}, [{ provide: LIVE_REPORTS, useValue: {
    load: async () => summary, logout: async () => { logouts++; },
  } }]);
  await new Promise(resolve => setImmediate(resolve)); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.equal(host.querySelector('[data-testid="summary-orders"]').textContent, '12');
  assert.equal(host.querySelector('[data-testid="summary-value"]').textContent, '$1,234.50');
  fixture.componentInstance.signOut(); assert.equal(logouts, 1);
});

test('summary load is single-flight and never applies a response after teardown', async t => {
  let finish;
  let calls = 0;
  const fixture = await render(t, App, {}, [{ provide: LIVE_REPORTS, useValue: {
    load: () => { calls++; return new Promise(resolve => { finish = resolve; }); }, logout: async () => {},
  } }]);
  const app = fixture.componentInstance;
  await app.refreshSummary(); assert.equal(calls, 1);
  app.ngOnDestroy(); finish(summary);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.summary(), null);
});

test('summary errors expose only a fixed safe message', async t => {
  const fixture = await render(t, App, {}, [{ provide: LIVE_REPORTS, useValue: {
    load: async () => { throw new Error('password=do-not-display'); }, logout: async () => {},
  } }]);
  await new Promise(resolve => setImmediate(resolve)); fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /Could not load reporting summary/);
  assert.equal(fixture.nativeElement.textContent.includes('do-not-display'), false);
});


test('configured live-report provider calls the protected backend and signs out through routing', async t => {
  const { createEnvironmentInjector, Injector, runInInjectionContext } = await import('@angular/core');
  const { Router } = await import('@angular/router');
  const { AuthService } = await import('../src/app/auth.service.ts');
  const { appConfig } = await import('../src/app/app.config.ts');
  const calls = [];
  const auth = {
    transport: async url => { calls.push(url); return Response.json(summary); },
    logout: async () => { calls.push('logout'); },
  };
  const router = { navigate: async (parts, options) => { calls.push({ parts, options }); } };
  const injector = createEnvironmentInjector([{ provide: AuthService, useValue: auth }, { provide: Router, useValue: router }], Injector.NULL);
  t.after(() => injector.destroy());
  const provider = appConfig.providers.find(item => item.provide === LIVE_REPORTS);
  const reports = runInInjectionContext(injector, () => provider.useFactory());
  assert.deepEqual(await reports.load(), summary);
  assert.equal(calls[0], '/api/v1/reports/summary');
  auth.transport = async () => new Response('{}', { status: 503 });
  await assert.rejects(reports.load(), /Could not load reporting summary/);
  await reports.logout();
  assert.deepEqual(calls.slice(1), ['logout', { parts: ['/login'], options: { replaceUrl: true } }]);
});
