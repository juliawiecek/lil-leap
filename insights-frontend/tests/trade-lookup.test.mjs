import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { Subject } from 'rxjs';
import { convertToParamMap, ActivatedRoute, Router, provideRouter } from '@angular/router';
const { TradeLookupPage } = await import('../src/app/pages/trade-lookup/trade-lookup-page.ts');
const { TRADE_RECORDS } = await import('../src/app/trade-records.ts');
const { tradeCase, notionalCents, cents } = await import('../src/app/pages/trade-lookup/trade-case.ts');

const ID = 'f0000000-0000-4000-8000-000000000012';
const ACCOUNT = 'e0000000-0000-4000-8000-000000000001';
/** A buy of 49 shares at 49.525 from the reporting dataset. */
const trade = {
  orderId: ID,
  filledAt: '2026-10-05T18:04:36Z',
  symbol: 'BAC',
  instrumentName: 'Bank of America Corporation',
  side: 'BUY',
  quantity: 49,
  price: 49.525,
  value: 2426.73,
  account: {
    accountId: ACCOUNT, accountNumber: 'NT-DEMO-0001', accountName: 'Maya Chen Individual', clientName: 'Maya Chen',
    email: 'maya.chen@demo.nexttrade.local', traderLevel: 'NOVICE', status: 'ACTIVE',
  },
  /** The eight steps the seed records for a fill: 49 x 49.525 = 2426.725, settled as -2426.73. */
  events: [
    { source: 'STATUS', type: 'SUBMITTED', actor: null, occurredAt: '2026-10-05T18:04:34Z', details: { reasonCode: 'SUBMISSION_VALIDATED' } },
    { source: 'STATUS', type: 'ACCEPTED', actor: null, occurredAt: '2026-10-05T18:04:35Z', details: { reasonCode: 'ORDER_ACCEPTED' } },
    { source: 'STATUS', type: 'FILLED', actor: null, occurredAt: '2026-10-05T18:04:36Z', details: { reasonCode: 'EXECUTION_SUCCESS' } },
    { source: 'AUDIT', type: 'ORDER_FILLED', actor: 'SYSTEM', occurredAt: '2026-10-05T18:04:36Z', details: { quantity: 49, executionPrice: '49.525', cashDelta: '-2426.73' } },
    { source: 'AUDIT', type: 'SETTLEMENT_COMPLETED', actor: 'SYSTEM', occurredAt: '2026-10-05T18:04:36Z', details: { quantity: 49, executionPrice: '49.525', cashDelta: '-2426.73' } },
    { source: 'FILL', type: 'FILLED', actor: null, occurredAt: '2026-10-05T18:04:36Z', details: { quantity: 49, price: '49.525', quoteTimestamp: '2026-10-05T18:04:35Z' } },
    { source: 'CASH', type: 'BUY', actor: null, occurredAt: '2026-10-05T18:04:36Z', details: { amount: '-2426.73', currency: 'USD', settledAt: '2026-10-05T18:04:36Z' } },
    { source: 'HOLDING', type: 'BUY', actor: null, occurredAt: '2026-10-05T18:04:36Z', details: { quantityChange: 49, costBasis: '49.525' } },
  ],
};
const failed = (summary) => summary.checks.filter((check) => !check.ok).map((check) => check.label);
const without = (keep) => ({ events: trade.events.filter(keep) });

test('amounts are exact to the cent, rounded half-up like settlement', () => {
  assert.equal(notionalCents('49', '49.525'), 242673n);
  assert.equal(notionalCents('3', '10.005'), 3002n, '30.015 rounds up to 30.02');
  assert.equal(notionalCents('2', '10.5'), 2100n);
  assert.equal(notionalCents('2', 'abc'), null);
  assert.equal(cents('-2426.73'), -242673n);
  assert.equal(cents('12.5'), 1250n);
  assert.equal(cents('12.345'), null);
});

test('a correctly settled fill passes every record check', () => {
  const summary = tradeCase(trade);
  assert.equal(summary.status, 'FILLED');
  assert.equal(summary.side, 'BUY');
  assert.equal(summary.quantity, '49');
  assert.equal(summary.cashDelta, '-2426.73');
  assert.deepEqual(failed(summary), []);
  assert.match(summary.checks.find((check) => check.label === 'Cash matches fill').detail, /-2426\.73 USD = 49 × 49\.525/);
});

test('missing or mismatched settlement parts are flagged for review', () => {
  assert.deepEqual(failed(tradeCase(without((event) => event.source !== 'CASH'))), ['Cash movement']);
  const wrongCash = { events: trade.events.map((event) =>
    event.source === 'CASH' ? { ...event, details: { amount: '-2426.70' } } : event) };
  assert.deepEqual(failed(tradeCase(wrongCash)), ['Cash matches fill']);
  const wrongShares = { events: trade.events.map((event) =>
    event.source === 'HOLDING' ? { ...event, details: { quantityChange: 48 } } : event) };
  assert.deepEqual(failed(tradeCase(wrongShares)), ['Shares match fill']);
  assert.ok(failed(tradeCase(without((event) => event.type !== 'FILLED' || event.source !== 'STATUS'))).includes('Status'));
  assert.deepEqual(failed(tradeCase(without((event) => event.source !== 'AUDIT'))), ['Audit trail']);
});

test('a rejection shows its reason and needs no settlement checks', () => {
  const summary = tradeCase({ events: [
    { source: 'STATUS', type: 'SUBMITTED', actor: null, occurredAt: '2026-10-05T18:04:34Z', details: {} },
    { source: 'AUDIT', type: 'ORDER_REJECTED', actor: 'SYSTEM', occurredAt: '2026-10-05T18:04:35Z', details: {} },
    { source: 'STATUS', type: 'REJECTED', actor: null, occurredAt: '2026-10-05T18:04:35Z',
      details: { reasonCode: 'PRICE_MOVED', reasonText: 'The price rose 3.1% before your order filled.' } },
  ] });
  assert.equal(summary.status, 'REJECTED');
  assert.match(summary.reason, /price rose 3\.1%/);
  assert.deepEqual(summary.checks.map((check) => check.label), ['Audit trail', 'Final outcome']);
  assert.equal(summary.quantity, null);
  assert.equal(tradeCase({ events: [] }).status, null);
});

function page(t, records, params = new Subject()) {
  const navigations = [];
  const instance = component(t, TradeLookupPage, [
    { provide: TRADE_RECORDS, useValue: records },
    { provide: Router, useValue: { navigate: async (parts) => { navigations.push(parts); } } },
    { provide: ActivatedRoute, useValue: { paramMap: params } },
  ]);
  return { instance, navigations, params };
}

test('a typed order ID is checked, then opened by URL so the lookup can be bookmarked', async (t) => {
  const { instance, navigations } = page(t, { load: async () => trade });
  instance.query.set('not-an-id'); instance.submit();
  assert.match(instance.error(), /full order ID/);
  assert.deepEqual(navigations, []);
  instance.query.set(` ${ID.toUpperCase()} `); instance.submit();
  assert.deepEqual(navigations, [['/trades', ID]]);
});

test('the URL loads the trade; unknown orders and failures get fixed messages', async (t) => {
  const { instance, params } = page(t, { load: async (id) => {
    if (id === ID) return trade;
    if (id === '11111111-2222-3333-4444-555555555555') throw Object.assign(new Error('secret'), { status: 500 });
    throw Object.assign(new Error('404 body'), { status: 404 });
  } });
  await instance.show(ID);
  assert.equal(instance.result(), trade);
  await instance.show('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(instance.error(), 'No trade was found with that order ID.');
  await instance.show('11111111-2222-3333-4444-555555555555');
  assert.equal(instance.error(), 'Could not load the trade. Please try again.');
  await instance.show('nonsense');
  assert.equal(instance.error(), 'That is not a valid order ID.');
  params.next(convertToParamMap({}));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(instance.result(), null);
  assert.equal(instance.error(), '');
});

test('a slow answer for an earlier order never replaces the current one', async (t) => {
  let finishFirst;
  const { instance } = page(t, { load: (id) => id === ID
    ? new Promise((resolve) => { finishFirst = resolve; })
    : Promise.resolve({ ...trade, orderId: id }) });
  const first = instance.show(ID);
  await instance.show('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  finishFirst(trade); await first;
  assert.equal(instance.result().orderId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(instance.loading(), false);
});

test('the rendered page shows the fill, the client, the record checks and every step in plain words', async (t) => {
  const fixture = await render(t, TradeLookupPage, {}, [
    provideRouter([]),
    { provide: TRADE_RECORDS, useValue: { load: async () => trade } },
    { provide: ActivatedRoute, useValue: { paramMap: new Subject() } },
  ]);
  const host = fixture.nativeElement;
  assert.match(host.textContent, /Look up a trade/);
  input(fixture, 'input[name="orderId"]', ID);
  assert.equal(fixture.componentInstance.query(), ID);
  await fixture.componentInstance.show(ID); fixture.detectChanges();
  const details = [...host.querySelectorAll('dl.details')].map((list) =>
    [...list.querySelectorAll('dd')].map((dd) => dd.textContent.replace(/\s+/g, ' ').trim()));
  assert.deepEqual(details[0], ['BAC · Bank of America Corporation', 'Buy', '49 shares at $49.525', '$2,426.73',
    'Oct 5, 2026, 1:04:36 PM CT']);
  assert.deepEqual(details[1], ['Maya Chen', 'maya.chen@demo.nexttrade.local', 'NT-DEMO-0001 · Maya Chen Individual', 'Novice']);
  assert.equal(host.querySelector('a.account-link').getAttribute('href'), `/clients/${ACCOUNT}`);
  assert.match(host.textContent, /All consistent/);
  assert.match(host.textContent, /8 steps, oldest first/);
  const rows = [...host.querySelectorAll('tbody tr')];
  assert.deepEqual([...rows[0].children].slice(0, 3).map((cell) => cell.textContent.trim()),
    ['Oct 5, 2026, 1:04:34 PM CT', 'Status change', 'Submitted']);
  assert.deepEqual(rows.map((row) => row.children[2].textContent.trim()),
    ['Submitted', 'Accepted', 'Filled', 'Order filled', 'Settlement completed', 'Filled', 'Buy', 'Buy']);
  const stepDetails = (row) => [...rows[row].children[3].querySelectorAll('span')]
    .map((span) => span.textContent.replace(/\s+/g, ' ').trim());
  assert.deepEqual(stepDetails(0), ['Reason code Submission validated']);
  assert.deepEqual(stepDetails(3), ['Shares 49', 'Price $49.525', 'Cash −$2,426.73']);
  assert.deepEqual(stepDetails(5), ['Shares 49', 'Price $49.525', 'Quote time 1:04:35 PM CT']);
  assert.deepEqual(stepDetails(6), ['Cash −$2,426.73', 'Settled 1:04:36 PM CT'], 'the currency is not repeated');
  assert.deepEqual(stepDetails(7), ['Shares 49', 'Cost basis $49.525']);
  assert.equal(fixture.componentInstance.sourceLabel('OTHER'), 'OTHER');
  assert.deepEqual(fixture.componentInstance.fields({ ...trade.events[0], details: { newField: 'x', when: null } }),
    [{ label: 'New field', value: 'x' }], 'unknown fields keep a readable label; empty ones are left out');
});

test('opened from a client account, the lookup offers the way back to it; other values are ignored', async (t) => {
  const navigations = [];
  const query = new Subject();
  const instance = component(t, TradeLookupPage, [
    { provide: TRADE_RECORDS, useValue: { load: async () => trade } },
    { provide: Router, useValue: { navigate: async (parts) => { navigations.push(parts); } } },
    { provide: ActivatedRoute, useValue: { paramMap: new Subject(), queryParamMap: query } },
  ]);
  query.next(convertToParamMap({ account: ACCOUNT.toUpperCase() }));
  assert.equal(instance.fromAccount(), ACCOUNT);
  instance.backToAccount();
  assert.deepEqual(navigations, [['/clients', ACCOUNT]]);
  query.next(convertToParamMap({ account: '../../evil' }));
  assert.equal(instance.fromAccount(), '');
});

test('the configured provider calls the trade endpoint', async (t) => {
  const { createEnvironmentInjector, Injector, runInInjectionContext } = await import('@angular/core');
  const { ApiHttpClient } = await import('@lilleap/session-core/angular');
  const { of } = await import('rxjs');
  const { appConfig } = await import('../src/app/app.config.ts');
  const calls = [];
  const http = { get: (url) => { calls.push(url); return of(trade); } };
  const injector = createEnvironmentInjector([{ provide: ApiHttpClient, useValue: http }], Injector.NULL);
  t.after(() => injector.destroy());
  const provider = appConfig.providers.find((item) => item.provide === TRADE_RECORDS);
  const records = runInInjectionContext(injector, () => provider.useFactory());
  assert.equal(await records.load(ID), trade);
  assert.deepEqual(calls, [`/api/v1/trades/${ID}`]);
});
