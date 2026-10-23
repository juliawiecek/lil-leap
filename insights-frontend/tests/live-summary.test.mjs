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
// Two orders on October 19: 8:30:21 AM and 2:05 PM Central (Central daylight time is UTC-5).
const ordersToday = {
  date: '2026-10-19',
  dayStart: '2026-10-19T05:00:00Z',
  orders: [
    { placedAt: '2026-10-19T13:30:21Z', symbol: 'MSFT', side: 'BUY', quantity: 3, status: 'FILLED', filledValue: '1524.46' },
    { placedAt: '2026-10-19T19:05:00Z', symbol: 'AAPL', side: 'SELL', quantity: 5, status: 'CANCELLED', filledValue: 0 },
  ],
};
const service = (overrides = {}) => ({
  load: async () => summary, topInstruments: async () => top, activityTrend: async () => trend,
  ordersToday: async () => ordersToday, ...overrides,
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
  assert.equal(host.querySelectorAll('app-insights-chart circle[tabindex]').length, 4, 'midnight, one step per order, and now');
  assert.match(host.querySelector('app-insights-chart svg').getAttribute('aria-label'), /exact time it was placed/);
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
    ['Good Morning', 'Good Morning', 'Good Afternoon', 'Good Afternoon', 'Good Evening', 'Good Evening']);
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
    { provide: LIVE_REPORTS, useValue: service({
      topInstruments: async () => [], activityTrend: async () => quiet, ordersToday: async () => ({ ...ordersToday, orders: [] }),
    }) },
  ]);
  await settle(); fixture.detectChanges();
  assert.match(fixture.nativeElement.textContent, /No orders yet today\. The line steps up at the exact time each order is placed\./);
  assert.match(fixture.nativeElement.textContent, /No trades yet today\./);
  assert.deepEqual(fixture.componentInstance.orderTicks(), []);
  assert.equal(fixture.nativeElement.querySelector('app-insights-chart'), null);
  assert.equal(fixture.componentInstance.topMax(), 1, 'bars never divide by zero');
});

test('one trade reads "1 trade", not "1 trades"', async (t) => {
  const single = trend.map((point) => ({ ...point, tradeCount: point.hour === '08:00' ? 1 : 0 }));
  const fixture = await render(t, InsightsPage, {}, [
    { provide: LIVE_REPORTS, useValue: service({ activityTrend: async () => single }) },
  ]);
  await settle(); fixture.detectChanges();
  const text = fixture.nativeElement.textContent;
  assert.match(text, /1 trade · Central time/);
  assert.match(text, /Busiest so far: 8 AM, 1 trade\. /);
  assert.equal(/1 trades/.test(text), false);
  assert.match(fixture.nativeElement.querySelector('.bars').getAttribute('aria-label'), /8 AM, 1 trade\.$/);
});

test('the order line steps up at the exact second each order was placed, then runs level to now', (t) => {
  const page = component(t, InsightsPage);
  page.orders.set(ordersToday);
  page.now.set(Date.parse('2026-10-19T20:00:00Z'));
  const points = page.orderPoints();
  assert.deepEqual(points.map((p) => [p.at, p.value]), [
    [Date.parse('2026-10-19T05:00:00Z'), 0],
    [Date.parse('2026-10-19T13:30:21Z'), 1],
    [Date.parse('2026-10-19T19:05:00Z'), 2],
    [Date.parse('2026-10-19T20:00:00Z'), 2],
  ]);
  assert.deepEqual(points.map((p) => p.label), ['Midnight', '8:30:21 AM CT', '2:05:00 PM CT', 'Now, 3:00:00 PM CT']);
  assert.equal(points[1].note, 'Buy 3 MSFT · $1,524.46');
  assert.equal(points[2].note, 'Sell 5 AAPL · Cancelled');
  // Midnight to 3 PM is 15 hours, so the labels fall every 3 hours on the Central clock.
  assert.deepEqual(page.orderTicks().map((tick) => tick.label), ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM']);
  page.now.set(Date.parse('2026-10-19T06:00:00Z'));
  assert.equal(page.orderPoints().at(-1).at, Date.parse('2026-10-19T19:05:00Z'), 'never ends before the last order');
  page.orders.set({ ...ordersToday, orders: ordersToday.orders.slice(0, 1) });
  page.now.set(Date.parse('2026-10-19T07:00:00Z'));
  assert.deepEqual(page.orderTicks().map((tick) => tick.label), ['12 AM', '2 AM', '4 AM', '6 AM', '8 AM'], 'a short span gets closer labels');
});

test('orders are described by side, size, stock and what happened', (t) => {
  const page = component(t, InsightsPage);
  const order = { placedAt: '2026-10-19T13:30:21Z', symbol: 'NVDA', side: 'BUY', quantity: 1200, status: 'PARTIALLY_FILLED', filledValue: '50.5' };
  assert.equal(page.describeOrder(order), 'Buy 1,200 NVDA · $50.50 · Partially filled');
  assert.equal(page.describeOrder({ ...order, status: 'PENDING', filledValue: 0 }), 'Buy 1,200 NVDA · Pending');
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

test('the configured provider calls the summary, top-stock, hourly and orders endpoints', async (t) => {
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
  await reports.ordersToday();
  assert.deepEqual(calls, [
    '/api/v1/reports/summary',
    '/api/v1/reports/insights/top-instruments',
    '/api/v1/reports/insights/client-activity-trend',
    '/api/v1/reports/orders-today',
  ]);
  http.get = () => throwError(() => new Error('unavailable'));
  await assert.rejects(reports.load(), /unavailable/);
});
