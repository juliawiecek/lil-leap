import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { OrderStatusClient, orderReviewSummary, rejectionReason, usd } = await import('../src/app/order-feedback.ts');
const { ToastService, Toasts, TOAST_MS } = await import('../src/app/toasts.ts');

test('the review is one line: side, size, estimate, worst fill and a closed-market note', () => {
  const review = { side: 'Buy', quantity: 10, symbol: 'AAPL', price: 227.4, thresholdDollars: 4.55, opensAt: '' };
  assert.equal(orderReviewSummary(review), 'Buy 10 AAPL · about $2,274.00 · fills at up to $2,319.50');
  assert.equal(orderReviewSummary({ ...review, opensAt: '14:30' }),
    'Buy 10 AAPL · about $2,274.00 · fills at up to $2,319.50 · market closed, fills at the open (14:30)');
  assert.equal(orderReviewSummary({ ...review, side: 'Sell' }), 'Sell 10 AAPL · about $2,274.00 · fills at no less than $2,228.50');
  assert.equal(orderReviewSummary({ ...review, side: 'Sell', thresholdDollars: 500 }), 'Sell 10 AAPL · about $2,274.00 · fills at no less than $0.00');
  assert.equal(usd(1234.5), '$1,234.50');
});

test('every rejection code reads as plain English, and unknown codes still say where to look', () => {
  assert.match(rejectionReason('INSUFFICIENT_CASH'), /not enough cash/);
  assert.match(rejectionReason('INSUFFICIENT_HOLDINGS'), /do not hold enough shares/);
  assert.match(rejectionReason('PRICE_OUT_OF_TOLERANCE'), /price moved/);
  assert.equal(rejectionReason('PRICE_MOVED'), rejectionReason('PRICE_OUT_OF_TOLERANCE'));
  assert.match(rejectionReason('LOCATION_RESTRICTED'), /location/);
  assert.match(rejectionReason('MARKET_CLOSED'), /market was closed/);
  assert.match(rejectionReason('ACCOUNT_NOT_ACTIVE'), /not open for trading/);
  assert.match(rejectionReason('SOMETHING_NEW'), /Check Orders/);
  assert.match(rejectionReason(null), /Check Orders/);
});

test('the order status client reads the reason code with the bearer token', async () => {
  const requests = [];
  const client = new OrderStatusClient({ accessToken: 'tok' }, async (url, init) => {
    requests.push([url, init.headers.Authorization]);
    return url.includes('missing')
      ? new Response('{}', { status: 404 })
      : Response.json({ orderId: 'o 1', status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH' });
  });
  assert.deepEqual(await client.status('o 1'), { status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH' });
  assert.deepEqual(requests, [['/api/v1/orders/o%201/status', 'Bearer tok']]);
  await assert.rejects(client.status('missing'), /Could not load/);
  await assert.rejects(new OrderStatusClient({ accessToken: null }).status('x'), /Sign in/);
  const noReason = new OrderStatusClient({ accessToken: 'tok' }, async () => Response.json({ status: 'FILLED' }));
  assert.deepEqual(await noReason.status('x'), { status: 'FILLED', reasonCode: null });
});

test('fill toasts dismiss sooner than rejections, and only the newest three stay', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const toasts = component(t, ToastService);
  toasts.show('filled', 'Order filled: 10 AAPL at $227.40');
  toasts.show('rejected', 'Order rejected: 5 MSFT', 'There was not enough cash in this account to pay for it.');
  assert.deepEqual(toasts.toasts().map((toast) => toast.kind), ['filled', 'rejected']);
  t.mock.timers.tick(TOAST_MS.filled);
  assert.deepEqual(toasts.toasts().map((toast) => toast.kind), ['rejected']);
  t.mock.timers.tick(TOAST_MS.rejected - TOAST_MS.filled);
  assert.deepEqual(toasts.toasts(), []);
  for (const n of [1, 2, 3, 4]) {
    toasts.show('info', `Toast ${n}`);
  }
  assert.deepEqual(toasts.toasts().map((toast) => toast.title), ['Toast 2', 'Toast 3', 'Toast 4']);
  toasts.dismiss(toasts.toasts()[0].id);
  assert.equal(toasts.toasts().length, 2);
});

test('the toast corner shares the service and offers a View action', t => {
  const service = component(t, ToastService);
  const corner = component(t, Toasts, [{ provide: ToastService, useValue: service }]);
  assert.equal(corner.service, service);
  let viewed = 0;
  corner.view.subscribe(() => viewed++);
  corner.view.emit();
  assert.equal(viewed, 1);
});
