import assert from 'node:assert/strict';
import { test } from 'node:test';
import { of } from 'rxjs';
import { render, input, button } from './dom-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { OrderSubmissionClient } = await import('../src/app/order-submission-api.ts');
const REVIEW_DIALOG = 'dialog[aria-labelledby="pro-dialog-title"]';

async function ticket(t, { cash = 1000, side = 'Buy' } = {}) {
  // Isolate the ticket's rendered flow from background loading and execution polling.
  t.mock.method(AdvancedDashboard.prototype, 'ngOnInit', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const feed = fakeFeed([
    { symbol: 'AAPL', name: 'Apple Inc.', price: 100 },
    { symbol: 'NVDA', name: 'NVIDIA', price: 200 },
  ]);
  const fixture = await render(t, AdvancedDashboard, {}, [feedProvider(feed)]);
  const desk = fixture.componentInstance;
  desk.accountState.use([{
    account_id: 'acct-1', account_name: 'Trading', account_number: '001',
    account_status: 'ACTIVE', trading_enabled: true, trader_level: 'ADVANCED',
  }]);
  desk.instruments.set(feed.quotes().map(q => ({ instrumentId: q.instrumentId, symbol: q.symbol })));
  desk.applyPortfolio({ cash, holdings: [{ symbol: 'NVDA', quantity: 5, averageCost: 150 }] });
  desk.side.set(side);
  t.mock.method(desk, 'trackOrder', async () => {});
  const requests = [];
  desk.orderSubmissionClient = new OrderSubmissionClient({ accessToken: 'test-token' }, {
    post: (url, body) => {
      requests.push({ url, body });
      return of({ orderId: 'order-1', status: 'PENDING' });
    },
  });
  fixture.detectChanges();
  return { fixture, desk, feed, requests };
}

function details(fixture) {
  return Object.fromEntries([...fixture.nativeElement.querySelectorAll('.review-details > div')]
    .map(row => [row.querySelector('span').textContent.trim(), row.querySelector('strong').textContent.trim()]));
}

for (const side of ['Buy', 'Sell']) {
  test(`NEXT-251: rendered ${side} review matches the market request body`, async t => {
    const { fixture, desk, requests } = await ticket(t, { side });
    const root = fixture.nativeElement;
    input(fixture, '#pro-symbol', 'NVDA', 'change');
    input(fixture, '#pro-quantity', '2');
    const ticketText = root.querySelector('app-advanced-ticket').textContent;
    assert.match(ticketText, /Executes at the next available market price/);
    assert.match(ticketText, /Final price may differ/);
    assert.match(ticketText, /Take profit OffStop loss Off/);
    assert.equal(root.querySelector('#pro-limit'), null);
    assert.equal(root.querySelector('#pro-profit'), null);
    assert.equal(root.querySelector('#pro-stop'), null);
    assert.deepEqual([...root.querySelectorAll('app-advanced-ticket select')].map(el => el.id), ['pro-symbol']);
    assert.deepEqual([...root.querySelectorAll('app-advanced-ticket input')].map(el => el.id), ['pro-quantity', 'pro-risk-budget', 'pro-preset-name']);
    assert.equal(desk.total(), 400);
    assert.match(root.querySelector('.cost-summary').textContent, /Estimated total\s*\$400\.00/);
    button(fixture, 'Change for this order');
    input(fixture, '.tolerance-field input', '1.5', 'change');
    root.querySelector('app-advanced-ticket form').dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    assert.equal(root.querySelector(REVIEW_DIALOG).open, true);
    assert.deepEqual(details(fixture), {
      Account: 'Trading · 001', Symbol: 'NVDA · NVIDIA', 'Side / Type': `${side} / Market`,
      Quantity: '2', 'Price protection': '1.5%', 'Live price': '$200.00', 'Estimated Total': '$400.00',
    });
    assert.doesNotMatch(root.querySelector(REVIEW_DIALOG).textContent, /Limit|Time in Force|Take Profit|Stop Loss|Fees/i);
    const reference = desk.clientReference();
    assert.ok(reference);
    button(fixture, `Confirm ${side}`);
    assert.deepEqual(requests, [{ url: '/api/v1/orders', body: {
      accountId: 'acct-1', instrumentId: 'nvda-uuid', side: side.toUpperCase(), quantity: 2,
      orderType: 'MARKET', clientReference: reference, bufferPercent: 1.5,
    } }]);
    await fixture.whenStable();
  });
}

test('NEXT-251: exact market cost is affordable; a cent less is rejected at review and confirmation', async t => {
  const { fixture, desk, requests } = await ticket(t, { cash: 200 });
  input(fixture, '#pro-quantity', '2');
  assert.equal(desk.total(), 200);
  assert.equal(desk.validate(), '', 'neither a fee nor the protection buffer is added to market cost');
  desk.reviewOrder(); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector(REVIEW_DIALOG).open, true);
  desk.applyPortfolio({ cash: 199.99, holdings: [] });
  await desk.confirmOrder(); fixture.detectChanges();
  assert.match(desk.message(), /buying power/);
  assert.equal(fixture.nativeElement.querySelector(REVIEW_DIALOG).open, false);
  desk.reviewOrder(); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector(REVIEW_DIALOG).open, false);
  assert.deepEqual(requests, []);
  desk.applyPortfolio({ cash: 200, holdings: [] });
  desk.reviewOrder();
  await desk.confirmOrder();
  assert.equal(requests.length, 1, 'all available cash can pay the fee-free market cost');
});

test('NEXT-251: ticket and open review follow market cost and confirm revalidates a price increase', async t => {
  const { fixture, desk, feed, requests } = await ticket(t, { cash: 200 });
  input(fixture, '#pro-quantity', '2');
  desk.reviewOrder(); fixture.detectChanges();
  assert.equal(details(fixture)['Estimated Total'], '$200.00');
  feed.push([{ symbol: 'AAPL', name: 'Apple Inc.', price: 101 }]);
  fixture.detectChanges();
  assert.equal(desk.total(), 202);
  assert.match(fixture.nativeElement.querySelector('.cost-summary').textContent, /Estimated total\s*\$202\.00/);
  assert.equal(details(fixture)['Live price'], '$101.00');
  assert.equal(details(fixture)['Estimated Total'], '$202.00');
  await desk.confirmOrder();
  assert.match(desk.message(), /buying power/);
  assert.deepEqual(requests, []);
});
