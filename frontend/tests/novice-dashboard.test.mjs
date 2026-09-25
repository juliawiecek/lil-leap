import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');

test('quote search matches symbols and company names regardless of case or surrounding spaces', t => {
  const desk = component(t, NoviceDashboard);
  for (const query of [' msft ', 'MICROSOFT']) {
    desk.query.set(query);
    assert.deepEqual(desk.results().map(q => q.symbol), ['MSFT']);
  }
  desk.query.set('missing company');
  assert.deepEqual(desk.results(), []);
  desk.query.set('');
  assert.equal(desk.results().length, desk.quotes.length);
});

test('watchlist toggling removes and restores the selected quote without duplicates', t => {
  const desk = component(t, NoviceDashboard);
  desk.openTrade('Buy', 'AAPL');
  desk.toggleWatch();
  assert.ok(!desk.watchlist().some(q => q.symbol === 'AAPL'));
  desk.toggleWatch();
  assert.equal(desk.watchlist().filter(q => q.symbol === 'AAPL').length, 1);
});

test('opening a different trade clears stale review, quantity, search, and errors', t => {
  const desk = component(t, NoviceDashboard);
  desk.quantity.set('2'); desk.reviewing.set(true);
  desk.tradeMessage.set('old error'); desk.query.set('apple');
  desk.openTrade('Sell', 'MSFT');
  assert.equal(desk.tradeQuote().symbol, 'MSFT');
  assert.equal(desk.side(), 'Sell');
  assert.equal(desk.quantity(), '');
  assert.equal(desk.query(), '');
  assert.equal(desk.reviewing(), false);
  assert.equal(desk.tradeMessage(), '');
});

for (const quantity of ['', '0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']) {
  test(`novice order rejects invalid share quantity ${JSON.stringify(quantity)} without changing balances`, t => {
    const desk = component(t, NoviceDashboard);
    const before = { cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() };
    desk.quantity.set(quantity);
    desk.confirmTrade();
    assert.match(desk.tradeMessage(), /whole number/);
    assert.equal(desk.reviewing(), false);
    assert.deepEqual({ cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() }, before);
    assert.deepEqual(desk.orderHistory(), []);
  });
}

test('buying power and owned shares constrain novice orders', t => {
  const desk = component(t, NoviceDashboard);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('1000'); desk.reviewTrade();
  assert.match(desk.tradeMessage(), /buying power/);
  assert.equal(desk.reviewing(), false);
  desk.openTrade('Sell', 'TSLA'); desk.quantity.set('1'); desk.confirmTrade();
  assert.match(desk.tradeMessage(), /only sell shares you hold/);
  assert.equal(desk.orderHistory().length, 0);
});

test('buying a new holding debits cash, credits invested value, and records the fill', t => {
  const desk = component(t, NoviceDashboard);
  desk.openTrade('Buy', 'TSLA'); desk.quantity.set('2'); desk.confirmTrade();
  assert.equal(desk.buyingPower(), 6135.78);
  assert.equal(desk.invested(), 18544.64);
  const holding = desk.holdings().find(h => h.symbol === 'TSLA');
  assert.equal(holding.shares, 2);
  assert.equal(holding.average, 142.2);
  assert.equal(holding.value, 284.4);
  assert.equal(desk.orderHistory()[0].symbol, 'TSLA');
  assert.equal(desk.orderHistory()[0].shares, 2);
  assert.equal(desk.quantity(), '');
  assert.equal(desk.reviewing(), false);
});

test('adding to a holding updates weighted cost and selling all shares removes it', t => {
  const desk = component(t, NoviceDashboard);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('2'); desk.confirmTrade();
  const holding = desk.holdings().find(h => h.symbol === 'AAPL');
  assert.equal(holding.shares, 44);
  assert.equal(holding.average, (42 * 154.2 + 353.12) / 44);
  desk.openTrade('Sell', 'AAPL'); desk.quantity.set('44'); desk.confirmTrade();
  assert.ok(!desk.holdings().some(h => h.symbol === 'AAPL'));
  assert.equal(desk.buyingPower(), 13835.7);
  assert.equal(desk.orderHistory()[0].side, 'Sell');
});

test('confirmation revalidates buying power after review', t => {
  const desk = component(t, NoviceDashboard);
  desk.quantity.set('1'); desk.reviewTrade();
  assert.equal(desk.reviewing(), true);
  desk.buyingPower.set(0); desk.confirmTrade();
  assert.match(desk.tradeMessage(), /buying power/);
  assert.equal(desk.orderHistory().length, 0);
});
