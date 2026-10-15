import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { ORDER_TRACK_LIMIT_MS } = await import('../src/app/order-history-api.ts');

// A fixed live quote per stock, so prices are known once the dashboard's first quote refresh runs.
const PRICES = { AAPL: 176.56, MSFT: 276.57, NVDA: 278.09, AMZN: 180.34, GOOGL: 155.91 };
const NAMES = { AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation', AMZN: 'Amazon.com, Inc.', GOOGL: 'Alphabet Inc.' };
// The shared live-price feed, listing the seeded stocks at fixed prices.
const listed = () => Object.entries(PRICES).map(([symbol, price]) => ({ symbol, name: NAMES[symbol], price, instrumentId: `${symbol.toLowerCase()}-id` }));
const feedWith = () => fakeFeed(listed());

const instrument = (symbol) => ({
  instrumentId: `${symbol.toLowerCase()}-id`, symbol, instrumentName: symbol, assetClass: 'COMMON_STOCK',
  marketCode: 'NASDAQ', currency: 'USD', sector: 'TECH', enabled: true, tradable: true,
});
const historyRow = (status, extra = {}) => ({
  orderId: 'o1', symbol: 'AAPL', side: 'BUY', quantity: 2, status, submittedAt: '2026-10-07T14:30:05Z',
  fillPrice: null, filledQuantity: null, filledAt: null, ...extra,
});
const flush = () => new Promise(resolve => setImmediate(resolve));

const holding = (symbol, quantity, averageCost) => ({ symbol, instrumentName: symbol, quantity, averageCost });
const samplePortfolio = { cash: 6420.18, holdings: [holding('AAPL', 42, 154.2), holding('MSFT', 18, 248.36), holding('NVDA', 12, 228.74)] };

// A dashboard wired to fake backends: records submitted orders, returns scripted order history
// and portfolios (one per load, repeating the last). Timers are mocked so tracking never waits.
async function tradingDesk(t, { history = [[]], portfolios = [samplePortfolio], account = true, symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'] } = {}) {
  if (!t.mockTimersEnabled) { t.mock.timers.enable({ apis: ['setTimeout'] }); t.mockTimersEnabled = true; }
  const feed = feedWith();
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  let loads = 0;
  desk.portfolioClient = { load: async () => portfolios[Math.min(loads++, portfolios.length - 1)] };
  const submitted = [];
  let historyCalls = 0;
  desk.orderSubmissionClient = {
    getAccounts: async () => account
      ? [{ account_id: 'acct-1', account_status: 'ACTIVE', trading_enabled: true }] : [],
    getInstruments: async () => symbols.map(instrument),
    submit: async (request) => { submitted.push(request); return { orderId: 'o1', status: 'SUBMITTED' }; },
  };
  desk.orderHistoryClient = { list: async () => history[Math.min(historyCalls++, history.length - 1)] };
  // ngOnInit reads the signed-in user's tier to pick the default execution threshold.
  desk.auth = { traderLevel: 'NOVICE', riskProfile: null };
  await desk.ngOnInit(); await flush();
  return { desk, feed, submitted, historyCalls: () => historyCalls };
}

test('balances and holdings come from the backend, valued at average cost', async t => {
  const { desk } = await tradingDesk(t);
  assert.equal(desk.buyingPower(), 6420.18);
  assert.equal(desk.invested(), 13691.76);
  assert.equal(desk.portfolioValue(), 20111.94);
  assert.deepEqual(desk.holdings().map(h => [h.symbol, h.shares, h.value, h.logo]),
    [['AAPL', 42, 6476.4, 'apple'], ['MSFT', 18, 4470.48, 'microsoft'], ['NVDA', 12, 2744.88, 'nvidia']]);
});

test('holdings are re-priced at the latest bid every 5 seconds, so portfolio value moves', async t => {
  const aapl = { instrumentId: 'aapl-id', symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 10, averageCost: 200 };
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 500, holdings: [aapl] }] });
  const bids = [205.5, 198];
  desk.portfolioClient.latestBids = async ids => new Map(ids.map(id => [id, bids[0]]));
  await desk.refreshPortfolio();
  assert.deepEqual([desk.portfolioValue(), desk.invested()], [2555, 2055]);
  assert.deepEqual(desk.holdings().map(h => [h.value, h.total, h.totalPercent]), [[2055, 55, 2.75]]);
  bids.shift();
  t.mock.timers.tick(5000); await flush();
  assert.deepEqual([desk.portfolioValue(), desk.invested()], [2480, 1980]);
  assert.deepEqual(desk.holdings().map(h => [h.total, h.totalPercent]), [[-20, -1]]);
});

test('the trade dialog offers only tradable stocks and switching stock resets the review', async t => {
  const { desk, submitted } = await tradingDesk(t);
  assert.deepEqual(desk.tradableQuotes().map(q => q.symbol), ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL']);
  desk.openTrade('Buy'); desk.quantity.set('1'); desk.reviewTrade();
  assert.equal(desk.reviewing(), true);
  desk.chooseTradeSymbol('GOOGL');
  assert.equal(desk.tradeQuote().symbol, 'GOOGL');
  assert.equal(desk.reviewing(), false);
  desk.reviewTrade(); await desk.confirmTrade();
  assert.equal(submitted[0].instrumentId, 'googl-id');
});

test('the generic Sell button starts on a stock the user holds', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 100, holdings: [holding('NVDA', 3, 200)] }] });
  desk.openTrade('Sell');
  assert.equal(desk.tradeQuote().symbol, 'NVDA');
  desk.openTrade('Buy');
  assert.equal(desk.tradeQuote().symbol, 'AAPL');
});

test('a filled sell reloads balances so cash goes up and the shares go down', async t => {
  const afterSell = { cash: 6870.38, holdings: [holding('AAPL', 40, 154.2), holding('MSFT', 18, 248.36), holding('NVDA', 12, 228.74)] };
  const { desk } = await tradingDesk(t, {
    portfolios: [samplePortfolio, afterSell],
    history: [[historyRow('FILLED', { side: 'SELL', fillPrice: 225.1, filledQuantity: 2 })]],
  });
  desk.openTrade('Sell', 'AAPL'); desk.quantity.set('2'); await desk.confirmTrade(); await flush();
  assert.equal(desk.buyingPower(), 6870.38);
  assert.equal(desk.holdings().find(h => h.symbol === 'AAPL').shares, 40);
  assert.match(desk.tradeMessage(), /Sold 2 AAPL at \$225\.10/);
});

test('quote search matches symbols and company names regardless of case or surrounding spaces', t => {
  const feed = feedWith();
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  for (const query of [' msft ', 'MICROSOFT']) {
    desk.query.set(query);
    assert.deepEqual(desk.results().map(q => q.symbol), ['MSFT']);
  }
  desk.query.set('missing company');
  assert.deepEqual(desk.results(), []);
  desk.query.set('');
  assert.equal(desk.results().length, desk.quotes().length);
});

test('watchlist toggling removes and restores the selected quote without duplicates', t => {
  const feed = feedWith();
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  desk.openTrade('Buy', 'AAPL');
  desk.toggleWatch();
  assert.ok(!desk.watchlist().some(q => q.symbol === 'AAPL'));
  desk.toggleWatch();
  assert.equal(desk.watchlist().filter(q => q.symbol === 'AAPL').length, 1);
});

test('opening a different trade clears stale review, quantity, search, and errors', t => {
  const feed = feedWith();
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
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
  test(`novice order rejects invalid share quantity ${JSON.stringify(quantity)} without sending it`, async t => {
    const { desk, submitted } = await tradingDesk(t);
    const before = { cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() };
    desk.quantity.set(quantity);
    await desk.confirmTrade();
    assert.match(desk.tradeMessage(), /whole number/);
    assert.equal(desk.reviewing(), false);
    assert.deepEqual({ cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() }, before);
    assert.deepEqual(submitted, []);
  });
}

test('buying power and owned shares constrain novice orders', async t => {
  const { desk, submitted } = await tradingDesk(t);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('1000'); desk.reviewTrade();
  assert.match(desk.tradeMessage(), /buying power/);
  assert.equal(desk.reviewing(), false);
  desk.openTrade('Sell', 'AMZN'); desk.quantity.set('1'); await desk.confirmTrade();
  assert.match(desk.tradeMessage(), /only sell shares you hold/);
  assert.deepEqual(submitted, []);
});

test('confirming a buy sends a market order and leaves balances to the backend', async t => {
  const { desk, submitted } = await tradingDesk(t);
  const before = { cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() };
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('2'); await desk.confirmTrade();
  assert.equal(submitted.length, 1);
  const { clientReference, ...order } = submitted[0];
  // A novice's default $6 execution threshold on a $176.56 quote is a 3.4% price buffer.
  assert.deepEqual(order, { accountId: 'acct-1', instrumentId: 'aapl-id', side: 'BUY', quantity: 2, orderType: 'MARKET', bufferPercent: 3.4 });
  assert.ok(clientReference);
  assert.deepEqual({ cash: desk.buyingPower(), invested: desk.invested(), holdings: desk.holdings() }, before);
  assert.equal(desk.quantity(), '');
  assert.equal(desk.reviewing(), false);
});

test('confirming a sell sends SELL for the chosen shares', async t => {
  const { desk, submitted } = await tradingDesk(t);
  desk.openTrade('Sell', 'MSFT'); desk.quantity.set('3'); await desk.confirmTrade();
  assert.equal(submitted[0].side, 'SELL');
  assert.equal(submitted[0].instrumentId, 'msft-id');
  assert.equal(submitted[0].quantity, 3);
});

test('confirmation revalidates buying power after review', async t => {
  const { desk, submitted } = await tradingDesk(t);
  desk.quantity.set('1'); desk.reviewTrade();
  assert.equal(desk.reviewing(), true);
  desk.buyingPower.set(0); await desk.confirmTrade();
  assert.match(desk.tradeMessage(), /buying power/);
  assert.deepEqual(submitted, []);
});

test('a sent order shows its progress until it fills, then tracking stops', async t => {
  const { desk, historyCalls } = await tradingDesk(t, {
    history: [[historyRow('SUBMITTED')], [historyRow('ACCEPTED')], [historyRow('FILLED', { fillPrice: 225.1, filledQuantity: 2 })]],
  });
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('2'); await desk.confirmTrade(); await flush();
  assert.match(desk.tradeMessage(), /Order sent/);
  t.mock.timers.tick(2000); await flush();
  assert.match(desk.tradeMessage(), /Order accepted/);
  t.mock.timers.tick(2000); await flush();
  assert.equal(desk.tradeMessage(), 'Bought 2 AAPL at $225.10. You can see it under Orders.');
  assert.deepEqual(desk.toasts.toasts().map(toast => [toast.kind, toast.title]), [['filled', 'Order filled: 2 AAPL at $225.10']]);
  t.mock.timers.tick(10000); await flush();
  assert.equal(historyCalls(), 3);
});

test('a rejected order is reported in plain words, with the reason in a toast', async t => {
  const { desk } = await tradingDesk(t, { history: [[historyRow('REJECTED')]] });
  desk.orderStatusClient = { status: async () => ({ status: 'REJECTED', reasonCode: 'INSUFFICIENT_CASH' }) };
  await desk.trackOrder('o1');
  assert.equal(desk.tradeMessage(), 'Your order was not filled. There was not enough cash in this account to pay for it.');
  const [toast] = desk.toasts.toasts();
  assert.deepEqual([toast.kind, toast.title, toast.detail],
    ['rejected', 'Order rejected: 2 AAPL', 'There was not enough cash in this account to pay for it.']);
  desk.orderStatusClient = { status: async () => { throw new Error('down'); } };
  await desk.trackOrder('o1');
  assert.match(desk.tradeMessage(), /Check Orders for details/);
});

test('the ticket follows live prices, flags a stale quote, and reviews in one line with a closed-market warning', async t => {
  const { desk, feed } = await tradingDesk(t);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('10');
  feed.push([{ symbol: 'AAPL', name: 'Apple Inc.', price: 227.4, instrumentId: 'aapl-id' }]);
  assert.equal(desk.tradeQuote().price, 227.4);
  assert.equal(desk.tradePriceDelayed(), false);
  feed.status.set({ open: false, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-15T13:30:00Z', nextClose: '2026-10-15T20:00:00Z' });
  desk.marketClock.set(new Date('2026-10-15T09:00:00Z'));
  desk.executionThresholdDollars.set(4.55);
  assert.match(desk.closedWarning(), /^The market is closed\. Your order will fill when it opens at /);
  assert.match(desk.reviewSummary(), /^Buy 10 AAPL · about \$2,274\.00 · fills at up to \$2,319\.50 · market closed, fills at the open/);
  feed.push([{ symbol: 'AAPL', name: 'Apple Inc.', price: 227.4, quotedAt: new Date(Date.now() - 61000).toISOString() }]);
  assert.equal(desk.tradePriceDelayed(), true);
  desk.viewOrders();
  assert.equal(desk.activeTab(), 'History');
});

test('an order still running past the tracking limit points the user to Orders', async t => {
  const { desk } = await tradingDesk(t, { history: [[historyRow('ACCEPTED')]] });
  await desk.trackOrder('o1', Date.now() - ORDER_TRACK_LIMIT_MS);
  assert.match(desk.tradeMessage(), /still being processed/);
});

test('stocks without a backend instrument and users without an account are not sent', async t => {
  const noStock = await tradingDesk(t, { symbols: ['AAPL', 'MSFT', 'AMZN', 'GOOGL'] });
  noStock.desk.openTrade('Buy', 'NVDA'); noStock.desk.quantity.set('1'); await noStock.desk.confirmTrade();
  assert.match(noStock.desk.tradeMessage(), /NVDA is not available to trade yet/);
  assert.deepEqual(noStock.submitted, []);
  const noAccount = await tradingDesk(t, { account: false });
  noAccount.desk.openTrade('Buy', 'AAPL'); noAccount.desk.quantity.set('1'); await noAccount.desk.confirmTrade();
  assert.match(noAccount.desk.tradeMessage(), /active trading account/);
  assert.deepEqual(noAccount.submitted, []);
});

test('a failed send shows the reason and a retry reuses the same order reference', async t => {
  const { desk, submitted } = await tradingDesk(t);
  const { OrderSubmissionError } = await import('../src/app/order-submission-api.ts');
  let fail = true;
  const send = desk.orderSubmissionClient.submit;
  desk.orderSubmissionClient.submit = async (request) => {
    if (fail) { fail = false; submitted.push(request); throw new OrderSubmissionError('Insufficient cash for this order.', 422); }
    return send(request);
  };
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('1'); desk.reviewTrade();
  await desk.confirmTrade();
  assert.equal(desk.tradeMessage(), 'Insufficient cash for this order.');
  assert.equal(desk.reviewing(), true);
  await desk.confirmTrade();
  assert.equal(submitted.length, 2);
  assert.equal(submitted[0].clientReference, submitted[1].clientReference);
});

// Live portfolio chart: real candles plus the client's fills, rebuilt per period.
const minute = m => Date.UTC(2026, 9, 14, 14, m) / 1000;
const bars = (...closes) => closes.map((close, i) => ({ time: minute(i), open: close, high: close, low: close, close }));

function chartDesk(desk, { candles = new Map(), fills = [], failFills = false } = {}) {
  const requests = [];
  desk.marketData = { candlesFor: async (ids, timeframe) => { requests.push({ ids, timeframe }); return candles; } };
  desk.chartHistoryClient = { list: async () => { if (failFills) { throw new Error('down'); } return fills; } };
  return requests;
}

test('the portfolio chart values cash plus shares at each bar of the selected period', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [{ ...holding('AAPL', 10, 100), instrumentId: 'aapl-id' }] }] });
  await desk.refreshPortfolio();
  const requests = chartDesk(desk, { candles: new Map([['aapl-id', bars(100, 110)]]) });
  await desk.refreshChart();
  assert.deepEqual(requests.at(-1), { ids: ['aapl-id'], timeframe: { interval: '1m', limit: 390 } });
  assert.deepEqual(desk.chartSpec(), { kind: 'area', key: '1D', data: [{ time: minute(0), value: 2000 }, { time: minute(1), value: 2100 }] });
});

test('the portfolio chart switches between an area and a line over the same values', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [{ ...holding('AAPL', 10, 100), instrumentId: 'aapl-id' }] }] });
  await desk.refreshPortfolio();
  chartDesk(desk, { candles: new Map([['aapl-id', bars(100, 110)]]) });
  await desk.refreshChart();
  assert.equal(desk.chartType(), 'Area');
  assert.equal(desk.chartSpec().kind, 'area');
  desk.chartType.set('Line');
  assert.deepEqual(desk.chartSpec(), { kind: 'line', key: '1D', data: [{ time: minute(0), value: 2000 }, { time: minute(1), value: 2100 }] });
});

test('a client holding only cash gets a flat line on the first stock\'s time axis', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 5000, holdings: [] }] });
  await desk.refreshPortfolio();
  const requests = chartDesk(desk, { candles: new Map([['aapl-id', bars(225, 226)]]) });
  await desk.refreshChart();
  assert.deepEqual(requests.at(-1).ids, ['aapl-id']);
  assert.deepEqual(desk.portfolioSeries().map(p => p.value), [5000, 5000]);
});

test('switching period reloads with that timeframe, and a slow answer for the old period is dropped', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [] }] });
  const requests = chartDesk(desk, { candles: new Map([['aapl-id', bars(1)]]) });
  desk.selectPeriod('1W');
  await flush();
  assert.equal(desk.period(), '1W');
  assert.deepEqual(requests.at(-1).timeframe, { interval: '15m', limit: 130 });

  desk.portfolioSeries.set([]);
  desk.marketData = { candlesFor: async () => { desk.period.set('1M'); return new Map([['aapl-id', bars(1)]]); } };
  await desk.refreshChart();
  assert.deepEqual(desk.portfolioSeries(), []);
});

test('a chart load failure keeps the last line and says it will retry', async t => {
  const { desk } = await tradingDesk(t);
  chartDesk(desk, { failFills: true });
  desk.portfolioSeries.set([{ time: 1, value: 2 }]);
  await desk.refreshChart();
  assert.deepEqual(desk.portfolioSeries(), [{ time: 1, value: 2 }]);
  assert.match(desk.chartStatus(), /Could not load the chart/);
});

test('the header shows today\'s date and a greeting for the time of day', async t => {
  const { desk } = await tradingDesk(t);
  desk.now.set(new Date(2026, 9, 14, 9, 5));
  assert.equal(desk.today(), 'Wed, Oct 14, 2026');
  assert.equal(desk.greeting(), 'GOOD MORNING');
  desk.now.set(new Date(2026, 9, 14, 13, 0));
  assert.equal(desk.greeting(), 'GOOD AFTERNOON');
  desk.now.set(new Date(2026, 9, 14, 19, 30));
  assert.equal(desk.greeting(), 'GOOD EVENING');
});

test('the header counts down to the market close from the shared market status', async t => {
  const { desk, feed } = await tradingDesk(t);
  feed.status.set({ open: true, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-15T13:30:00Z', nextClose: '2026-10-14T20:00:00Z' });
  desk.marketClock.set(new Date('2026-10-14T17:46:00Z'));
  assert.equal(desk.marketOpen(), true);
  assert.equal(desk.marketText(), 'Market closes in 2h 14m');
  assert.equal(desk.closedWarning(), '');
  desk.marketClock.set(new Date('2026-10-14T19:00:00Z'));
  assert.equal(desk.marketText(), 'Market closes in 1h 0m');
});
