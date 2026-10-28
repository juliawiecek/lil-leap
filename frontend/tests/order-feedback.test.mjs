import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { apiHttp } from './http-helper.mjs';
import { throwError } from 'rxjs';
const { OrderStatusClient, orderReviewSummary, rejectionMessage, rejectionReason, usd } = await import('../src/app/order-feedback.ts');
const { ToastService, Toasts, TOAST_MS } = await import('../src/app/toasts.ts');

test('the review is one line: side, size, estimate, worst fill and a closed-market note', () => {
  const review = { side: 'Buy', quantity: 10, symbol: 'AAPL', price: 227.4, tolerancePercent: 2, opensAt: '' };
  assert.equal(orderReviewSummary(review), 'Buy 10 AAPL · about $2,274.00 · fills at up to $2,319.48');
  assert.equal(orderReviewSummary({ ...review, opensAt: '14:30' }),
    'Buy 10 AAPL · about $2,274.00 · fills at up to $2,319.48 · market closed, fills at the open (14:30)');
  assert.equal(orderReviewSummary({ ...review, side: 'Sell' }), 'Sell 10 AAPL · about $2,274.00 · fills at no less than $2,228.52');
  assert.equal(orderReviewSummary({ ...review, side: 'Sell', tolerancePercent: 100 }), 'Sell 10 AAPL · about $2,274.00 · fills at no less than $0.00');
  assert.equal(usd(1234.5), '$1,234.50');
});

test('every rejection code reads as plain English, and unknown codes still say where to look', () => {
  assert.match(rejectionReason('INSUFFICIENT_CASH'), /not enough cash/);
  assert.match(rejectionReason('INSUFFICIENT_HOLDINGS'), /do not hold enough shares/);
  assert.match(rejectionReason('PRICE_OUT_OF_TOLERANCE'), /price moved/);
  assert.match(rejectionReason('PRICE_MOVED'), /price protection.*Nothing was charged/);
  // Price protection's own explanation, with how far the price moved, wins over the generic sentence.
  const moved = 'The price rose 3.1% before your order filled, more than your 2% limit. Nothing was charged.';
  assert.equal(rejectionMessage({ reasonCode: 'PRICE_MOVED', reasonText: moved }), moved);
  assert.equal(rejectionMessage({ reasonCode: 'INSUFFICIENT_CASH', reasonText: '  ' }), rejectionReason('INSUFFICIENT_CASH'));
  assert.match(rejectionReason('LOCATION_RESTRICTED'), /location/);
  assert.match(rejectionReason('MARKET_CLOSED'), /market was closed/);
  assert.match(rejectionReason('ACCOUNT_NOT_ACTIVE'), /not open for trading/);
  assert.match(rejectionReason('SOMETHING_NEW'), /Check Activity/);
  assert.match(rejectionReason(null), /Check Activity/);
});

test('the order status client reads the reason code through the shared transport', async () => {
  const requests = [];
  const client = new OrderStatusClient({ accessToken: 'tok' }, apiHttp(async (url, init) => {
    requests.push([url, init.headers.Authorization]);
    return url.includes('missing')
      ? new Response('{}', { status: 404 })
      : Response.json({ orderId: 'o 1', status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH' });
  }));
  assert.deepEqual(await client.status('o 1'), { status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH', reasonText: null });
  assert.deepEqual(requests, [['/api/v1/orders/o%201/status', undefined]]);
  await assert.rejects(client.status('missing'), /Could not load/);
  await assert.rejects(new OrderStatusClient({ accessToken: null }).status('x'), /Sign in/);
  const noReason = new OrderStatusClient({ accessToken: 'tok' }, apiHttp(async () => Response.json({ status: 'FILLED' })));
  assert.deepEqual(await noReason.status('x'), { status: 'FILLED', reasonCode: null, reasonText: null });
});

test('unexpected transport failures propagate from the order status client', async () => {
  const failure = new TypeError('offline');
  const client = new OrderStatusClient({ accessToken: 'tok' }, { get: () => throwError(() => failure) });
  await assert.rejects(client.status('x'), (error) => error === failure);
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

test('sell styling survives while hover and focus hold a toast until both leave', t => {
 t.mock.timers.enable({ apis: ['setTimeout'] }); const service = new ToastService(); t.after(() => service.ngOnDestroy());
 const id = service.show('filled', 'Sold 1 AAPL', '', 'sell'); t.mock.timers.tick(5000);
 assert.equal(service.toasts()[0].side, 'sell');
 service.hold(id, 'hover'); service.hold(id, 'focus'); t.mock.timers.tick(20000);
 service.release(id, 'hover'); t.mock.timers.tick(20000); assert.equal(service.toasts().length, 1);
 service.release(id, 'focus'); t.mock.timers.tick(TOAST_MS.filled - 1); assert.equal(service.toasts().length, 1);
 t.mock.timers.tick(1); assert.equal(service.toasts().length, 0);
});
test('modal dialogs hold toasts and closing starts a fresh full duration', async t => {
 const { browser } = await import('./dom-helper.mjs'); t.mock.timers.enable({ apis: ['setTimeout'] });
 const dialog = browser.document.createElement('dialog'); browser.document.body.append(dialog); dialog.open = true;
 const service = new ToastService(); t.after(() => { service.ngOnDestroy(); dialog.remove(); });
 service.show('filled', 'Filled'); t.mock.timers.tick(60000); assert.equal(service.toasts().length, 1);
 dialog.open = false; service.modalChanged(); t.mock.timers.tick(TOAST_MS.filled - 1); assert.equal(service.toasts().length, 1);
 t.mock.timers.tick(1); assert.equal(service.toasts().length, 0);
});
test('toast actions have 24px targets and stay reachable in a modal', async t => {
 const { render, browser } = await import('./dom-helper.mjs');
 const fixture = await render(t, Toasts); const instance = fixture.componentInstance; const host = fixture.nativeElement;
 const dialog = browser.document.createElement('dialog'); browser.document.body.append(dialog); dialog.open = true;
 await new Promise(resolve => setImmediate(resolve));
 instance.service.show('info', 'Saved'); fixture.detectChanges();
 assert.equal(host.parentNode, dialog);
 assert.match(Toasts[Object.getOwnPropertyNames(Toasts).find(key => key.endsWith('cmp'))].styles.join(' '), /min-width: 24px; min-height: 24px/);
 dialog.open = false; await new Promise(resolve => setImmediate(resolve)); assert.notEqual(host.parentNode, dialog); dialog.remove();
});

test('limit reviews name the exact per-share limit and its estimated total', () => {
 const text = orderReviewSummary({ side:'Buy', quantity:2, symbol:'AAPL', price:200, tolerancePercent:2, opensAt:'', limitPrice:170.25 });
 assert.match(text, /limit \$170\.25 per share/); assert.match(text, /estimated \$340\.50/); assert.doesNotMatch(text, /fills at up to/);
 const closed = orderReviewSummary({ side:'Buy', quantity:2, symbol:'AAPL', price:200, tolerancePercent:2, opensAt:'9:30 AM', limitPrice:170.25 });
 assert.doesNotMatch(closed, /fills at the open/); assert.match(closed, /execution is not guaranteed/);
});

test('focus leaving a toast releases its hold, unless focus moved within the toast', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const service = component(t, ToastService);
  const corner = component(t, Toasts, [{ provide: ToastService, useValue: service }]);
  const id = service.show('filled', 'Filled');
  service.hold(id, 'focus');
  t.mock.timers.tick(TOAST_MS.filled * 2);
  assert.equal(service.toasts().length, 1, 'held while focused');
  const toast = { contains: (node) => node === 'inside' };
  corner.leaveFocus({ currentTarget: toast, relatedTarget: 'inside' }, id);
  t.mock.timers.tick(TOAST_MS.filled * 2);
  assert.equal(service.toasts().length, 1, 'focus moving to the toast action keeps the hold');
  corner.leaveFocus({ currentTarget: toast, relatedTarget: null }, id);
  t.mock.timers.tick(TOAST_MS.filled);
  assert.equal(service.toasts().length, 0, 'leaving the toast lets it time out');
  // Without a rendered host there is nothing to move between dialogs.
  assert.doesNotThrow(() => corner.ngAfterViewInit());
  assert.doesNotThrow(() => corner.ngOnDestroy());
});

test('without MutationObserver the service still shows toasts and times them out', async t => {
  const { browser } = await import('./dom-helper.mjs');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const window = browser.document.defaultView, Observer = window.MutationObserver;
  window.MutationObserver = undefined;
  t.after(() => { window.MutationObserver = Observer; });
  const service = new ToastService(); t.after(() => service.ngOnDestroy());
  service.show('info', 'Saved');
  assert.equal(service.toasts().length, 1);
  t.mock.timers.tick(TOAST_MS.info);
  assert.equal(service.toasts().length, 0);
});
