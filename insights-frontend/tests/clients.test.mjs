import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, button, input } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { BehaviorSubject } from 'rxjs';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
const { ClientsPage, filtersFrom, filterParams } = await import('../src/app/pages/clients/clients-page.ts');
const { ClientDetailPage } = await import('../src/app/pages/client-detail/client-detail-page.ts');
const { CLIENT_ACCOUNTS, queryParams, codeLabel } = await import('../src/app/client-accounts.ts');
const { AuthService } = await import('../src/app/auth.service.ts');

const ACCOUNT = 'e0000000-0000-4000-8000-000000000001';
const ORDER = '3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f';
const account = (number, values = {}) => ({
  accountId: ACCOUNT, accountNumber: number, accountName: 'Individual account', clientName: 'Maya Chen', email: 'maya.chen@example.test', traderLevel: 'NOVICE', status: 'ACTIVE',
  tradeCount: 2, tradedValue: 5200.5, lastTradeAt: '2026-10-16T18:30:00Z', ...values,
});
const page = (content, values = {}) => ({ content, page: 0, size: 25, totalElements: content.length, totalPages: 1, ...values });
const list = page([
  account('NT-DEMO-0001'),
  account('NT-DEMO-0003', { accountId: 'e0000000-0000-4000-8000-000000000003', clientName: 'Noah Bennett', email: 'noah.bennett@example.test', status: 'BLOCKED', tradeCount: 1, tradedValue: 250, lastTradeAt: '2026-10-09T14:00:00Z' }),
]);
const detail = {
  account: account('NT-DEMO-0001'),
  holdings: [{ symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 2, averageCost: 225.1, costBasis: 450.2 }],
};
const orders = page([
  { orderId: ORDER, filledAt: '2026-10-16T18:30:00Z', symbol: 'AAPL', side: 'BUY', quantity: 2, fillPrice: 225.1 },
  { orderId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', filledAt: '2026-10-17T15:00:00Z', symbol: 'MSFT', side: 'SELL', quantity: 1, fillPrice: 505 },
]);
const api = (overrides = {}) => ({
  list: async () => list, detail: async () => detail, orders: async () => orders, ...overrides,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const role = (userRole) => ({ provide: AuthService, useValue: { userRole } });

test('list filters round-trip through the URL; defaults stay out of it', () => {
  assert.deepEqual(filtersFrom({}), { search: '', level: '', status: '', sort: 'accountNumber,asc', page: 0 });
  const filters = filtersFrom({ search: 'demo', level: 'NOVICE', status: 'BLOCKED', sort: 'tradedValue,desc', page: '2' });
  assert.deepEqual(filters, { search: 'demo', level: 'NOVICE', status: 'BLOCKED', sort: 'tradedValue,desc', page: 2 });
  assert.deepEqual(filterParams(filters), { search: 'demo', level: 'NOVICE', status: 'BLOCKED', sort: 'tradedValue,desc', page: 2 });
  assert.deepEqual(filterParams(filtersFrom({ page: '-3', search: '  ' })),
    { search: null, level: null, status: null, sort: null, page: null });
  assert.deepEqual(queryParams({ search: ' NT ', level: '', page: 0 }), { search: 'NT', size: '25' });
  assert.deepEqual(queryParams({ status: 'FILLED', page: 3 }, 10), { status: 'FILLED', page: '3', size: '10' });
  assert.equal(codeLabel('PENDING_REVIEW'), 'Pending review');
});

test('the clients list shows every account with its owner, status, traded value, trades and last trade', async (t) => {
  const fixture = await render(t, ClientsPage, {}, [
    provideRouter([]), { provide: CLIENT_ACCOUNTS, useValue: api() }, role('ANALYST'),
  ]);
  await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  const rows = [...host.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()));
  assert.deepEqual(rows[0], ['NT-DEMO-0001', 'Maya Chenmaya.chen@example.test', 'Individual account', 'Novice', 'Active', '$5,200.50', '2', 'Oct 16, 1:30 PM CT']);
  assert.deepEqual(rows[1].slice(1), ['Noah Bennettnoah.bennett@example.test', 'Individual account', 'Novice', 'Blocked', '$250.00', '1', 'Oct 9, 9:00 AM CT']);
  assert.ok(host.querySelector('tbody tr:nth-child(2) .badge.rejected'), 'blocked accounts stand out');
  assert.match(host.querySelector('tbody a').getAttribute('href'), new RegExp(`/clients/${ACCOUNT}$`));
  assert.match(host.textContent, /1–2 of 2/);
  assert.match(host.textContent, /who owns it/);
  assert.doesNotMatch(host.textContent, /Paste its order ID/, 'the order hint is for operations staff');
  assert.equal(host.querySelector('th[aria-sort="ascending"]').textContent.trim(), 'Account ↑');
});

test('filters, sorting and paging go through the URL and reset to the first page', async (t) => {
  const navigations = [];
  const query = new BehaviorSubject({ page: '1' });
  const router = { navigate: async (commands, extras) => { navigations.push(extras.queryParams); return true; } };
  const { Router } = await import('@angular/router');
  const calls = [];
  const instance = component(t, ClientsPage, [
    { provide: CLIENT_ACCOUNTS, useValue: api({ list: async (filters) => { calls.push(filters); return list; } }) },
    { provide: Router, useValue: router },
    { provide: ActivatedRoute, useValue: { queryParams: query } },
  ]);
  await settle();
  assert.equal(calls[0].page, 1, 'the URL decides the first load');
  instance.update({ level: 'ADVANCED' });
  assert.deepEqual(navigations.at(-1), { search: null, level: 'ADVANCED', status: null, sort: null, page: null });
  instance.sortBy('tradedValue', 'desc');
  assert.equal(navigations.at(-1).sort, 'tradedValue,desc');
  assert.equal(instance.sortState('tradedValue'), 'descending');
  instance.sortBy('tradedValue', 'desc');
  assert.equal(navigations.at(-1).sort, 'tradedValue,asc', 'a second click flips the direction');
  assert.equal(instance.sortState('accountNumber'), 'none');
  instance.goToPage(3);
  assert.equal(navigations.at(-1).page, 3);
  instance.clear();
  assert.deepEqual(navigations.at(-1), { search: null, level: null, status: null, sort: 'tradedValue,asc', page: null });
  query.next({ search: 'demo', status: 'BLOCKED' });
  await settle();
  assert.deepEqual(calls.at(-1), { search: 'demo', level: '', status: 'BLOCKED', sort: 'accountNumber,asc', page: 0 });
  assert.equal(instance.filtered(), true);
});

test('search waits for typing to pause; the form submits at once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const instance = component(t, ClientsPage, [
    { provide: CLIENT_ACCOUNTS, useValue: api({ list: async (filters) => { calls.push(filters.search); return list; } }) },
  ]);
  await settle();
  instance.search('NT'); instance.search('NT-DEMO');
  t.mock.timers.tick(299);
  assert.deepEqual(calls, ['']);
  t.mock.timers.tick(1);
  await settle();
  assert.deepEqual(calls, ['', 'NT-DEMO']);
  instance.update({ search: ORDER });
  await settle();
  assert.deepEqual(calls.at(-1), ORDER);
});

test('operations staff are told they can paste an order ID; empty and failed lists say so plainly', async (t) => {
  let fail = { status: 500, message: 'password=do-not-display' };
  const fixture = await render(t, ClientsPage, {}, [
    provideRouter([]), role('OPERATIONS'),
    { provide: CLIENT_ACCOUNTS, useValue: api({ list: async () => { if (fail) throw fail; return page([]); } }) },
  ]);
  await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.doesNotMatch(host.textContent, /Paste its order ID above/, 'the search placeholder already says a full order ID works');
  assert.equal(host.querySelector('input[name="search"]').placeholder, 'Account, client name or email, or a full order ID');
  assert.match(host.textContent, /Could not load client accounts/);
  assert.doesNotMatch(host.textContent, /do-not-display/);
  fail = { status: 400 };
  await fixture.componentInstance.load(); fixture.detectChanges();
  assert.match(host.textContent, /Those filters could not be applied/);
  fail = null;
  await fixture.componentInstance.load(); fixture.detectChanges();
  assert.match(host.textContent, /No client accounts yet/);
  fixture.componentInstance.filters.set({ ...fixture.componentInstance.filters(), status: 'CLOSED' });
  fixture.detectChanges();
  assert.match(host.textContent, /No accounts match these filters/);
});

test('a slow list answer never replaces a newer one', async (t) => {
  const pending = [];
  const instance = component(t, ClientsPage, [
    { provide: CLIENT_ACCOUNTS, useValue: api({ list: () => new Promise((resolve) => pending.push(resolve)) }) },
  ]);
  void instance.load();
  pending[1](page([account('NEW')]));
  await settle();
  pending[0](page([account('OLD')]));
  await settle();
  assert.equal(instance.result().content[0].accountNumber, 'NEW');
  assert.equal(instance.range(), '1–1 of 1');
});

function detailPage(t, overrides = {}, userRole = 'ANALYST') {
  const params = new BehaviorSubject(convertToParamMap({ id: ACCOUNT }));
  return render(t, ClientDetailPage, {}, [
    provideRouter([]), role(userRole),
    { provide: CLIENT_ACCOUNTS, useValue: api(overrides) },
    { provide: ActivatedRoute, useValue: { paramMap: params, snapshot: { queryParams: {} } } },
  ]).then((fixture) => ({ fixture, params }));
}

test('the client detail shows the summary, traded value and holdings, with a back link to the list', async (t) => {
  const { fixture } = await detailPage(t);
  await settle(); await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.equal(host.querySelector('h1').textContent.trim(), 'Maya Chen');
  assert.equal(host.querySelector('.subtitle').textContent.trim(), 'NT-DEMO-0001 · Individual account · maya.chen@example.test');
  assert.equal(host.querySelector('[data-testid="client-value"]').textContent.trim(), '$5,200.50');
  assert.equal(host.querySelector('[data-testid="client-positions"]').textContent.trim(), '1');
  assert.equal(host.querySelector('[data-testid="client-trades"]').textContent.trim(), '2');
  assert.equal(host.querySelector('[data-testid="client-last-trade"]').textContent.trim(), 'Oct 16');
  assert.match(host.textContent, /1:30 PM CT/);
  const holding = [...host.querySelectorAll('tbody tr td')].map((cell) => cell.textContent.trim());
  assert.deepEqual(holding, ['AAPLApple Inc.', '2', '$225.10', '$450.20', '100.0%']);
  assert.equal(host.querySelector('[data-testid="client-cost-basis"]').textContent.trim(), '$450.20');
  assert.deepEqual([...host.querySelectorAll('.legend li')].map((item) => item.textContent.trim()), ['AAPL100.0%']);
  const flows = [...host.querySelectorAll('.flow')].map((row) => row.getAttribute('aria-label'));
  assert.deepEqual(flows, ['MSFT: bought $0.00, sold $505.00', 'AAPL: bought $450.20, sold $0.00'], 'bought and sold value per stock, from the fills');
  assert.equal(host.querySelector('.back-link').getAttribute('href'), '/clients');
});

test('the orders tab loads once, searches by symbol or order ID, and pages', async (t) => {
  const calls = [];
  const { fixture } = await detailPage(t, { orders: async (id, filters) => { calls.push([id, filters]); return { ...orders, totalPages: 2, totalElements: 30 }; } });
  await settle(); fixture.detectChanges();
  const instance = fixture.componentInstance;
  await settle();
  assert.deepEqual(calls.map(([, filters]) => filters), [{ search: '', page: 0 }, { search: '', page: 1 }], 'the overview chart reads every page of fills');
  assert.match(fixture.nativeElement.textContent, /From the latest 4 of 30 fills/);
  button(fixture, 'Orders');
  await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.at(-1), [ACCOUNT, { search: '', page: 0 }], 'the Orders tab loads its own first page');
  assert.match(host.querySelector('[role="tab"][aria-selected="true"]').textContent, /Orders \(30\)/);
  const cells = [...host.querySelectorAll('tbody tr:first-child td')].map((cell) => cell.textContent.trim());
  assert.deepEqual(cells, ['Oct 16, 2026, 1:30:00 PM CT', 'AAPL', 'Buy', '2', '$225.10', '$450.20', '3f2c9a1e…']);
  assert.equal(host.querySelector('tbody tr:nth-child(2) td:nth-child(5)').textContent.trim(), '$505.00');
  assert.ok(host.querySelector('tbody tr:nth-child(2) .side-mark.sell'), 'sells are marked');
  assert.equal(host.querySelector('[data-testid="client-bought"]').textContent.trim(), '$900.40');
  assert.equal(host.querySelector('[data-testid="client-sold"]').textContent.trim(), '$1,010.00');
  assert.equal(host.querySelector('[data-testid="client-net"]').textContent.trim(), '-$109.60');
  assert.match(host.textContent, /Latest 4 of 30 fills/);
  assert.equal(host.querySelector('select[name="orderStatus"]'), null, 'every order in the dataset is filled');
  assert.equal(host.querySelector(`[title="${ORDER}"]`).tagName, 'SPAN', 'analysts see the ID without a link');
  assert.equal(host.querySelectorAll('tbody a').length, 0);
  instance.show('overview'); instance.show('orders');
  assert.equal(calls.length, 3, 'switching back does not reload');
  instance.ordersPage(1);
  await settle();
  assert.deepEqual(calls.at(-1)[1], { search: '', page: 1 });
  instance.filterOrders({ search: 'msft' });
  await settle();
  assert.deepEqual(calls.at(-1)[1], { search: 'msft', page: 0 });
});

test('operations staff open any order in Trade lookup, carrying the account for the way back', async (t) => {
  const { fixture } = await detailPage(t, {}, 'OPERATIONS');
  await settle(); fixture.detectChanges();
  button(fixture, 'Orders');
  await settle(); fixture.detectChanges();
  const host = fixture.nativeElement;
  assert.match(host.textContent, /Select an order ID to open its full trail in Trade lookup/);
  const link = host.querySelector('a.order-link');
  assert.equal(link.getAttribute('href'), `/trades/${ORDER}?account=${ACCOUNT}`);
  assert.equal(link.getAttribute('aria-label'), `Open order ${ORDER} in Trade lookup`);
  assert.equal(host.querySelectorAll('a.order-link').length, 2);
});

test('unknown accounts, bad links and failures get fixed messages; a new account resets the page', async (t) => {
  const failures = { [ACCOUNT]: Object.assign(new Error('404 body'), { status: 404 }) };
  const { fixture, params } = await detailPage(t, {
    detail: async (id) => { if (failures[id]) throw failures[id]; return detail; },
    orders: async () => { throw new Error('secret'); },
  });
  await settle(); fixture.detectChanges();
  const instance = fixture.componentInstance;
  assert.equal(instance.error(), 'No trading account was found for this link.');
  failures[ACCOUNT] = new Error('password=do-not-display');
  await instance.open(ACCOUNT);
  assert.equal(instance.error(), 'Could not load this account. Please try again.');
  params.next(convertToParamMap({ id: 'not-an-account' }));
  await settle();
  assert.equal(instance.error(), 'That is not a valid account link.');
  delete failures[ACCOUNT];
  await instance.open(ACCOUNT);
  instance.show('orders');
  await settle();
  assert.equal(instance.ordersError(), 'Could not load this account\'s orders. Please try again.');
  instance.tab.set('orders');
  params.next(convertToParamMap({ id: 'e0000000-0000-4000-8000-000000000002' }));
  await settle();
  assert.equal(instance.tab(), 'overview');
  assert.equal(instance.orders(), null);
});

test('a slow detail answer for an earlier account never replaces the current one', async (t) => {
  const pending = {};
  const other = 'e0000000-0000-4000-8000-000000000002';
  const instance = component(t, ClientDetailPage, [{ provide: CLIENT_ACCOUNTS, useValue: api({
    detail: (id) => new Promise((resolve) => { pending[id] = resolve; }),
  }) }]);
  const first = instance.open(ACCOUNT);
  const second = instance.open(other);
  pending[other]({ ...detail, account: account('NT-2', { accountId: other }) });
  await second;
  pending[ACCOUNT](detail);
  await first;
  assert.equal(instance.detail().account.accountNumber, 'NT-2');
  assert.equal(instance.loading(), false);
  assert.equal(instance.shortId(ORDER), '3f2c9a1e');
  assert.equal(instance.price(null), '–');
  assert.equal(instance.price(225.3219), '$225.3219');
});

test('the configured provider calls the list, detail and orders endpoints', async (t) => {
  const { createEnvironmentInjector, Injector, runInInjectionContext } = await import('@angular/core');
  const { ApiHttpClient } = await import('@lilleap/session-core/angular');
  const { of } = await import('rxjs');
  const { appConfig } = await import('../src/app/app.config.ts');
  const calls = [];
  const http = { get: (url, options) => { calls.push([url, options?.params]); return of(list); } };
  const injector = createEnvironmentInjector([{ provide: ApiHttpClient, useValue: http }], Injector.NULL);
  t.after(() => injector.destroy());
  const provider = appConfig.providers.find((item) => item.provide === CLIENT_ACCOUNTS);
  const clients = runInInjectionContext(injector, () => provider.useFactory());
  await clients.list({ search: 'demo', level: '', status: 'BLOCKED', sort: 'accountNumber,asc', page: 0 });
  await clients.detail(ACCOUNT);
  await clients.orders(ACCOUNT, { search: 'AAPL', page: 2 });
  assert.deepEqual(calls, [
    ['/api/v1/reports/clients', { search: 'demo', status: 'BLOCKED', sort: 'accountNumber,asc', size: '25' }],
    [`/api/v1/reports/clients/${ACCOUNT}`, undefined],
    [`/api/v1/reports/clients/${ACCOUNT}/orders`, { search: 'AAPL', page: '2', size: '25' }],
  ]);
});
