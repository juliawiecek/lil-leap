import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { SwitchScanService } = await import('../src/app/switch-scan.ts');
import { fakeFeed, feedProvider } from './feed-helper.mjs';

const NAMES = { AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation', AMZN: 'Amazon.com, Inc.', GOOGL: 'Alphabet Inc.' };
// The shared live-price feed, listing the seeded stocks at fixed prices and day changes.
const LISTED = [['AAPL', 176.56, 1.85], ['NVDA', 893.12, 2.36], ['MSFT', 424.31, 0.72], ['AMZN', 180.34, 1.21], ['GOOGL', 155.91, 0.62]];
const feedWith = () => fakeFeed(LISTED.map(([symbol, price, change]) => ({ symbol, name: NAMES[symbol], price, change })));
const { OrderSubmissionClient, OrderSubmissionError } = await import('../src/app/order-submission-api.ts');

test('sector and heat-map alternatives update from the exact displayed quote subset and sector averages', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useValue: { accessToken: null } }, feedProvider(fakeFeed([]))]);
  desk.quotes.set(Array.from({ length: 10 }, (_, i) => ({ symbol: `STOCK${i}`, name: `Stock ${i}`, sector: i < 2 ? 'Technology' : 'Other', price: 100, change: i === 0 ? 4 : -2 })));
  assert.match(desk.sectorDescription(), /Technology: up 1 percent/);
  assert.deepEqual(desk.sectorTable().rows.find(row => row[0] === 'Technology'), ['Technology', '+1%']);
  assert.equal(desk.heatTable().rows.length, 9);
  assert.doesNotMatch(desk.heatDescription(), /STOCK9/);
  desk.quotes.update(rows => rows.map(q => ({ ...q, change: 3 })));
  assert.match(desk.sectorDescription(), /Technology: up 3 percent/);
  assert.deepEqual(desk.heatTable().rows[0], ['STOCK0', '+3%']);
});

// Mock AuthService that provides an accessToken
class MockAuthService {
  get accessToken() {
    return 'test-token';
  }
}

// Mock OrderSubmissionClient for testing
class MockOrderSubmissionClient extends OrderSubmissionClient {
  constructor() {
    super({ accessToken: 'test-token' });
  }
  async getAccounts() {
    return [
      { account_id: 'a1', account_number: '001', account_name: 'Trading', account_status: 'ACTIVE', trader_level: 'ADVANCED', trading_enabled: true },
    ];
  }
  async getInstruments() {
    return [
      { instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple Inc.', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'nvda-uuid', symbol: 'NVDA', instrumentName: 'NVIDIA', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'msft-uuid', symbol: 'MSFT', instrumentName: 'Microsoft', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'amd-uuid', symbol: 'AMD', instrumentName: 'AMD', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'tsla-uuid', symbol: 'TSLA', instrumentName: 'Tesla', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'meta-uuid', symbol: 'META', instrumentName: 'Meta', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'amzn-uuid', symbol: 'AMZN', instrumentName: 'Amazon', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'googl-uuid', symbol: 'GOOGL', instrumentName: 'Google', assetClass: 'EQUITY', marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true },
    ];
  }
  async submit(request) {
    return {
      orderId: 'order-' + Date.now(),
      clientReference: request.clientReference,
      status: 'PENDING',
      side: request.side,
      quantity: request.quantity,
      symbol: 'AAPL',
      accountId: request.accountId,
      instrumentId: request.instrumentId,
      orderType: 'MARKET',
      submittedAt: new Date().toISOString(),
    };
  }
}

// The portfolio the sell and submit tests trade against: $48,230.12 cash and 250 AAPL.
const samplePortfolio = { cash: 48230.12, holdings: [{ instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 250, averageCost: 142.2 }] };
// Timers are mocked so order tracking never waits in real time.
function tradingDesk(t) {
  if (!t.mockTimersEnabled) { t.mock.timers.enable({ apis: ['setTimeout'] }); t.mockTimersEnabled = true; }
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  desk.orderHistoryClient = { list: async () => [] };
  desk.portfolioClient = { load: async () => samplePortfolio };
  desk.applyPortfolio(samplePortfolio);
  return desk;
}

test('reviewing an order on the ticket reads it back, cutting in (PS-23)', t => {
  const said = [];
  const scan = { announce: (text, interrupt) => said.push([text, interrupt]), settings: () => ({ enabled: false }) };
  const desk = component(t, AdvancedDashboard, [
    { provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith()),
    { provide: SwitchScanService, useValue: scan },
  ]);
  desk.applyPortfolio(samplePortfolio);
  desk.choose(desk.quote('MSFT'));
  desk.quantity.set('2');
  desk.reviewOrder();
  assert.deepEqual(said, [["You're about to buy 2 shares of Microsoft for $849. Press Confirm buy to place the order.", true]]);
  desk.quantity.set('0');
  desk.reviewOrder();
  assert.equal(said.length, 1, 'an invalid order is not read back');
});

test('screeners separate gainers and decliners and restore all quotes', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  desk.filter.set('Gainers');
  assert.ok(desk.screened().length > 0);
  assert.ok(desk.screened().every(q => q.change > 0));
  // Every seeded quote starts as a gainer, so make one fall to exercise the Decliners screen.
  desk.quote('NVDA').change = -2.36;
  desk.filter.set('Decliners');
  assert.deepEqual(desk.screened().map(q => q.symbol), ['NVDA']);
  desk.filter.set('All stocks');
  assert.equal(desk.screened().length, desk.quotes().length);
});

test('choosing a symbol moves the ticket to it and clears stale search and errors', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  desk.query.set('nvda'); desk.message.set('old error'); desk.page.set('Watchlist');
  desk.choose(desk.quote('NVDA'));
  assert.equal(desk.selected().symbol, 'NVDA');
  desk.quantity.set('2');
  assert.equal(desk.total(), 1786.24, 'the estimate is the live price times the shares, with no invented fee');
  assert.equal(desk.query(), ''); assert.equal(desk.message(), '');
  assert.equal(desk.page(), 'Overview');
});

test('the ticket starts at one share and offers market orders only (PS-06)', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  assert.equal(desk.quantity(), '1');
  for (const removed of ['orderType', 'limitPrice', 'tif', 'takeProfit', 'stopLoss', 'fees', 'alerts', 'markets', 'news']) {
    assert.equal(desk[removed], undefined, `${removed} has no backend and is gone`);
  }
});

for (const [value, message] of [['1.5', /whole number/], ['-1', /whole number/], ['100000', /buying power/]]) {
  test(`advanced ticket rejects quantity=${value} without placing an order`, t => {
    const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
    const orders = desk.orders(); const cash = desk.buyingPower();
    desk.quantity.set(value); desk.confirmOrder();
    assert.match(desk.message(), message);
    assert.deepEqual(desk.orders(), orders); assert.equal(desk.buyingPower(), cash);
  });
}

test('a stock with no live price yet cannot be ordered', t => {
  const desk = tradingDesk(t);
  desk.selected.set({ ...desk.selected(), price: 0 });
  assert.match(desk.validate(), /no live price/);
});

test('selling more shares than held is refused', t => {
  const desk = tradingDesk(t);
  desk.side.set('Sell'); desk.quantity.set('251');
  assert.match(desk.validate(), /only sell/);
  desk.quantity.set('250');
  assert.equal(desk.validate(), '');
});

test('market buy submits order with PENDING status to backend, does not mutate local cash or positions', async t => {
  const desk = tradingDesk(t);
  await desk.loadTradingData(); // Load accounts/instruments
  desk.quantity.set('2');
  const cashBefore = desk.buyingPower();
  const positionsBefore = JSON.stringify(desk.positions());
  await desk.confirmOrder();
  // After submission with real backend: order is PENDING, not FILLED
  // Cash and positions should NOT change (backend handles that)
  assert.equal(desk.buyingPower(), cashBefore);
  assert.deepEqual(JSON.stringify(desk.positions()), positionsBefore);
});

test('market sell submits with PENDING status, does not mutate positions or cash immediately', async t => {
  const desk = tradingDesk(t);
  await desk.loadTradingData();
  desk.side.set('Sell'); desk.quantity.set('250');
  const cashBefore = desk.buyingPower();
  const posBefore = desk.positions().length;
  await desk.confirmOrder();
  // Backend will handle fill+settlement, frontend doesn't mutate
  assert.equal(desk.buyingPower(), cashBefore);
  assert.equal(desk.positions().length, posBefore);
});

// Order history that returns one scripted response per call, repeating the last one.
class ScriptedOrderHistory {
  constructor(...responses) { this.responses = responses; this.calls = 0; }
  async list() { return this.responses[Math.min(this.calls++, this.responses.length - 1)]; }
}
const historyRow = (status, fillPrice = null) => ({
  orderId: 'o1', symbol: 'AAPL', side: 'BUY', quantity: 2, status,
  submittedAt: '2026-10-06T14:30:05Z', fillPrice, filledQuantity: fillPrice === null ? null : 2, filledAt: null,
});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('orders come from the backend order history, not sample data', async t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  assert.deepEqual(desk.orders(), []);
  desk.orderHistoryClient = new ScriptedOrderHistory([historyRow('FILLED', 225.1), { ...historyRow('ACCEPTED'), orderId: 'o2' }]);
  assert.equal(await desk.refreshOrders(), true);
  assert.deepEqual(desk.orders().map(o => [o.id, o.side, o.status, o.price]), [['o1', 'Buy', 'Filled', 225.1], ['o2', 'Buy', 'Accepted', null]]);
});

test('the advanced workspace has five pages, with orders and history merged into Activity (PS-11)', t => {
  const desk = tradingDesk(t);
  assert.deepEqual(desk.nav.map(n => n.name), ['Overview', 'Portfolio', 'Activity', 'Markets', 'Settings']);
  assert.deepEqual(desk.bottomTabs, ['Positions', 'Balances', 'Performance']);
});

test('balances that cannot be read raise the service-unavailable banner until a retry succeeds (PS-11)', async t => {
  const desk = tradingDesk(t);
  desk.portfolioClient = { load: async () => { throw new Error('Could not reach the server. Check your connection and try again.'); } };
  await desk.refreshPortfolio();
  assert.equal(desk.serviceDown(), true);
  desk.portfolioClient = { load: async () => samplePortfolio };
  await desk.refreshPortfolio();
  assert.equal(desk.serviceDown(), false);
});

test('a submitted order is re-read until it fills, then tracking stops', async t => {
  const desk = tradingDesk(t);
  const history = new ScriptedOrderHistory([historyRow('SUBMITTED')], [historyRow('ACCEPTED')], [historyRow('FILLED', 225.1)]);
  desk.orderHistoryClient = history;
  const seen = [];
  await desk.trackOrder('o1'); seen.push(desk.orders()[0].status);
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(2000); await flush(); seen.push(desk.orders()[0].status); }
  assert.deepEqual(seen, ['Submitted', 'Accepted', 'Filled', 'Filled']);
  assert.equal(history.calls, 3);
  assert.match(desk.message(), /Order o1 filled/);
});

test('positions are re-priced from the shared feed on every tick, with no request of their own (PS-10)', async t => {
  const desk = tradingDesk(t);
  const portfolio = { cash: 1000, holdings: [{ instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 10, averageCost: 200 }] };
  desk.portfolioClient = { load: async () => portfolio };
  await desk.refreshPortfolio();
  desk.feed.push([{ symbol: 'AAPL', price: 210, change: 5 }]);
  assert.deepEqual([desk.portfolio(), desk.totalReturn(), desk.totalReturnPercent()], [3100, 100, 5]);
  assert.deepEqual(desk.positions().map(p => [p.price, p.value, p.total, p.day]), [[210, 2100, 100, 100]]);
  assert.deepEqual([desk.dayGain(), desk.dayGainPercent()], [100, 5], 'today is its own figure, not the total return');
  desk.feed.push([{ symbol: 'AAPL', price: 190, change: -5 }]);
  assert.deepEqual([desk.portfolio(), desk.totalReturn(), desk.totalReturnPercent()], [2900, -100, -5]);
});

test('a fill seen by the order poll reloads balances, so the overview follows every fill (PS-10)', async t => {
  const desk = tradingDesk(t);
  let loads = 0;
  desk.portfolioClient = { load: async () => { loads++; return samplePortfolio; } };
  desk.orderHistoryClient = new ScriptedOrderHistory([historyRow('ACCEPTED')], [historyRow('FILLED', 225)]);
  await desk.ngOnInit();
  await flush(); await flush();
  const afterStart = loads;
  t.mock.timers.tick(5000); await flush(); await flush();
  assert.equal(loads, afterStart + 1, 'the queued order filled, so cash and positions were re-read');
  t.mock.timers.tick(5000); await flush(); await flush();
  assert.equal(loads, afterStart + 1, 'an order already seen filled does not reload again');
  desk.ngOnDestroy();
});

test('the summary shows real cash and invested shares, sectors come from listed stocks, and the chart uses recorded prices (PS-06)', t => {
  const desk = tradingDesk(t);
  desk.feed.push(LISTED.map(([symbol, price, change]) => ({ symbol, name: NAMES[symbol], price, change, sector: symbol === 'AMZN' ? 'Consumer' : 'Technology' })));
  assert.equal(desk.portfolioLoaded(), true);
  assert.deepEqual(desk.exposure(), { total: 92370.12, equities: 44140, cash: 48230.12, equitiesPercent: 47.8, cashPercent: 52.2 });
  assert.equal(desk.exposureLabel(), '$92.4K', 'short enough to fit inside the ring');
  assert.deepEqual(desk.sectors().map(s => [s.name, s.change]), [['Technology', 1.39], ['Consumer', 1.21]]);
  assert.equal(desk.sectors()[0].width, 100);
  const now = Date.now();
  desk.currentTime.set(new Date(now));
  desk.priceHistory.set([{ at: now - 60000, price: 170 }, { at: now - 30000, price: 175 }]);
  assert.match(desk.priceLine(), /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/, 'only the two recorded observations; no invented price before the first');
  assert.equal(desk.historyStart(), now - 60000);
  desk.priceHistory.set([]);
  assert.equal(desk.priceLine(), '', 'no invented candles while prices are still being collected');
});

test('cash, positions and portfolio value come from the backend and reload after a fill', async t => {
  const fresh = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  assert.equal(fresh.buyingPower(), 0); assert.deepEqual(fresh.positions(), []);
  const desk = tradingDesk(t);
  const before = { cash: 1000, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 2, averageCost: 200 }] };
  const after = { cash: 1450, holdings: [] };
  const loads = [before, after];
  desk.portfolioClient = { load: async () => loads.shift() ?? after };
  await desk.refreshPortfolio();
  assert.equal(desk.buyingPower(), 1000);
  assert.equal(desk.portfolio(), 1400);
  assert.deepEqual(desk.positions().map(p => [p.symbol, p.quantity, p.value, p.weight]), [['AAPL', 2, 400, 28.6]]);
  desk.orderHistoryClient = new ScriptedOrderHistory([{ ...historyRow('FILLED', 225), side: 'SELL' }]);
  await desk.trackOrder('o1');
  assert.equal(desk.buyingPower(), 1450);
  assert.equal(desk.portfolio(), 1450);
  assert.deepEqual(desk.positions(), []);
});

test('tracking stops when the order history cannot be loaded', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }, feedProvider(feedWith())]);
  let calls = 0;
  desk.orderHistoryClient = { list: async () => { calls++; throw new Error('Could not load your orders. Please try again.'); } };
  await desk.trackOrder('o1');
  t.mock.timers.tick(10000); await flush();
  assert.equal(calls, 1);
  assert.match(desk.message(), /Could not load your orders/);
});

test('a listed stock with no backend instrument is not submitted', async t => {
  const desk = tradingDesk(t);
  const client = new MockOrderSubmissionClient();
  const all = await client.getInstruments();
  client.getInstruments = async () => all.filter(i => i.symbol !== 'NVDA');
  let submitted = 0;
  client.submit = async () => { submitted++; throw new Error('should not submit'); };
  desk.orderSubmissionClient = client;
  desk.orderHistoryClient = new ScriptedOrderHistory([]);
  await desk.loadTradingData();
  desk.choose(desk.quote('NVDA')); desk.quantity.set('1');
  await desk.confirmOrder();
  assert.equal(submitted, 0);
  assert.match(desk.message(), /NVDA is not available to trade yet/);
});

test('portfolio and order load failures retain values and show safe fallback messages', async t => {
  const desk = tradingDesk(t);
  const positions = desk.positions();
  desk.portfolioClient = { load: async () => { throw 'unavailable'; } };
  await desk.refreshPortfolio();
  assert.equal(desk.message(), 'Could not load your balances.');
  assert.deepEqual(desk.positions(), positions);
  desk.portfolioClient.load = async () => { throw new Error('Balances unavailable'); };
  await desk.refreshPortfolio();
  assert.equal(desk.message(), 'Balances unavailable');
  desk.orderHistoryClient = { list: async () => { throw null; } };
  assert.equal(await desk.refreshOrders(), false);
  assert.equal(desk.message(), 'Could not load your orders.');
});

test('destroying dashboard cancels order polling and releases the price feed', async t => {
  const desk = tradingDesk(t);
  let orders = 0;
  desk.orderHistoryClient = { list: async () => { orders++; return []; } };
  await desk.refreshPortfolio();
  await desk.trackOrder('pending');
  desk.ngOnDestroy();
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(orders, 1);
  assert.equal(desk.feed.stops, 1);
});

test('zero-value positions have zero portfolio weights', t => {
  const desk = tradingDesk(t);
  desk.applyPortfolio({ cash: 0, holdings: [{ symbol: 'AAPL', quantity: 0, averageCost: 0 }] });
  assert.equal(desk.portfolio(), 0);
  assert.equal(desk.positions()[0].weight, 0);
});

test('submission guards loading and duplicate requests and reports backend errors', async t => {
  const desk = tradingDesk(t);
  desk.loadingAccounts.set(true);
  await desk.confirmOrder();
  assert.match(desk.message(), /Loading accounts/);
  await desk.loadTradingData();
  let calls = 0;
  desk.orderSubmissionClient.submit = async () => { calls++; throw new Error('internal details'); };
  desk.submitting.set(true);
  await desk.confirmOrder();
  assert.equal(calls, 0);
  desk.submitting.set(false);
  await desk.confirmOrder();
  assert.equal(desk.message(), 'Submission failed. Please try again.');
  assert.equal(desk.submitting(), false);
  desk.orderSubmissionClient.submit = async () => { throw new OrderSubmissionError('Trading unavailable', 503); };
  await desk.confirmOrder();
  assert.equal(desk.message(), 'Trading unavailable');
});

test('sell submission uses backend instrument and stops tracking rejected orders', async t => {
  const desk = tradingDesk(t);
  await desk.loadTradingData();
  desk.side.set('Sell'); desk.quantity.set('2');
  let request;
  desk.orderSubmissionClient.submit = async value => {
    request = value; return { orderId: 'o1', status: 'SUBMITTED' };
  };
  desk.orderHistoryClient = new ScriptedOrderHistory([historyRow('REJECTED')]);
  desk.orderStatusClient = { status: async () => ({ status: 'REJECTED', reasonCode: 'PRICE_OUT_OF_TOLERANCE' }) };
  await desk.confirmOrder(); await flush();
  assert.equal(request.side, 'SELL');
  assert.equal(request.instrumentId, 'aapl-uuid');
  assert.equal(desk.message(), 'Order o1 rejected.');
  const [toast] = desk.toasts.toasts();
  assert.equal(toast.kind, 'rejected');
  assert.match(toast.detail, /price moved past your price protection/);
});

test('a filled order pops a toast, and the review line and market badge come from live data', async t => {
  const desk = tradingDesk(t);
  desk.orderHistoryClient = new ScriptedOrderHistory([historyRow('FILLED', 227.4)]);
  await desk.trackOrder('o1');
  assert.equal(desk.toasts.toasts()[0].title, 'Order filled: 2 AAPL at $227.40');
  desk.orderStatusClient = { status: async () => { throw new Error('down'); } };
  desk.orderHistoryClient = new ScriptedOrderHistory([{ ...historyRow('REJECTED'), orderId: 'o2' }]);
  await desk.trackOrder('o2');
  assert.match(desk.toasts.toasts().at(-1).detail, /Check Activity/);
  desk.quantity.set('2'); desk.orderTolerance.set(1.7);
  assert.equal(desk.reviewSummary(), 'Buy 2 AAPL · about $353.12 · fills at up to $359.12');
  desk.feed.status.set({ open: true, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-15T13:30:00Z', nextClose: '2026-10-14T20:00:00Z' });
  assert.match(desk.marketBadge(), /^Open · Closes /);
  assert.equal(desk.marketOpen(), true);
  assert.equal(desk.closedWarning(), '');
  assert.deepEqual(desk.topMovers().map(q => q.symbol), ['NVDA', 'AAPL', 'AMZN', 'MSFT', 'GOOGL']);
  assert.equal(desk.priceDelayed(), false);
  desk.viewOrders();
  assert.equal(desk.page(), 'Activity');
});

test('tracking stops when its deadline has elapsed', async t => {
  const desk = tradingDesk(t);
  const history = new ScriptedOrderHistory([]);
  desk.orderHistoryClient = history;
  await desk.trackOrder('o1', 0);
  t.mock.timers.tick(10000); await flush();
  assert.equal(history.calls, 1);
});

test('search and chart periods update the displayed data', t => {
  const desk = tradingDesk(t);
  desk.query.set('  apple  ');
  assert.deepEqual(desk.results().map(q => q.symbol), ['AAPL']);
  desk.period.set('1M');
  assert.equal(desk.chartTimes().length, 7);
  assert.equal(desk.quote('unknown'), desk.quotes()[0]);
  desk.navigate('Portfolio');
  assert.equal(desk.bottomTab(), 'Positions');
});

test('the spoken briefing reads the summary panel, live moves and orders (PS-18)', async t => {
  const desk = component(t, AdvancedDashboard, [feedProvider(feedWith())]);
  desk.applyPortfolio({ cash: 1000, holdings: [{ instrumentId: 'nvda-uuid', symbol: 'NVDA', instrumentName: 'NVIDIA', quantity: 2, averageCost: 800 }] });
  const rows = [{ orderId: 'o1', symbol: 'NVDA', side: 'BUY', quantity: 2, status: 'FILLED', submittedAt: new Date().toISOString(), fillPrice: 800, filledQuantity: 2, filledAt: new Date().toISOString() }];
  desk.orderHistoryClient = { list: async () => rows };
  const snapshot = await desk.briefingSource();
  assert.equal(snapshot.total, desk.portfolio());
  assert.equal(snapshot.gainPercent, desk.totalReturnPercent());
  assert.equal(snapshot.buyingPower, 1000);
  assert.deepEqual(snapshot.holdings, [{ symbol: 'NVDA', name: 'NVIDIA Corporation', dayChangePercent: 2.36 }]);
  assert.deepEqual(snapshot.orders, rows);
  desk.privateBalance.set(true);
  desk.orderHistoryClient = { list: async () => { throw new Error('down'); } };
  const hidden = await desk.briefingSource();
  assert.equal(hidden.balanceHidden, true);
  assert.deepEqual(hidden.orders, []);
});

test('review creates a fresh order reference and backdrop closes only the dialog', t => {
  const desk = tradingDesk(t);
  let opened = 0, closed = 0;
  const dialog = { showModal: () => opened++, close: () => closed++ };
  t.mock.method(desk, 'dialog', () => ({ nativeElement: dialog }));
  desk.submittedOrderId.set('old-order');
  const reference = desk.clientReference();
  desk.reviewOrder();
  assert.equal(opened, 1);
  assert.notEqual(desk.clientReference(), reference);
  assert.equal(desk.submittedOrderId(), null);
  desk.backdrop({ target: {} });
  assert.equal(closed, 0);
  desk.backdrop({ target: dialog });
  assert.equal(closed, 1);
  const reviewedReference = desk.clientReference();
  desk.openModal('alert');
  assert.equal(desk.clientReference(), reviewedReference);
});

test('missing active account or stale instrument mapping prevents submission', async t => {
  const desk = tradingDesk(t);
  desk.orderSubmissionClient.getAccounts = async () => [{ account_id: 'a1', account_status: 'CLOSED', trading_enabled: false }];
  await desk.loadTradingData();
  let calls = 0;
  desk.orderSubmissionClient.submit = async () => { calls++; };
  await desk.confirmOrder();
  assert.equal(desk.message(), 'No active account selected.');
  assert.equal(desk.submitting(), false);
  desk.accountState.use([{ account_id: 'a1', account_status: 'ACTIVE', trading_enabled: true }]);
  desk.selected.set({ ...desk.selected(), instrumentId: 'stale-id' });
  await desk.confirmOrder();
  assert.match(desk.message(), /not available to trade/);
  assert.equal(desk.submitting(), false);
  assert.equal(calls, 0);
});
