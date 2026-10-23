import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
const { InsightsPage } = await import('../src/app/pages/insights/insights-page.ts');
const { LIVE_REPORTS } = await import('../src/app/live-reports.ts');
const summary = {
  date: '2026-10-19', time_zone: 'America/Chicago', accounts: 7, orders: 12, fills: 9, gross_executed_value: '1234.50',
};
const top = [{ instrument: 'AAPL', tradeCount: 6 }, { instrument: 'JPM', tradeCount: 3 }];
const trend = Array.from({ length: 24 }, (_, hour) => ({
  hour: `${String(hour).padStart(2, '0')}:00`, tradeCount: hour === 14 ? 5 : hour === 15 ? 4 : 0,
}));
const service = (overrides = {}) => ({
  load: async () => summary, topInstruments: async () => top, activityTrend: async () => trend, ...overrides,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('the Insights page renders today\'s totals, trades by hour and the top stocks', async (t) => {
  const fixture = await render(t, InsightsPage, {}, [{ provide: LIVE_REPORTS, useValue: service() }]);
  await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.equal(host.querySelector('[data-testid="summary-accounts"]').textContent.trim(), '7');
  assert.equal(host.querySelector('[data-testid="summary-orders"]').textContent.trim(), '12');
  assert.equal(host.querySelector('[data-testid="summary-value"]').textContent.trim(), '$1,234.50');
  assert.match(host.textContent, /Placed an order today/);
  assert.match(host.textContent, /Today's trading across every account, Monday, October 19, 2026 \(Central time\)\./);
  assert.match(host.textContent, /9 trades · Central time/);
  const centralHourNow = Number(new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Chicago' }).format(new Date()));
  assert.equal(host.querySelectorAll('app-insights-chart circle[tabindex]').length, centralHourNow + 1, 'the running total stops at the current hour');
  const rows = [...host.querySelectorAll('tbody tr')]
    .map((row) => [...row.querySelectorAll('td')].slice(0, 3).map((cell) => cell.textContent.trim()));
  assert.deepEqual(rows, [['1', 'AAPL', '6'], ['2', 'JPM', '3']]);
  const page = fixture.componentInstance;
  assert.equal(page.topMax(), 6);
  assert.deepEqual(page.trendPoints()[14], { label: '14:00', value: 5 });
});

test('the greeting follows the Central clock, not the computer\'s time zone', async (t) => {
  const { greetingFor } = await import('../src/app/pages/insights/insights-page.ts');
  const { centralHour } = await import('../src/app/shared/app-time.ts');
  assert.deepEqual([0, 11, 12, 17, 18, 23].map(greetingFor),
    ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  // 03:00 UTC on October 23 is still 10 PM on the 22nd in Chicago; 18:28 UTC is 1:28 PM.
  assert.equal(centralHour(new Date('2026-10-23T03:00:00Z')), 22);
  assert.equal(centralHour(new Date('2026-10-22T18:28:00Z')), 13);
  // In standard time Chicago is six hours behind UTC, and midnight is hour 0.
  assert.equal(centralHour(new Date('2026-01-15T06:00:00Z')), 0);
  const fixture = await render(t, InsightsPage, {}, [{ provide: LIVE_REPORTS, useValue: service() }]);
  await settle(); fixture.detectChanges();
  assert.equal(fixture.componentInstance.greeting(), greetingFor(centralHour()));
});

test('a day with no trades shows empty states instead of an empty chart', async (t) => {
  const quiet = trend.map((point) => ({ ...point, tradeCount: 0 }));
  const fixture = await render(t, InsightsPage, {}, [
    { provide: LIVE_REPORTS, useValue: service({ topInstruments: async () => [], activityTrend: async () => quiet }) },
  ]);
  await settle(); fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /No trades yet today\./);
  assert.equal(fixture.nativeElement.querySelector('app-insights-chart'), null);
  assert.equal(fixture.componentInstance.topMax(), 1, 'bars never divide by zero');
});

test('one failed call keeps the other figures and shows only a fixed safe message', async (t) => {
  const fixture = await render(t, InsightsPage, {}, [
    { provide: LIVE_REPORTS, useValue: service({ topInstruments: async () => { throw new Error('password=do-not-display'); } }) },
  ]);
  await settle(); fixture.detectChanges();
  const text = fixture.nativeElement.textContent;
  assert.match(text, /Some reporting figures could not be loaded/);
  assert.equal(text.includes('do-not-display'), false);
  assert.equal(fixture.componentInstance.summary(), summary);
  assert.equal(fixture.componentInstance.trend().length, 24);
});

test('the figures and the chart are re-read every 5 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0;
  const page = component(t, InsightsPage, [{ provide: LIVE_REPORTS, useValue: service({ load: async () => { calls++; return summary; } }) }]);
  await settle();
  assert.equal(calls, 1, 'read once when the page opens');
  t.mock.timers.tick(4_999);
  await settle();
  assert.equal(calls, 1, 'not yet');
  t.mock.timers.tick(1);
  await settle();
  assert.equal(calls, 2, 'again after 5 seconds');
  t.mock.timers.tick(5_000);
  await settle();
  assert.equal(calls, 3);
  page.ngOnDestroy();
});

test('loading is single-flight and never applies a response after the page closes', async (t) => {
  let finish;
  let calls = 0;
  const page = component(t, InsightsPage, [{
    provide: LIVE_REPORTS,
    useValue: service({ load: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } }),
  }]);
  await page.refresh();
  assert.equal(calls, 1, 'the constructor load is still in flight');
  page.ngOnDestroy(); finish(summary);
  await settle();
  assert.equal(page.summary(), null);
});

test('without a reporting service the page shows dashes rather than failing', (t) => {
  const page = component(t, InsightsPage);
  assert.equal(page.count(undefined), '–');
  assert.equal(page.money(undefined), '–');
  assert.equal(page.count(1234), '1,234');
});

test('the configured provider calls the summary, top-stock and hourly endpoints', async (t) => {
  const { createEnvironmentInjector, Injector, runInInjectionContext } = await import('@angular/core');
  const { ApiHttpClient } = await import('@lilleap/session-core/angular');
  const { of, throwError } = await import('rxjs');
  const { appConfig } = await import('../src/app/app.config.ts');
  const calls = [];
  const http = { get: (url) => { calls.push(url); return of(url.endsWith('summary') ? summary : top); } };
  const injector = createEnvironmentInjector([{ provide: ApiHttpClient, useValue: http }], Injector.NULL);
  t.after(() => injector.destroy());
  const provider = appConfig.providers.find((item) => item.provide === LIVE_REPORTS);
  const reports = runInInjectionContext(injector, () => provider.useFactory());
  assert.deepEqual(await reports.load(), summary);
  await reports.topInstruments();
  await reports.activityTrend();
  assert.deepEqual(calls, [
    '/api/v1/reports/summary',
    '/api/v1/reports/insights/top-instruments',
    '/api/v1/reports/insights/client-activity-trend',
  ]);
  http.get = () => throwError(() => new Error('unavailable'));
  await assert.rejects(reports.load(), /unavailable/);
});
