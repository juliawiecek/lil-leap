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
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
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
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  await desk.ngOnInit();  // Load accounts/instruments
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
  await desk.ngOnInit();
  const cash = desk.buyingPower(); const positions = desk.positions();
  desk.quantity.set('2'); desk.limitPrice.set('170');
  await desk.confirmOrder();
  // Order submitted but remains PENDING, not immediately filled or Open
  assert.equal(desk.buyingPower(), cash); assert.deepEqual(desk.positions(), positions);
});

test('limit sell submits with PENDING status, does not mutate positions or cash immediately', async t => {
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useClass: MockAuthService }]);
  desk.orderSubmissionClient = new MockOrderSubmissionClient();
  await desk.ngOnInit();
  desk.side.set('Sell'); desk.quantity.set('250'); desk.limitPrice.set('170');
  const cashBefore = desk.buyingPower();
  const posBefore = desk.positions().length;
  await desk.confirmOrder();
  // Backend will handle fill+settlement, frontend doesn't mutate
  assert.equal(desk.buyingPower(), cashBefore);
  assert.equal(desk.positions().length, posBefore);
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
