import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { OrderSubmissionClient } = await import('../src/app/order-submission-api.ts');

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
const samplePortfolio = { cash: 48230.12, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 250, averageCost: 142.2 }] };
// Timers are mocked so order tracking never waits in real time.
function tradingDesk(t) {
  if (!t.mockTimersEnabled) { t.mock.timers.enable({ apis: ['setTimeout'] }); t.mockTimersEnabled = true; }
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  desk.orderHistoryClient = { list: async () => [] };
  desk.portfolioClient = { load: async () => samplePortfolio };
  desk.applyPortfolio(samplePortfolio);
  return desk;
}

test('screeners separate gainers and decliners and restore all quotes', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.filter.set('Gainers');
  assert.ok(desk.screened().length > 0);
  assert.ok(desk.screened().every(q => q.change > 0));
  desk.filter.set('Decliners');
  assert.deepEqual(desk.screened().map(q => q.symbol), ['TSLA', 'META']);
  desk.filter.set('All stocks');
  assert.equal(desk.screened().length, desk.quotes.length);
});

test('choosing a symbol updates ticket prices and clears stale search and errors', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.query.set('tsla'); desk.message.set('old error'); desk.page.set('Watchlist');
  desk.choose(desk.quote('TSLA'));
  assert.equal(desk.selected().symbol, 'TSLA');
  assert.equal(desk.limitPrice(), '142.20');
  assert.equal(desk.profitPrice(), '149.31');
  assert.equal(desk.stopPrice(), '135.09');
  assert.equal(desk.alertPrice(), '145.04');
  assert.equal(desk.query(), ''); assert.equal(desk.message(), '');
  assert.equal(desk.page(), 'Overview');
});

for (const [field, value, message] of [
  ['quantity', '1.5', /whole number/], ['quantity', '-1', /whole number/],
  ['limitPrice', '0', /valid order price/], ['limitPrice', 'Infinity', /valid order price/],
  ['limitPrice', 'oops', /valid order price/], ['quantity', '100000', /buying power/],
]) {
  test(`advanced ticket rejects ${field}=${value} without placing an order`, t => {
    const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
    const orders = desk.orders(); const cash = desk.buyingPower();
    desk[field].set(value); desk.confirmOrder();
    assert.match(desk.message(), message);
    assert.deepEqual(desk.orders(), orders); assert.equal(desk.buyingPower(), cash);
  });
}

test('sell quantities and optional bracket prices are validated', t => {
  const desk = tradingDesk(t);
  desk.side.set('Sell'); desk.quantity.set('251');
  assert.match(desk.validate(), /only sell/);
  desk.quantity.set('1'); desk.takeProfit.set(true); desk.profitPrice.set('176.50');
  assert.match(desk.validate(), /Take profit/);
  desk.profitPrice.set('185'); desk.stopLoss.set(true); desk.stopPrice.set('176.50');
  assert.match(desk.validate(), /Stop loss/);
  desk.stopPrice.set('0'); assert.match(desk.validate(), /Stop loss/);
  desk.stopPrice.set('170'); assert.equal(desk.validate(), '');
});

test('market buy submits order with PENDING status to backend, does not mutate local cash or positions', async t => {
  const desk = tradingDesk(t);
  await desk.loadTradingData(); // Load accounts/instruments
  desk.orderType.set('Market'); desk.quantity.set('2');
  const cashBefore = desk.buyingPower();
  const positionsBefore = JSON.stringify(desk.positions());
  await desk.confirmOrder();
  // After submission with real backend: order is PENDING, not FILLED
  // Cash and positions should NOT change (backend handles that)
  assert.equal(desk.buyingPower(), cashBefore);
  assert.deepEqual(JSON.stringify(desk.positions()), positionsBefore);
});

test('nonmarketable limit submits with PENDING status and does not change holdings or cash', async t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  await desk.loadTradingData();
  const cash = desk.buyingPower(); const positions = desk.positions();
  desk.quantity.set('2'); desk.limitPrice.set('170');
  await desk.confirmOrder();
  // Order submitted but remains PENDING, not immediately filled or Open
  assert.equal(desk.buyingPower(), cash); assert.deepEqual(desk.positions(), positions);
});

test('limit sell submits with PENDING status, does not mutate positions or cash immediately', async t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  await desk.loadTradingData();
  desk.side.set('Sell'); desk.quantity.set('250'); desk.limitPrice.set('170');
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

test('orders and executions tabs show the backend order history, not sample data', async t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  assert.deepEqual(desk.orders(), []);
  desk.orderHistoryClient = new ScriptedOrderHistory([historyRow('FILLED', 225.1), { ...historyRow('ACCEPTED'), orderId: 'o2' }]);
  assert.equal(await desk.refreshOrders(), true);
  assert.deepEqual(desk.orders().map(o => [o.id, o.side, o.status, o.price]), [['o1', 'Buy', 'Filled', 225.1], ['o2', 'Buy', 'Accepted', null]]);
  assert.deepEqual(desk.executions().map(o => o.id), ['o1']);
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

test('positions are re-priced at the latest bid every 5 seconds and returns follow the market', async t => {
  const desk = tradingDesk(t);
  const portfolio = { cash: 1000, holdings: [{ instrumentId: 'aapl-uuid', symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 10, averageCost: 200 }] };
  const bids = [210, 190];
  desk.portfolioClient = { load: async () => portfolio, latestBids: async ids => new Map(ids.map(id => [id, bids[0]])) };
  await desk.refreshPortfolio();
  assert.deepEqual([desk.portfolio(), desk.totalReturn(), desk.totalReturnPercent()], [3100, 100, 5]);
  assert.deepEqual(desk.positions().map(p => [p.price, p.value, p.total]), [[210, 2100, 100]]);
  bids.shift();
  t.mock.timers.tick(5000); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual([desk.portfolio(), desk.totalReturn(), desk.totalReturnPercent()], [2900, -100, -5]);
});

test('cash, positions and portfolio value come from the backend and reload after a fill', async t => {
  const fresh = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
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
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
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
  client.getInstruments = async () => all.filter(i => i.symbol !== 'TSLA');
  let submitted = 0;
  client.submit = async () => { submitted++; throw new Error('should not submit'); };
  desk.orderSubmissionClient = client;
  desk.orderHistoryClient = new ScriptedOrderHistory([]);
  await desk.loadTradingData();
  desk.choose(desk.quote('TSLA')); desk.orderType.set('Market'); desk.quantity.set('1');
  await desk.confirmOrder();
  assert.equal(submitted, 0);
  assert.match(desk.message(), /TSLA is not available to trade yet/);
});

test('price alerts reject invalid prices and retain the selected symbol', t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  for (const value of ['0', '-1', 'NaN', 'Infinity']) {
    desk.alertPrice.set(value); desk.createAlert();
    assert.match(desk.message(), /positive alert price/);
    assert.deepEqual(desk.alerts(), []);
  }
  desk.choose(desk.quote('TSLA')); desk.alertPrice.set('150'); desk.createAlert();
  assert.deepEqual(desk.alerts(), [{ symbol: 'TSLA', price: 150 }]);
});
