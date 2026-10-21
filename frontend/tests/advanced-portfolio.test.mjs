import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { signal } from '@angular/core';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { AdvancedPortfolio } = await import('../src/app/advanced-portfolio.ts');
const { AuthService } = await import('../src/app/auth.service.ts');

function chart(t) {
  const feed = fakeFeed([{ symbol: 'AAPL', price: 110 }]);
  const view = component(t, AdvancedPortfolio, [feedProvider(feed), { provide: AuthService, useValue: { accessToken: 'test' } }]);
  view.account = signal({ account_id: 'a', account_name: 'Trading', created_at: new Date(Date.now() - 86400000).toISOString() });
  view.value = signal(1020); view.loaded = signal(true);
  view.clients.cashActivityClient.list = async () => [{ amount: 1000, occurredAt: view.account().created_at, settlementStatus: 'SETTLED' }];
  view.clients.orderHistoryClient.list = async () => [{ status: 'FILLED', side: 'BUY', symbol: 'AAPL', fillPrice: 100, filledQuantity: 2, filledAt: view.account().created_at }];
  feed.client = { closes: async () => [{ at: Date.parse(view.account().created_at), price: 100 }, { at: Date.now() - 1000, price: 110 }] };
  view.period.set('ALL');
  return view;
}

test('overall account history combines cash and fills and labels deposits as value changes', async t => {
  const view = chart(t);
  await view.load();
  assert.equal(view.error(), '');
  assert.equal(view.points()[0].value, 1000);
  assert.equal(view.points().at(-1).value, 1020);
  assert.deepEqual(view.change(), { amount: 20, percent: 2 });
  view.clients.cashActivityClient.list = async () => [
    { amount: 1000, occurredAt: view.account().created_at, settlementStatus: 'SETTLED' },
    { amount: 500, occurredAt: new Date(Date.now() - 1000).toISOString(), settlementStatus: 'SETTLED' },
    { amount: 900, occurredAt: new Date().toISOString(), settlementStatus: 'PENDING' },
  ];
  await view.load();
  assert.equal(view.points().at(-1).value, 1520, 'settled deposits affect value; pending deposits do not');
});

test('overall chart ignores stale account responses and recovers from history failures', async t => {
  const view = chart(t);
  let resolve;
  view.clients.cashActivityClient.list = ({ accountId }) => accountId === 'a' ? new Promise(r => { resolve = r; }) : Promise.resolve([{ amount: 300, occurredAt: new Date(Date.now() - 10000).toISOString(), settlementStatus: 'SETTLED' }]);
  view.clients.orderHistoryClient.list = async () => [];
  const old = view.load();
  view.account.set({ account_id: 'b' });
  await view.load();
  resolve([{ amount: 9999, occurredAt: new Date(Date.now() - 10000).toISOString(), settlementStatus: 'SETTLED' }]);
  await old;
  assert.equal(view.points().at(-1).value, 300);
  view.clients.cashActivityClient.list = async () => { throw new Error('offline'); };
  await view.load(); assert.match(view.error(), /unavailable/); assert.equal(view.change(), null);
  view.clients.cashActivityClient.list = async () => [];
  await view.load(); assert.equal(view.error(), '');
});

test('after-hours 1D requests reach back to the session and exclude later prices', async t => {
  const view = chart(t);
  const now = Date.parse('2026-10-21T04:00:00Z');
  t.mock.method(Date, 'now', () => now);
  view.period.set('1D');
  view.account.set({ account_id: 'a', created_at: '2026-10-19T13:00:00Z' });
  let requested;
  view.feed.client.closes = async (id, interval, limit) => {
    requested = { interval, limit };
    return [
      { at: Date.parse('2026-10-20T13:35:00Z'), price: 100 },
      { at: Date.parse('2026-10-20T19:55:00Z'), price: 110 },
      { at: Date.parse('2026-10-21T03:55:00Z'), price: 999 },
    ];
  };
  await view.load();
  assert.equal(requested.interval, '5m');
  assert.ok(requested.limit * 300000 >= now - Date.parse('2026-10-20T13:30:00Z'));
  assert.equal(view.points()[0].value, 1000);
  assert.equal(view.points().at(-1).value, 1020);
  assert.ok(view.points().length > 2, 'session price movements reach the line');
});
