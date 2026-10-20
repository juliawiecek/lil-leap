import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input } from './dom-helper.mjs';
import { component } from './component-helper.mjs';
import { Subject } from 'rxjs';
import { convertToParamMap, ActivatedRoute, Router, provideRouter } from '@angular/router';
const { TradeLookupPage } = await import('../src/app/pages/trade-lookup/trade-lookup-page.ts');
const { TRADE_RECORDS } = await import('../src/app/trade-records.ts');

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
};

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

test('the rendered page shows the fill and the client, with a link to their account', async (t) => {
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
  assert.match(host.textContent, /Filled/);
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
