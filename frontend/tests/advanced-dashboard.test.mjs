import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');

test('screeners separate gainers and decliners and restore all quotes', t => {
  const desk = component(t, AdvancedDashboard);
  desk.filter.set('Gainers');
  assert.ok(desk.screened().length > 0);
  assert.ok(desk.screened().every(q => q.change > 0));
  desk.filter.set('Decliners');
  assert.deepEqual(desk.screened().map(q => q.symbol), ['TSLA', 'META']);
  desk.filter.set('All stocks');
  assert.equal(desk.screened().length, desk.quotes.length);
});

test('choosing a symbol updates ticket prices and clears stale search and errors', t => {
  const desk = component(t, AdvancedDashboard);
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
    const desk = component(t, AdvancedDashboard);
    const orders = desk.orders(); const cash = desk.buyingPower();
    desk[field].set(value); desk.confirmOrder();
    assert.match(desk.message(), message);
    assert.deepEqual(desk.orders(), orders); assert.equal(desk.buyingPower(), cash);
  });
}

test('sell quantities and optional bracket prices are validated', t => {
  const desk = component(t, AdvancedDashboard);
  desk.side.set('Sell'); desk.quantity.set('251');
  assert.match(desk.validate(), /only sell shares/);
  desk.quantity.set('1'); desk.takeProfit.set(true); desk.profitPrice.set('176.50');
  assert.match(desk.validate(), /Take profit/);
  desk.profitPrice.set('185'); desk.stopLoss.set(true); desk.stopPrice.set('176.50');
  assert.match(desk.validate(), /Stop loss/);
  desk.stopPrice.set('0'); assert.match(desk.validate(), /Stop loss/);
  desk.stopPrice.set('170'); assert.equal(desk.validate(), '');
});

test('market buy fills at the quote and charges fees to cash and portfolio', t => {
  const desk = component(t, AdvancedDashboard);
  desk.orderType.set('Market'); desk.quantity.set('2'); desk.confirmOrder();
  assert.equal(desk.buyingPower(), 47876.97);
  assert.equal(desk.portfolio(), 284650.14);
  assert.equal(desk.positions().find(p => p.symbol === 'AAPL').quantity, 252);
  assert.equal(desk.orders()[0].status, 'Filled');
  assert.equal(desk.orders()[0].price, 176.56);
});

test('nonmarketable limit stays open, can be canceled, and does not change holdings or cash', t => {
  const desk = component(t, AdvancedDashboard);
  const cash = desk.buyingPower(); const positions = desk.positions();
  desk.quantity.set('2'); desk.limitPrice.set('170'); desk.confirmOrder();
  const order = desk.orders()[0];
  assert.equal(order.status, 'Open'); assert.equal(order.price, 170);
  assert.equal(desk.buyingPower(), cash); assert.deepEqual(desk.positions(), positions);
  desk.orderStatus.set('Open'); assert.deepEqual(desk.filteredOrders(), [order]);
  assert.ok(!desk.executions().includes(order));
  desk.cancelOrder(order.id);
  assert.equal(desk.orders()[0].status, 'Canceled');
  assert.deepEqual(desk.filteredOrders(), []);
  desk.cancelOrder(4);
  assert.equal(desk.orders().find(o => o.id === 4).status, 'Filled');
});

test('marketable sell limit fills at the better quote and removes a fully sold position', t => {
  const desk = component(t, AdvancedDashboard);
  desk.side.set('Sell'); desk.quantity.set('250'); desk.limitPrice.set('170'); desk.confirmOrder();
  assert.equal(desk.orders()[0].status, 'Filled');
  assert.equal(desk.orders()[0].price, 176.56);
  assert.ok(!desk.positions().some(p => p.symbol === 'AAPL'));
  assert.equal(desk.buyingPower(), 92365.71);
});

test('price alerts reject invalid prices and retain the selected symbol', t => {
  const desk = component(t, AdvancedDashboard);
  for (const value of ['0', '-1', 'NaN', 'Infinity']) {
    desk.alertPrice.set(value); desk.createAlert();
    assert.match(desk.message(), /positive alert price/);
    assert.deepEqual(desk.alerts(), []);
  }
  desk.choose(desk.quote('TSLA')); desk.alertPrice.set('150'); desk.createAlert();
  assert.deepEqual(desk.alerts(), [{ symbol: 'TSLA', price: 150 }]);
});
