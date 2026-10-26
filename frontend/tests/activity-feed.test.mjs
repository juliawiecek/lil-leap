import { apiHttp } from './http-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { OrderHistoryClient, newlyFilled, hasOpenOrders } = await import('../src/app/order-history-api.ts');
const { ActivityFeed } = await import('../src/app/activity-feed.ts');
const { OrderHistoryService } = await import('../src/app/order-history.service.ts');
const { CashActivityService } = await import('../src/app/cash-activity.service.ts');
const { CashActivityClient, buildActivity, orderItem, cashItem, formatMoney, formatLocalTime, trailStep } = await import('../src/app/activity-api.ts');

const USER_ID = '7c2e33ef-b0ee-43b0-8040-90481f82236e';
const encode = value => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const token = `${encode({ alg: 'HS256' })}.${encode({ sub: USER_ID, exp: 2, iat: 1 })}.signature`;
const row = (overrides = {}) => ({
  orderId: 'o-1', symbol: 'AAPL', side: 'BUY', quantity: 1, status: 'FILLED',
  submittedAt: '2026-09-30T18:00:00Z', fillPrice: '225.05', filledQuantity: 1, filledAt: '2026-09-30T18:00:02Z',
  ...overrides,
});

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, fetchImpl };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('client calls the callerâ€™s own history with only the filters supplied and the bearer token', async () => {
  const { calls, fetchImpl } = fakeFetch(json(200, [row()]));
  const client = new OrderHistoryClient({ accessToken: token }, apiHttp(fetchImpl));

  const rows = await client.list({ from: '2026-09-01', to: '', status: 'FILLED' });

  assert.equal(calls[0].url, `/api/v1/clients/${USER_ID}/orders?from=2026-09-01&status=FILLED`);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(rows[0].fillPrice, 225.05);
});

test('client sends no query string when no filters are set', async () => {
  const { calls, fetchImpl } = fakeFetch(json(200, []));
  await new OrderHistoryClient({ accessToken: token }, apiHttp(fetchImpl)).list();
  assert.equal(calls[0].url, `/api/v1/clients/${USER_ID}/orders`);
});

test('client refuses to call the server when signed out', async () => {
  const { calls, fetchImpl } = fakeFetch(json(200, []));
  await assert.rejects(new OrderHistoryClient({ accessToken: null }, apiHttp(fetchImpl)).list(), /Sign in/);
  assert.equal(calls.length, 0);
});

test('client surfaces the serverâ€™s error message, or a friendly fallback', async () => {
  const withMessage = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(json(400, { error: 'INVALID_FILTER', message: 'Unknown status: X' })).fetchImpl));
  await assert.rejects(withMessage.list({ status: 'X' }), /Unknown status: X/);

  const noBody = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new Response('oops', { status: 500 })).fetchImpl));
  await assert.rejects(noBody.list(), /Could not load your orders/);

  const offline = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new TypeError('network')).fetchImpl));
  await assert.rejects(offline.list(), /Could not reach the server/);
});


test('the app-wide services use the signed-in user’s token, so they refuse while signed out', async t => {
  const { AuthService } = await import('../src/app/auth.service.ts');
  await assert.rejects(component(t, OrderHistoryService, [AuthService]).list(), /Sign in/);
  await assert.rejects(component(t, CashActivityService, [AuthService]).list(), /Sign in/);
});

test('cash client reads the caller’s deposits and transfers with only the filters supplied', async () => {
  const { calls, fetchImpl } = fakeFetch(json(200, [{ transactionId: 't1', accountId: 'a1', accountName: 'Brokerage', type: 'DEPOSIT', amount: '25000.00', settlementStatus: 'SETTLED', occurredAt: '2026-10-01T09:00:00Z' }]));
  const rows = await new CashActivityClient({ accessToken: token }, apiHttp(fetchImpl)).list({ from: '2026-10-01', to: '', accountId: 'a1' });
  assert.equal(calls[0].url, '/api/v1/accounts/cash-activity?from=2026-10-01&accountId=a1');
  assert.equal(rows[0].amount, 25000);
  await new CashActivityClient({ accessToken: token }, apiHttp(fakeFetch(json(200, [])).fetchImpl)).list();
  await assert.rejects(new CashActivityClient({ accessToken: token }, apiHttp(fakeFetch(new Response('x', { status: 500 })).fetchImpl)).list(), /cash activity/);
  await assert.rejects(new CashActivityClient({ accessToken: token }, apiHttp(fakeFetch(new TypeError('net')).fetchImpl)).list(), /Could not reach the server/);
});

const deposit = { transactionId: 't1', accountId: 'a1', accountName: 'Brokerage', type: 'DEPOSIT', amount: 25000, settlementStatus: 'SETTLED', occurredAt: '2026-09-29T09:00:00Z' };
const transferOut = { ...deposit, transactionId: 't2', type: 'TRANSFER', amount: -100, settlementStatus: 'PENDING', occurredAt: '2026-10-01T09:00:00Z' };

test('orders, fills, rejections and cash movements become one newest-first timeline (PS-11)', () => {
  const filled = { ...row(), fillPrice: 225.05 };
  const rejected = row({ orderId: 'o-2', side: 'SELL', quantity: 3, status: 'REJECTED', fillPrice: null, filledQuantity: null, filledAt: null, submittedAt: '2026-09-30T19:00:00Z' });
  const items = buildActivity([filled, rejected], [deposit, transferOut]);
  assert.deepEqual(items.map(i => [i.title, i.amount]), [
    ['Transfer out', -100], ['Sell 3 AAPL', null], ['Bought 1 AAPL', -225.05], ['Deposit', 25000],
  ]);
  assert.equal(items[0].detail, 'Brokerage · settling');
  assert.equal(items[1].detail, 'Rejected, nothing was charged');
  assert.equal(items[2].detail, 'Filled at $225.05');
  assert.equal(items[2].at, '2026-09-30T18:00:02Z', 'a fill is dated when it filled');
  assert.deepEqual(buildActivity([filled], [deposit], 'Orders').map(i => i.kind), ['order']);
  assert.deepEqual(buildActivity([filled], [deposit], 'Cash').map(i => i.kind), ['cash']);
  assert.equal(orderItem(row({ status: 'ACCEPTED', fillPrice: null })).detail, 'Accepted');
  assert.equal(cashItem({ ...deposit, type: 'TRANSFER', amount: 5 }).title, 'Transfer in');
  assert.equal(cashItem({ ...deposit, type: 'DIVIDEND' }).title, 'Dividend');
  assert.equal(cashItem({ ...deposit, type: 'ADJUSTMENT' }).title, 'Adjustment');
});

test('money and times are formatted the same way everywhere, with the time zone shown', () => {
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatMoney(25, true), '+$25.00');
  assert.equal(formatMoney(-25, true), '−$25.00');
  assert.equal(formatMoney(-25), '−$25.00');
  assert.equal(formatMoney(0, true), '$0.00');
  assert.match(formatLocalTime('2026-10-16T13:05:00Z', 'en-GB', 'Europe/Dublin'), /^16 Oct 2026, 14:05 (IST|GMT\+1)$/);
  assert.equal(formatLocalTime('not a date'), '');
});

test('fills since the last read are found once, and open orders keep polling alive (PS-10)', () => {
  const accepted = row({ status: 'ACCEPTED' });
  const filled = row();
  assert.deepEqual(newlyFilled(null, [filled]), [], 'the first read reports nothing');
  assert.deepEqual(newlyFilled([accepted], [filled]).map(r => r.orderId), ['o-1']);
  assert.deepEqual(newlyFilled([filled], [filled]), []);
  assert.equal(hasOpenOrders([accepted]), true);
  assert.equal(hasOpenOrders([filled, row({ status: 'REJECTED' })]), false);
});

function feedWith(orders, cash = () => [], events = async () => ({ orderId: 'o-1', status: 'FILLED', events: [] })) {
  const calls = { orders: [], cash: [], events: [] };
  return {
    calls,
    providers: [
      { provide: OrderHistoryService, useValue: {
        list: async filters => { calls.orders.push(filters); return orders(filters); },
        events: async orderId => { calls.events.push(orderId); return events(orderId); },
      } },
      { provide: CashActivityService, useValue: { list: async filters => { calls.cash.push(filters); return cash(filters); } } },
    ],
  };
}

const step = (type, overrides = {}) => ({ type, reasonCode: null, reasonText: null, at: '2026-09-30T18:00:00Z', details: {}, ...overrides });

test('every recorded step reads as plain words with the price, cash and reason where they matter (BR-15)', () => {
  assert.deepEqual([trailStep(step('SUBMITTED')).label, trailStep(step('SUBMITTED')).tone], ['Order received', 'done']);
  assert.equal(trailStep(step('ACCEPTED', { reasonCode: 'ORDER_ACCEPTED' })).detail, 'All checks passed. Sent for execution.');
  const waiting = trailStep(step('PENDING', { reasonCode: 'MARKET_CLOSED' }));
  assert.deepEqual([waiting.label, waiting.detail, waiting.tone], ['Waiting', 'The market is closed. It fills at the next open.', 'waiting']);
  assert.equal(trailStep(step('DELAYED', { reasonText: 'Retrying in a moment.' })).detail, 'Retrying in a moment.');
  assert.equal(trailStep(step('PENDING')).detail, 'Your order is in the queue.');
  const priced = trailStep(step('PRICE_DECISION', { details: { actualPrice: 227.4, limitPrice: '231.95' } }));
  assert.deepEqual([priced.label, priced.detail], ['Priced at $227.40', 'Within your protection limit of $231.95.']);
  assert.equal(trailStep(step('PRICE_DECISION')).label, 'Priced');
  assert.equal(trailStep(step('FILLED', { reasonCode: 'EXECUTION_SUCCESS' })).label, 'Filled');
  const settled = trailStep(step('SETTLEMENT_COMPLETED', { details: { cashDelta: -2274 } }));
  assert.equal(settled.detail, '−$2,274.00 taken from your cash balance.');
  assert.equal(trailStep(step('SETTLEMENT_COMPLETED', { details: { cashDelta: '150.5' } })).detail, '+$150.50 added to your cash balance.');
  assert.equal(trailStep(step('SETTLEMENT_COMPLETED')).detail, 'Your balances reflect this trade.');
  const rejected = trailStep(step('REJECTED', { reasonCode: 'INSUFFICIENT_CASH' }));
  assert.equal(rejected.tone, 'failed');
  assert.match(rejected.detail, /not enough cash/);
  assert.equal(trailStep(step('REJECTED', { reasonCode: 'PRICE_MOVED', reasonText: 'The price rose 3.1%.' })).detail, 'The price rose 3.1%.');
  const cancelled = trailStep(step('CANCELLED', { reasonCode: 'CANCELLED_BY_CLIENT' }));
  assert.deepEqual([cancelled.label, cancelled.tone], ['Cancelled', 'cancelled']);
  assert.equal(trailStep(step('ORDER_REQUEUED')).label, 'Order requeued');
});

test('client reads an order trail through the shared transport and explains a missing order', async () => {
  const trail = { orderId: 'o-1', status: 'FILLED', events: [{ type: 'SUBMITTED', reasonCode: null, reasonText: null, at: '2026-09-30T18:00:00Z', details: null }] };
  const { calls, fetchImpl } = fakeFetch(json(200, trail));
  const got = await new OrderHistoryClient({ accessToken: token }, apiHttp(fetchImpl)).events('o-1');
  assert.equal(calls[0].url, '/api/v1/orders/o-1/events');
  assert.deepEqual(got.events[0].details, {});
  await assert.rejects(new OrderHistoryClient({ accessToken: null }, apiHttp(fetchImpl)).events('o-1'), /Sign in/);
  await assert.rejects(new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(json(404, {})).fetchImpl)).events('o-9'), /not found/);
  await assert.rejects(new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new Response('x', { status: 500 })).fetchImpl)).events('o-1'), /order details/);
  await assert.rejects(new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new TypeError('net')).fetchImpl)).events('o-1'), /Could not reach the server/);
});

test('Details opens one order trail under its row, follows the feed refresh, and closes again (BR-15)', async t => {
  let trailEvents = [step('SUBMITTED'), step('ACCEPTED', { at: '2026-09-30T18:00:01Z' })];
  const { calls, providers } = feedWith(() => [row({ status: 'ACCEPTED', fillPrice: null }), row({ orderId: 'o-2' })], () => [],
    async orderId => ({ orderId, status: 'ACCEPTED', events: trailEvents }));
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  await flush();
  const first = feed.items().find(i => i.orderId === 'o-1');
  const second = feed.items().find(i => i.orderId === 'o-2');
  assert.equal(feed.expanded(), null);

  await feed.toggleTrail(first);
  assert.equal(feed.expanded(), 'o-1');
  assert.deepEqual(calls.events, ['o-1']);
  assert.deepEqual(feed.steps().map(s => s.label), ['Order received', 'Accepted']);
  assert.equal(feed.trailLoading(), false);

  // The feed's own refresh re-reads the open trail, so a fill shows up without closing it.
  trailEvents = [...trailEvents, step('FILLED', { at: '2026-09-30T18:00:02Z' })];
  await feed.load();
  await flush();
  assert.deepEqual(calls.events, ['o-1', 'o-1']);
  assert.deepEqual(feed.steps().map(s => s.label), ['Order received', 'Accepted', 'Filled']);

  await feed.toggleTrail(second);
  assert.equal(feed.expanded(), 'o-2');
  assert.deepEqual(calls.events, ['o-1', 'o-1', 'o-2']);
  await feed.toggleTrail(second);
  assert.equal(feed.expanded(), null);
  assert.equal(feed.trail(), null);
  await feed.toggleTrail({ kind: 'cash', id: 'cash-1' });
  assert.equal(feed.expanded(), null);
  feed.ngOnDestroy();
});

test('a trail that cannot be loaded says so under the row, and a stale answer never lands on another order', async t => {
  let fail = true;
  const pending = {};
  const { providers } = feedWith(() => [row(), row({ orderId: 'o-2' })], () => [], async orderId => {
    if (fail) throw new Error('Could not reach the server. Check your connection and try again.');
    await new Promise(resolve => { pending[orderId] = resolve; });
    return { orderId, status: 'FILLED', events: [step('SUBMITTED')] };
  });
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  await flush();
  const first = feed.items().find(i => i.orderId === 'o-1');
  const second = feed.items().find(i => i.orderId === 'o-2');
  await feed.toggleTrail(first);
  assert.match(feed.trailError(), /Could not reach the server/);
  assert.equal(feed.trailLoading(), false);

  fail = false;
  await feed.toggleTrail(first); // closes
  const opening = feed.toggleTrail(first); // slow answer for o-1 ...
  await flush();
  const switching = feed.toggleTrail(second); // ... while o-2 is opened meanwhile
  await flush();
  pending['o-1']();
  await opening;
  assert.equal(feed.expanded(), 'o-2');
  assert.equal(feed.trail(), null, 'the late o-1 answer is dropped');
  pending['o-2']();
  await switching;
  assert.equal(feed.trail().orderId, 'o-2');
  feed.ngOnDestroy();
});

test('the feed loads orders and cash together as soon as it is shown', async t => {
  const { calls, providers } = feedWith(() => [row({ fillPrice: 225.05 })], () => [deposit]);
  const feed = component(t, ActivityFeed, providers);
  assert.equal(feed.loaded(), false);
  feed.ngOnInit();
  await flush();
  assert.deepEqual(calls.orders[0], { from: '', to: '' });
  assert.deepEqual(calls.cash[0], { from: '', to: '' });
  assert.deepEqual(feed.items().map(i => i.kind), ['order', 'cash']);
  assert.equal(feed.loading(), false);
  feed.setKind('Cash');
  assert.deepEqual(feed.items().map(i => i.title), ['Deposit']);
  feed.ngOnDestroy();
});

test('the compact feed shows only the newest rows and asks the page to show the rest', async t => {
  const { providers } = feedWith(() => [row(), row({ orderId: 'o-2' }), row({ orderId: 'o-3' })], () => [deposit]);
  const feed = component(t, ActivityFeed, providers);
  t.mock.method(feed, 'limit', () => 2);
  feed.ngOnInit();
  await flush();
  assert.equal(feed.items().length, 2);
  let asked = 0;
  feed.viewAll.subscribe(() => asked++);
  feed.viewAll.emit();
  assert.equal(asked, 1);
  feed.ngOnDestroy();
});

test('changing a date reloads in place with that filter, and clearing restores everything', async t => {
  const { calls, providers } = feedWith(filters => (filters.from ? [] : [row()]));
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  await flush();
  feed.setFrom('2026-09-01');
  await flush();
  assert.deepEqual(calls.orders.at(-1), { from: '2026-09-01', to: '' });
  assert.equal(feed.items().length, 0);
  assert.equal(feed.hasFilters(), true);
  feed.setTo('2026-09-30');
  await flush();
  assert.deepEqual(calls.cash.at(-1), { from: '2026-09-01', to: '2026-09-30' });
  feed.clearFilters();
  await flush();
  assert.deepEqual(calls.orders.at(-1), { from: '', to: '' });
  assert.equal(feed.items().length, 1);
  assert.equal(feed.statusLabel('SETTLED'), 'Settled');
  feed.ngOnDestroy();
});

test('a start date after the end date shows an error without calling the server', async t => {
  const { calls, providers } = feedWith(() => [row()]);
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  await flush();
  const before = calls.orders.length;
  feed.setTo('2026-09-01');
  await flush();
  feed.setFrom('2026-09-30');
  await flush();
  assert.equal(calls.orders.length, before + 1); // only the valid "to" change reached the server
  assert.match(feed.error(), /start date/);
  assert.deepEqual(feed.items(), []);
  feed.ngOnDestroy();
});

test('one failing source still shows the other with a note; both failing shows the error', async t => {
  let ordersDown = false, cashDown = true;
  const { providers } = feedWith(
    () => { if (ordersDown) throw new Error('Could not reach the server. Check your connection and try again.'); return [row()]; },
    () => { if (cashDown) throw new Error('down'); return [deposit]; },
  );
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  await flush();
  assert.equal(feed.items().length, 1);
  assert.match(feed.partial(), /Deposits and transfers could not be loaded/);
  ordersDown = true; cashDown = false;
  await feed.load();
  assert.deepEqual(feed.items().map(i => i.kind), ['cash']);
  assert.match(feed.partial(), /Orders could not be loaded/);
  cashDown = true;
  await feed.load();
  assert.match(feed.error(), /Could not reach the server/);
  assert.deepEqual(feed.items(), []);
  ordersDown = false; cashDown = false;
  await feed.load();
  assert.equal(feed.error(), '');
  assert.equal(feed.partial(), '');
  feed.ngOnDestroy();
});

test('a slow earlier response never overwrites a newer one, and the feed refreshes itself', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let calls = 0;
  const { providers } = feedWith(() => { calls++; return calls === 1 ? new Promise(resolve => { finish = resolve; }) : []; });
  const feed = component(t, ActivityFeed, providers);
  feed.ngOnInit();
  assert.equal(feed.loading(), true);
  feed.from.set('2026-09-30');
  feed.setTo('2026-09-01');
  assert.equal(feed.loading(), false);
  finish([row()]);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(feed.items(), []);
  feed.clearFilters();
  const before = calls;
  t.mock.timers.tick(5000);
  await Promise.resolve(); await Promise.resolve();
  assert.ok(calls > before, 'the feed re-reads on its own every few seconds');
  feed.ngOnDestroy();
  const after = calls;
  t.mock.timers.tick(20000);
  assert.equal(calls, after, 'and stops when it goes away');
});
test('client cancels with a POST through the shared transport, and explains a refusal (PS-14)', async () => {
  const ok = fakeFetch(json(200, { orderId: 'o 1', status: 'CANCELLED' }));
  await new OrderHistoryClient({ accessToken: token }, apiHttp(ok.fetchImpl)).cancel('o 1');
  assert.equal(ok.calls[0].url, '/api/v1/orders/o%201/cancel');
  assert.equal(ok.calls[0].init.method, 'POST');
  assert.equal(ok.calls[0].init.headers.Authorization, undefined);

  const cancelWith = response => new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(response).fetchImpl)).cancel('o-1');
  await assert.rejects(cancelWith(json(409, { error: 'ORDER_EXECUTING', message: 'Order is already executing.' })), /already executing/);
  await assert.rejects(cancelWith(json(404, { error: 'ORDER_NOT_FOUND', message: 'The order was not found.' })), /That order was not found/);
  await assert.rejects(cancelWith(new Response('oops', { status: 500 })), /Could not cancel the order/);
  await assert.rejects(cancelWith(new TypeError('network')), /Could not reach the server/);
  await assert.rejects(new OrderHistoryClient({ accessToken: null }, apiHttp(ok.fetchImpl)).cancel('o-1'), /Sign in/);
});

/** A feed whose order service also records cancels; the orders it lists can change after one. */
function cancellableFeed(t, { cancel = async () => {} } = {}) {
  let status = 'PENDING';
  const cancelled = [];
  const orders = {
    list: async () => [row({ orderId: 'waiting', status, fillPrice: null, submittedAt: '2026-10-01T18:00:00Z' }), row({ orderId: 'done' })],
    cancel: async id => { cancelled.push(id); await cancel(id); status = 'CANCELLED'; },
  };
  const feed = component(t, ActivityFeed, [
    { provide: OrderHistoryService, useValue: orders },
    { provide: CashActivityService, useValue: { list: async () => [] } },
  ]);
  return { feed, cancelled };
}

test('only waiting orders offer Cancel, and a confirmed cancel shows Cancelled after reloading (PS-14)', async t => {
  const { feed, cancelled } = cancellableFeed(t);
  feed.ngOnInit();
  await flush();
  const [waiting, done] = feed.items();
  assert.equal(feed.canCancel(waiting), true);
  assert.equal(feed.canCancel(done), false);

  feed.askCancel(waiting);
  assert.equal(feed.confirming(), 'waiting');
  await feed.confirmCancel(waiting);
  assert.deepEqual(cancelled, ['waiting']);
  assert.equal(feed.confirming(), null);
  assert.equal(feed.notice(), 'Order cancelled: 1 AAPL. Nothing was charged.');
  assert.equal(feed.items()[0].status, 'CANCELLED');
  assert.equal(feed.items()[0].detail, 'Cancelled, nothing was charged');
  assert.equal(feed.canCancel(feed.items()[0]), false);
  feed.ngOnDestroy();
});

test('a refused cancel shows the reason and reloads the real status (PS-14)', async t => {
  const { feed } = cancellableFeed(t, { cancel: async () => { throw new Error('Order is already executing.'); } });
  feed.ngOnInit();
  await flush();
  await feed.confirmCancel(feed.items()[0]);
  assert.equal(feed.notice(), 'Order is already executing.');
  assert.equal(feed.cancelling(), false);
  feed.ngOnDestroy();
});
