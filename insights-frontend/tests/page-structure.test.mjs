import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { BehaviorSubject, Subject } from 'rxjs';
import { ActivatedRoute, NavigationEnd, Router, convertToParamMap, provideRouter } from '@angular/router';
const { InsightsPage } = await import('../src/app/pages/insights/insights-page.ts');
const { ClientsPage } = await import('../src/app/pages/clients/clients-page.ts');
const { ClientDetailPage } = await import('../src/app/pages/client-detail/client-detail-page.ts');
const { ReportsPage } = await import('../src/app/pages/reports/reports-page.ts');
const { SettingsPage } = await import('../src/app/pages/settings/settings-page.ts');
const { Login } = await import('../src/app/login.ts');
const { InsightsChart } = await import('../src/app/shared/insights-chart.ts');
const { SiteAccessibility } = await import('../src/app/site-accessibility.ts');
const { LIVE_REPORTS } = await import('../src/app/live-reports.ts');
const { CLIENT_ACCOUNTS } = await import('../src/app/client-accounts.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');

/**
 * PS-29: the page-structure checks PS-20 made for NextTrade (one h1, headings in order, tables with
 * captions and column scopes, named scroll regions, nothing focusable inside role="img", labelled
 * fields), run on each Insights page as rendered. The axe scan in
 * frontend/e2e/insights-accessibility.spec.mjs checks the same pages in a real browser.
 */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
function structureProblems(root) {
  const problems = [];
  const h1 = root.querySelectorAll('h1').length;
  if (h1 !== 1) problems.push(`${h1} h1 headings`);
  let level = 0;
  for (const heading of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const next = Number(heading.tagName[1]);
    if (level && next > level + 1) problems.push(`h${level} is followed by h${next} ("${heading.textContent.trim()}")`);
    level = next;
  }
  for (const table of root.querySelectorAll('table')) {
    if (!table.querySelector('caption')?.textContent.trim()) problems.push('a table has no caption');
    for (const th of table.querySelectorAll('thead th')) {
      if (th.getAttribute('scope') !== 'col') problems.push(`column heading "${th.textContent.trim()}" has no scope`);
    }
  }
  for (const region of root.querySelectorAll('[role="region"]')) {
    if (!region.getAttribute('aria-label') && !region.getAttribute('aria-labelledby')) problems.push('a region has no name');
    if (region.getAttribute('aria-label') === 'Scrollable data table') problems.push('a table region is named "Scrollable data table"');
  }
  for (const image of root.querySelectorAll('[role="img"]')) {
    if (!image.getAttribute('aria-label')) problems.push(`role="img" (${image.className}) has no name`);
    if (image.querySelector(FOCUSABLE)) problems.push(`role="img" (${image.className}) hides a focusable element from screen readers`);
  }
  for (const el of root.querySelectorAll('div[aria-label]:not([role]), span[aria-label]:not([role])')) {
    problems.push(`aria-label on a ${el.tagName.toLowerCase()} with no role ("${el.getAttribute('aria-label')}")`);
  }
  for (const field of root.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
    if (!field.labels?.length && !field.getAttribute('aria-label') && !field.closest('label')) problems.push(`field ${field.name || field.id} has no label`);
  }
  return problems;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const summary = { date: '2026-10-19', time_zone: 'America/Chicago', accounts: 7, orders: 12, fills: 9, gross_executed_value: '1234.50' };
const trend = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, tradeCount: hour === 14 ? 5 : 0 }));
const ordersToday = { date: '2026-10-19', dayStart: '2026-10-19T05:00:00Z', orders: [
  { placedAt: '2026-10-19T13:30:21Z', symbol: 'MSFT', side: 'BUY', quantity: 3, status: 'FILLED', filledValue: '1524.46' },
] };
const reports = (overrides = {}) => ({
  load: async () => summary, topInstruments: async () => [{ instrument: 'AAPL', tradeCount: 5 }],
  activityTrend: async () => trend, ordersToday: async () => ordersToday, ...overrides,
});
const ACCOUNT = 'e0000000-0000-4000-8000-000000000001';
const account = { accountId: ACCOUNT, accountNumber: 'NT-DEMO-0001', accountName: 'Individual account', clientName: 'Maya Chen',
  email: 'maya.chen@example.test', traderLevel: 'NOVICE', status: 'ACTIVE', tradeCount: 2, tradedValue: 5200.5, lastTradeAt: '2026-10-16T18:30:00Z' };
const page = (content, values = {}) => ({ content, page: 0, size: 25, totalElements: content.length, totalPages: 1, ...values });
const accounts = (overrides = {}) => ({
  list: async () => page([account]),
  detail: async () => ({ account, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 2, averageCost: 225.1, costBasis: 450.2 }] }),
  orders: async () => page([{ orderId: '3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f', filledAt: '2026-10-16T18:30:00Z', symbol: 'AAPL', side: 'BUY', quantity: 2, fillPrice: 225.1 }]),
  ...overrides,
});
const analyst = { provide: AuthService, useValue: { userRole: 'ANALYST', login: async () => ({}), logout: async () => {} } };

test('the Insights page has one h1, ordered headings, captioned tables and no focusable element inside a picture', async (t) => {
  const fixture = await render(t, InsightsPage, {}, [{ provide: LIVE_REPORTS, useValue: reports() }]);
  await settle(); fixture.detectChanges();
  assert.deepEqual(structureProblems(fixture.nativeElement), []);
  const ranking = fixture.nativeElement.querySelector('.ranking-graphic');
  assert.match(ranking.getAttribute('aria-label'), /top 1 hold 100 percent/);
  assert.equal(fixture.nativeElement.querySelector('.top-body table').hasAttribute('aria-hidden'), false, 'the visible ranking table is read as a table');
});

test('the Clients page passes the same structure checks', async (t) => {
  const clients = await render(t, ClientsPage, {}, [provideRouter([]), { provide: CLIENT_ACCOUNTS, useValue: accounts() }, analyst]);
  await settle(); clients.detectChanges();
  assert.deepEqual(structureProblems(clients.nativeElement), [], 'Clients');
});

test('the client account page passes the structure checks', async (t) => {
  const detail = await render(t, ClientDetailPage, {}, [provideRouter([]), analyst, { provide: CLIENT_ACCOUNTS, useValue: accounts() },
    { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: ACCOUNT })), snapshot: { queryParams: {} } } }]);
  await settle(); await settle(); detail.detectChanges();
  assert.deepEqual(structureProblems(detail.nativeElement), [], 'Client account, overview');
  detail.componentInstance.show('orders'); await settle(); detail.detectChanges();
  assert.deepEqual(structureProblems(detail.nativeElement), [], 'Client account, orders');
});

test('the Reports page passes the structure checks', async (t) => {
  const reportsPage = await render(t, ReportsPage);
  assert.deepEqual(structureProblems(reportsPage.nativeElement), [], 'Reports');
});

test('the Settings page passes the structure checks', async (t) => {
  const settings = await render(t, SettingsPage);
  assert.deepEqual(structureProblems(settings.nativeElement), [], 'Settings');
});

test('the sign-in page passes the structure checks', async (t) => {
  const login = await render(t, Login, {}, [provideRouter([]), analyst, { provide: AppSessionService, useValue: { start: () => {} } }]);
  assert.deepEqual(structureProblems(login.nativeElement), [], 'Sign in');
  assert.ok(login.nativeElement.querySelector('main#insights-login-main'), 'the sign-in form is the main landmark');
  const toggle = login.nativeElement.querySelector('.password-toggle');
  const field = login.nativeElement.querySelector('#password');
  assert.equal(toggle.getAttribute('aria-label'), 'Show password');
  assert.ok(toggle.getAttribute('aria-label').includes(toggle.textContent.trim()), 'the visible word is part of the name');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  toggle.click(); login.detectChanges();
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), 'Show password', 'the name stays the same; the state changes');
  assert.equal(field.type, 'text');
});

test('every page gets its own tab title, which follows navigation', async (t) => {
  const events = new Subject();
  const fixture = await render(t, SettingsPage, {}, [{ provide: Router, useValue: { url: '/login', events, navigate: async () => true } }]);
  const access = fixture.debugElement.injector.get(SiteAccessibility);
  access.start();
  const titles = {};
  for (const [url, title] of [['/login', 'Sign in'], ['/insights', 'Insights'], ['/clients', 'Clients'], ['/clients/abc', 'Clients'],
    ['/reports', 'Reports'], ['/trades/123', 'Trade lookup'], ['/settings', 'Settings']]) {
    events.next(new NavigationEnd(1, url, url));
    titles[url] = document.title;
    assert.equal(document.title, `${title} · NextTrade Insights`, url);
  }
  assert.equal(new Set(Object.values(titles)).size, 6);
});

test('a chart is named by what it shows, and its points are read out from outside the picture (PS-29)', async (t) => {
  const fixture = await render(t, InsightsChart);
  fixture.componentRef.setInput('points', [{ label: '09:00', value: 8 }, { label: '10:00', value: 4 }, { label: '11:00', value: 6 }]);
  fixture.componentRef.setInput('label', 'Trades per hour');
  fixture.componentRef.setInput('prefix', '');
  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg');
  assert.equal(svg.getAttribute('aria-label'),
    'Trades per hour. Line chart, 3 points from 09:00 to 11:00, lowest 4 trades, highest 8 trades. Use the arrow keys to read each point.');
  assert.equal(svg.querySelector(FOCUSABLE), null, 'role="img" hides its children, so none of them takes focus');
  const status = fixture.nativeElement.querySelector('[role="status"]');
  assert.equal(status.closest('svg'), null, 'the announcement sits outside the svg, where screen readers can hear it');
  assert.equal(fixture.nativeElement.querySelector('.chart-readout').getAttribute('aria-hidden'), 'true', 'the visual readout is not read twice');
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' })); fixture.detectChanges();
  assert.equal(status.textContent.trim(), 'Point 3 of 3. 11:00. 6 trades.');
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); fixture.detectChanges();
  assert.equal(status.textContent.trim(), 'Point 2 of 3. 10:00. 4 trades.');
  const points = fixture.nativeElement.querySelectorAll('circle[aria-hidden="true"]');
  points[0].dispatchEvent(new Event('mouseenter')); fixture.detectChanges();
  assert.equal(status.textContent.trim(), 'Point 2 of 3. 10:00. 4 trades.', 'hovering moves the readout but says nothing');
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges();
  assert.equal(status.textContent.trim(), '');
  fixture.componentRef.setInput('valueLabel', 'Orders so far');
  fixture.componentRef.setInput('points', [{ label: 'Midnight', value: 0 }, { label: '8:30 AM', value: 1, note: 'Buy 3 MSFT' }]);
  fixture.detectChanges();
  svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' })); fixture.detectChanges();
  assert.equal(status.textContent.trim(), 'Point 2 of 2. 8:30 AM, Buy 3 MSFT. Orders so far: 1.');
  assert.match(svg.getAttribute('aria-label'), /lowest 0 orders, highest 1 orders/);
});

test('live refreshes announce new activity politely, at most once a minute, and never the first load (PS-29)', async (t) => {
  let orders = 12;
  const insights = component(t, InsightsPage, [{ provide: LIVE_REPORTS, useValue: reports({ load: async () => ({ ...summary, orders }) }) }]);
  await settle();
  assert.equal(insights.refreshAnnouncement(), '', 'the figures on screen at load are not news');
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  t.after(() => t.mock.timers.reset());
  orders = 13; await insights.refresh();
  assert.equal(insights.refreshAnnouncement(), '', 'a change within the minute waits');
  t.mock.timers.tick(60_000);
  await insights.refresh();
  assert.match(insights.refreshAnnouncement(), /^Updated .*: 5 trades and 13 orders today\.$/);
  const said = insights.refreshAnnouncement();
  t.mock.timers.tick(60_000);
  await insights.refresh();
  assert.equal(insights.refreshAnnouncement(), said, 'nothing changed, so nothing new is said');
});

test('report filters announce the period and exports their row count; client filters announce the result count (PS-29)', async (t) => {
  const reportsPage = component(t, ReportsPage, [{ provide: (await import('../src/app/live-reports.ts')).REPORT_FILES, useValue: {
    generate: async () => ({ filename: 'r.csv', csv: 'a,b\n1,2\n3,4' }),
  } }]);
  t.mock.method(reportsPage, 'download', () => {});
  reportsPage.reportStart.set('2026-10-01'); reportsPage.reportEnd.set('2026-10-07');
  assert.equal(reportsPage.periodAnnouncement(), 'Reporting period: 7 days, 2026-10-01 to 2026-10-07.');
  reportsPage.reportEnd.set('2026-09-01');
  assert.equal(reportsPage.periodAnnouncement(), '', 'an invalid range announces its error instead');
  reportsPage.reportEnd.set('2026-10-07');
  await reportsPage.generateReport(reportsPage.reportCatalog[0]);
  assert.equal(reportsPage.notice(), 'Instrument Report generated for 2026-10-01 – 2026-10-07: 2 rows.');

  let result = page([account]);
  const clients = component(t, ClientsPage, [{ provide: CLIENT_ACCOUNTS, useValue: accounts({ list: async () => result }) }, analyst]);
  await settle();
  assert.equal(clients.resultsAnnouncement(), '1 account.');
  result = page(Array.from({ length: 25 }, () => account), { totalElements: 312, totalPages: 13 });
  await clients.load();
  assert.equal(clients.resultsAnnouncement(), 'Showing 1–25 of 312 accounts.');
  result = page([]);
  clients.filters.set({ ...clients.filters(), search: 'nobody' });
  await clients.load();
  assert.equal(clients.resultsAnnouncement(), 'No accounts match these filters.');
});
