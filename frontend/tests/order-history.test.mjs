import { apiHttp } from './http-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { OrderHistoryClient } = await import('../src/app/order-history-api.ts');
const { OrderHistory } = await import('../src/app/order-history.ts');
const { OrderHistoryService } = await import('../src/app/order-history.service.ts');

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

test('client calls the caller’s own history with only the filters supplied and the bearer token', async () => {
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

test('client surfaces the server’s error message, or a friendly fallback', async () => {
  const withMessage = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(json(400, { error: 'INVALID_FILTER', message: 'Unknown status: X' })).fetchImpl));
  await assert.rejects(withMessage.list({ status: 'X' }), /Unknown status: X/);

  const noBody = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new Response('oops', { status: 500 })).fetchImpl));
  await assert.rejects(noBody.list(), /Could not load your orders/);

  const offline = new OrderHistoryClient({ accessToken: token }, apiHttp(fakeFetch(new TypeError('network')).fetchImpl));
  await assert.rejects(offline.list(), /Could not reach the server/);
});

test('the app-wide service uses the signed-in user’s token, so it refuses while signed out', async t => {
  const { AuthService } = await import('../src/app/auth.service.ts');
  const service = component(t, OrderHistoryService, [AuthService]);
  await assert.rejects(service.list(), /Sign in/);
});

function historyWith(list) {
  const calls = [];
  const service = { list: async filters => { calls.push(filters); return list(filters); } };
  return { calls, providers: [{ provide: OrderHistoryService, useValue: service }] };
}

test('history loads the user’s orders as soon as it is shown', async t => {
  const { calls, providers } = historyWith(() => [row({ fillPrice: 225.05 })]);
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  await flush();

  assert.deepEqual(calls[0], { from: '', to: '', status: '' });
  assert.equal(history.rows().length, 1);
  assert.equal(history.loading(), false);
});

test('changing a filter reloads the list in place with that filter', async t => {
  const { calls, providers } = historyWith(filters => (filters.status === 'PENDING' ? [] : [row()]));
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  await flush();

  history.setStatus('PENDING');
  await flush();
  assert.equal(calls.at(-1).status, 'PENDING');
  assert.equal(history.rows().length, 0);

  history.setFrom('2026-09-01');
  await flush();
  assert.deepEqual(calls.at(-1), { from: '2026-09-01', to: '', status: 'PENDING' });

  history.clearFilters();
  await flush();
  assert.deepEqual(calls.at(-1), { from: '', to: '', status: '' });
  assert.equal(history.rows().length, 1);
});

test('a start date after the end date shows an error without calling the server', async t => {
  const { calls, providers } = historyWith(() => [row()]);
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  await flush();
  const before = calls.length;

  history.setTo('2026-09-01');
  await flush();
  history.setFrom('2026-09-30');
  await flush();

  assert.equal(calls.length, before + 1); // only the valid "to" change reached the server
  assert.match(history.error(), /start date/);
  assert.deepEqual(history.rows(), []);
});

test('a failed load shows the error message and no stale rows', async t => {
  let fail = false;
  const { providers } = historyWith(() => {
    if (fail) throw new Error('Could not reach the server. Check your connection and try again.');
    return [row()];
  });
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  await flush();
  fail = true;

  history.setStatus('FILLED');
  await flush();

  assert.match(history.error(), /Could not reach the server/);
  assert.deepEqual(history.rows(), []);
});

test('invalid dates cancel the loading state and ignore an earlier response', async t => {
  let finish;
  const { providers } = historyWith(() => new Promise(resolve => { finish = resolve; }));
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  assert.equal(history.loading(), true);

  history.from.set('2026-09-30');
  history.setTo('2026-09-01');
  assert.equal(history.loading(), false);
  assert.match(history.error(), /start date/);

  finish([row()]);
  await flush();
  assert.deepEqual(history.rows(), []);
  assert.equal(history.loading(), false);
});

test('status filters include the durable execution lifecycle', async t => {
  const { providers } = historyWith(() => []);
  const history = component(t, OrderHistory, providers);
  history.ngOnInit();
  await flush();
  assert.deepEqual(history.statusOptions.map(option => option.value),
    ['', 'SUBMITTED', 'ACCEPTED', 'PENDING', 'DELAYED', 'FILLED', 'REJECTED', 'CANCELLED']);
});

test('client cancels with a POST through the shared transport, and explains a refusal', async () => {
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

/** A history whose service also records cancels; the orders it lists can change after one. */
function cancellableHistory(t, { cancel = async () => {} } = {}) {
  let status = 'PENDING';
  const cancelled = [];
  const service = {
    list: async () => [row({ orderId: 'waiting', status, fillPrice: null }), row({ orderId: 'done' })],
    cancel: async (id) => { cancelled.push(id); await cancel(id); status = 'CANCELLED'; },
  };
  const history = component(t, OrderHistory, [{ provide: OrderHistoryService, useValue: service }]);
  return { history, cancelled };
}

test('only waiting orders offer Cancel, and a confirmed cancel shows Cancelled after reloading', async t => {
  const { history, cancelled } = cancellableHistory(t);
  history.ngOnInit();
  await flush();
  const [waiting, done] = history.rows();
  assert.equal(history.canCancel(waiting), true);
  assert.equal(history.canCancel(done), false);

  history.confirming.set('waiting');
  await history.confirmCancel(waiting);
  assert.deepEqual(cancelled, ['waiting']);
  assert.equal(history.confirming(), null);
  assert.match(history.notice(), /^Order cancelled: 1 AAPL\. Nothing was charged\.$/);
  assert.equal(history.rows()[0].status, 'CANCELLED');
  assert.equal(history.canCancel(history.rows()[0]), false);
});

test('a refused cancel shows the reason and reloads the real status', async t => {
  const { history } = cancellableHistory(t, { cancel: async () => { throw new Error('Order is already executing.'); } });
  history.ngOnInit();
  await flush();
  await history.confirmCancel(history.rows()[0]);
  assert.equal(history.notice(), 'Order is already executing.');
  assert.equal(history.cancelling(), false);
});
