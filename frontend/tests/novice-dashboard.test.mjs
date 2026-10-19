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
async function tradingDesk(t, { history = [[]], portfolios = [samplePortfolio], account = true, symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'], chart = false } = {}) {
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
  desk.cashActivityClient = { list: async () => [] };
  // The chart reads order history too; tests about order tracking keep their scripted reads to themselves.
  if (!chart) { desk.loadChart = async () => {}; }
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

test('holdings are re-priced from the shared feed on every tick, so portfolio value moves (PS-10)', async t => {
  const aapl = { instrumentId: 'aapl-id', symbol: 'AAPL', instrumentName: 'Apple Inc.', quantity: 10, averageCost: 200 };
  const { desk, feed } = await tradingDesk(t, { portfolios: [{ cash: 500, holdings: [aapl] }] });
  feed.push([{ symbol: 'AAPL', instrumentId: 'aapl-id', price: 205.5, change: 2.75 }]);
  assert.deepEqual([desk.portfolioValue(), desk.invested()], [2555, 2055]);
  assert.deepEqual(desk.holdings().map(h => [h.value, h.total, h.totalPercent, h.today, h.change]), [[2055, 55, 2.75, 55, 2.75]]);
  assert.deepEqual([desk.todayReturn(), desk.todayReturnPercent()], [55, 2.75]);
  feed.push([{ symbol: 'AAPL', instrumentId: 'aapl-id', price: 198, change: -1 }]);
  assert.deepEqual([desk.portfolioValue(), desk.invested()], [2480, 1980]);
  assert.deepEqual(desk.holdings().map(h => [h.total, h.totalPercent]), [[-20, -1]]);
  assert.equal(desk.todayReturn(), -20, 'today is the day move, shown with its real sign');
});

test('an order queued for the open is watched, and its fill reloads balances without a page change (PS-10)', async t => {
  const { desk, historyCalls } = await tradingDesk(t, {
    history: [[historyRow('ACCEPTED')], [historyRow('FILLED', { fillPrice: 225, filledQuantity: 2 })]],
    portfolios: [samplePortfolio, { cash: 5970.18, holdings: samplePortfolio.holdings }],
  });
  assert.equal(desk.buyingPower(), 6420.18);
  t.mock.timers.tick(5000); await flush(); await flush();
  assert.equal(desk.buyingPower(), 5970.18);
  const calls = historyCalls();
  t.mock.timers.tick(20000); await flush();
  assert.equal(historyCalls(), calls, 'with no open orders left, polling stops');
});

test('the guided workspace has four pages, and an unreachable service shows a banner instead of a blank screen (PS-11)', async t => {
  const { desk } = await tradingDesk(t);
  assert.deepEqual(desk.navigation.map(n => n.label), ['Overview', 'Portfolio', 'Activity', 'Settings']);
  assert.equal(desk.serviceDown(), false);
  desk.portfolioClient.load = async () => { throw new Error('Could not reach the server.'); };
  await desk.refreshPortfolio();
  assert.equal(desk.serviceDown(), true);
  assert.equal(desk.portfolioValue(), 20111.94, 'the last values stay on screen');
});

test('the overview chart rebuilds the account’s value from its deposits, fills and recorded prices', async t => {
  const now = Date.now();
  const at = (hoursAgo) => new Date(now - hoursAgo * 3600000).toISOString();
  const { desk, feed } = await tradingDesk(t, { history: [[]], portfolios: [{ cash: 500, holdings: [] }], chart: true });
  desk.accountState.use([{ account_id: 'acct-1', account_status: 'ACTIVE', trading_enabled: true, created_at: at(10) }]);
  desk.cashActivityClient = { list: async (filters) => {
    assert.deepEqual(filters, { accountId: 'acct-1' });
    return [{ transactionId: 't1', accountId: 'acct-1', accountName: 'Main', type: 'DEPOSIT', amount: 1000, settlementStatus: 'SETTLED', occurredAt: at(10) }];
  } };
  desk.orderHistoryClient = { list: async () => [historyRow('FILLED', { quantity: 5, fillPrice: 100, filledQuantity: 5, filledAt: at(8) })] };
  const requests = [];
  feed.client = { closes: async (id, interval, limit) => {
    requests.push([id, interval]);
    return [{ at: now - 4 * 3600000, price: 110 }];
  } };
  desk.chartPeriod.set('1W');
  await desk.loadChart();
  assert.equal(desk.chartError(), '');
  assert.equal(desk.chartSpan().fromOpening, true, 'a ten-hour-old account: the week view starts at its first deposit');
  assert.equal(desk.chartSpan().start, Date.parse(at(10)));
  assert.deepEqual(requests, [['aapl-id', '5m']]);
  assert.deepEqual(desk.chartHistory().map((p) => p.value), [1000, 1000, 1050, 1050, 1050], 'a step at the fill');
  // Recorded prices are midpoints; live values use the bid, so the history is moved onto the bid.
  const aapl = feed.quotes().find((q) => q.symbol === 'AAPL');
  feed.quotes.set(feed.quotes().map((q) => (q.symbol === 'AAPL' ? { ...q, bid: aapl.price * 0.99 } : q)));
  await desk.loadChart();
  assert.deepEqual(desk.chartHistory().map((p) => p.value), [1000, 1000, 1044.5, 1044.5, 1044.5], '5 shares at 110 × 0.99');
  feed.quotes.set(feed.quotes().map((q) => (q.symbol === 'AAPL' ? aapl : q)));
  desk.applyPortfolio({ cash: 500, holdings: [] });
  assert.equal(desk.chartPoints().at(-1).value, 500, 'the line ends at the live value shown above it');
  desk.setChartPeriod('ALL');
  await flush();
  assert.equal(desk.chartPeriod(), 'ALL');
  desk.orderHistoryClient = { list: async () => { throw new Error('down'); } };
  await desk.loadChart();
  assert.match(desk.chartError(), /could not be loaded/);
  desk.ngOnDestroy();
});

test('every live value is added to the line, so its dips and rises stay instead of only its end moving', async t => {
  const { desk, feed } = await tradingDesk(t, { portfolios: [{ cash: 20000, holdings: [] }] });
  const loaded = Date.now() - 60000;
  desk.chartHistory.set([{ at: loaded - 3600000, value: 20000 }, { at: loaded, value: 20000 }]);
  desk.chartLive.set([]);
  desk.applyPortfolio({ cash: 19000, holdings: [] });
  desk.applyPortfolio({ cash: 19100, holdings: [] });
  assert.deepEqual(desk.chartPoints().map((p) => p.value), [20000, 20000, 19000, 19100], '20,000 → 19,000 → 19,100');
  const times = desk.chartPoints().map((p) => p.at);
  assert.ok(times.every((at, i) => !i || at > times[i - 1]), 'in time order');
  desk.chartHistory.set([{ at: loaded - 3600000, value: 20000 }, { at: Date.now() + 1000, value: 19050 }]);
  assert.deepEqual(desk.chartPoints().map((p) => p.value), [20000, 19000, 19100], 'a reload keeps the live values it covers');
  feed.push(listed());
  assert.equal(desk.chartPoints().length, 4, 'each price update adds a point, even with only cash');
  // 1D: a live value after the session's close is left off; it shows above the chart.
  const session = { open: loaded - 3600000, close: loaded + 500 };
  desk.chartHistory.set([{ at: loaded - 3600000, value: 20000 }, { at: loaded, value: 20000 }]);
  desk.chartSpan.set({ start: session.open, end: loaded, fromOpening: false, session });
  assert.ok(desk.chartPoints().every((p) => p.at <= session.close));
  // Longer periods keep one live value per price bar, as the history has.
  desk.chartSpan.set({ start: loaded - 7 * 86400000, end: loaded, fromOpening: false });
  assert.equal(desk.chartPoints().length, 3, 'the history, then only the latest of the live values in their hour');
  assert.equal(desk.chartPoints().at(-1).value, desk.portfolioValue());
  desk.ngOnDestroy();
});

test('one live value per bar: the last in each', async () => {
  const { lastPerBar } = await import('../src/app/novice-dashboard.ts');
  const points = [{ at: 0, value: 1 }, { at: 5, value: 2 }, { at: 10, value: 3 }, { at: 19, value: 4 }, { at: 20, value: 5 }];
  assert.deepEqual(lastPerBar(points, 10).map((p) => p.value), [2, 4, 5]);
  assert.deepEqual(lastPerBar([], 10), []);
});

test('1D names the session’s day when it is not today', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [] }] });
  const now = new Date();
  desk.chartHistory.set([{ at: now - 2000, value: 1000 }, { at: now - 1000, value: 1000 }]);
  desk.chartSpan.set({ start: now - 2000, end: now - 1000, fromOpening: false, session: { open: now - 2000, close: now } });
  assert.equal(desk.headerChange().label, 'Today');
  const lastWeek = now.getTime() - 7 * 86400000;
  desk.chartSpan.set({ start: lastWeek, end: lastWeek + 1000, fromOpening: false, session: { open: lastWeek, close: lastWeek + 1000 } });
  assert.equal(desk.headerChange().label, new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(lastWeek));
  desk.ngOnDestroy();
});

test('the big number and its change line follow the period, the scrubbed point and its sign', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [] }] });
  assert.equal(desk.headerChange().label, 'Today', 'before the chart loads: today’s move');
  desk.chartSpan.set({ start: 0, end: 10, fromOpening: false });
  desk.chartHistory.set([{ at: 0, value: 1100 }, { at: 5, value: 1200 }, { at: 10, value: 1000 }]);
  assert.equal(desk.headerValue(), 1000);
  assert.deepEqual(desk.headerChange(), { amount: -100, percent: -100 / 11, label: 'Today' });
  assert.equal(desk.headerChangeText(), '−$100.00 (−9.09%)');
  desk.chartScrub.set({ at: 5, value: 1200 });
  assert.equal(desk.headerValue(), 1200, 'the value under the cursor');
  assert.equal(desk.headerChange().amount, 100);
  assert.equal(desk.headerChangeText(), '+$100.00 (+9.09%)');
  assert.notEqual(desk.headerChange().label, 'Today', 'the scrubbed time instead');
  desk.setChartPeriod('ALL');
  assert.equal(desk.chartScrub(), null, 'a new period drops the scrub');
  desk.chartSpan.set({ start: 0, end: 10, fromOpening: true });
  assert.equal(desk.headerChange().label, 'Since opening');
  desk.chartHistory.set([{ at: 0, value: 1000 }, { at: 10, value: 1000 }]);
  assert.equal(desk.headerChangeText(), '$0.00 (0.00%)');
  desk.ngOnDestroy();
});

test('the chart is marked delayed when a held stock’s price is stale or the service is unreachable', async t => {
  const { desk, feed } = await tradingDesk(t);
  assert.equal(desk.chartDelayed(), false);
  const old = new Date(Date.now() - 120000).toISOString();
  feed.push(listed().map((q) => (q.symbol === 'AAPL' ? { ...q, quotedAt: old } : q)));
  assert.equal(desk.chartDelayed(), true, 'AAPL is held and its quote is two minutes old');
  feed.push(listed().map((q) => (q.symbol === 'GOOGL' ? { ...q, quotedAt: old } : q)));
  assert.equal(desk.chartDelayed(), false, 'a stale stock that is not held does not matter');
  desk.serviceDown.set(true);
  assert.equal(desk.chartDelayed(), true);
});

test('the allocation ring is the real share in stocks', async t => {
  const { desk } = await tradingDesk(t);
  assert.equal(desk.stocksShare().toFixed(2), ((13691.76 / 20111.94) * 100).toFixed(2));
  desk.applyPortfolio({ cash: 100, holdings: [] });
  assert.equal(desk.stocksShare(), 0);
  desk.applyPortfolio({ cash: 0, holdings: [] });
  assert.equal(desk.stocksShare(), 0, 'an empty account draws no arc');
});

test('the chart starts when money first arrived, else when the account opened', async () => {
  const { fundedAt } = await import('../src/app/novice-dashboard.ts');
  assert.equal(fundedAt('2026-10-16T19:00:00Z', [{ at: 5, amount: 1 }, { at: 3, amount: 1 }]), 3);
  assert.equal(fundedAt('2026-10-16T19:00:00Z', []), Date.parse('2026-10-16T19:00:00Z'));
  assert.equal(fundedAt(undefined, []), null);
  assert.equal(fundedAt('not a date', []), null);
});

test('greeting, diversification and loading states come from the real data (PS-06)', async t => {
  const fresh = component(t, NoviceDashboard, [feedProvider(feedWith())]);
  assert.equal(fresh.portfolioLoaded(), false);
  assert.equal(fresh.diversification().title, 'No investments yet');
  for (const [hour, greeting] of [[9, 'Good morning'], [14, 'Good afternoon'], [20, 'Good evening']]) {
    fresh.marketClock.set(new Date(2026, 9, 16, hour));
    assert.equal(fresh.greeting(), greeting);
  }
  const { desk } = await tradingDesk(t);
  assert.equal(desk.portfolioLoaded(), true);
  assert.equal(desk.diversification().title, 'Spread across companies');
  desk.applyPortfolio({ cash: 0, holdings: [holding('AAPL', 1, 100)] });
  assert.equal(desk.diversification().title, 'All in one company');
  assert.equal(desk.markets, undefined, 'no made-up index numbers');
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
  // With nothing saved, price protection is the 2% default.
  assert.deepEqual(order, { accountId: 'acct-1', instrumentId: 'aapl-id', side: 'BUY', quantity: 2, orderType: 'MARKET', bufferPercent: 2 });
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
  // The first read is the dashboard's own start-up check, before anything is sent.
  const { desk, historyCalls } = await tradingDesk(t, {
    history: [[], [historyRow('SUBMITTED')], [historyRow('ACCEPTED')], [historyRow('FILLED', { fillPrice: 225.1, filledQuantity: 2 })]],
  });
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('2'); await desk.confirmTrade(); await flush();
  assert.match(desk.tradeMessage(), /Order sent/);
  t.mock.timers.tick(2000); await flush();
  assert.match(desk.tradeMessage(), /Order accepted/);
  t.mock.timers.tick(2000); await flush();
  assert.equal(desk.tradeMessage(), 'Bought 2 AAPL at $225.10. You can see it under Activity.');
  assert.deepEqual(desk.toasts.toasts().map(toast => [toast.kind, toast.title]), [['filled', 'Order filled: 2 AAPL at $225.10']]);
  t.mock.timers.tick(10000); await flush(); await flush();
  const settled = historyCalls();
  t.mock.timers.tick(30000); await flush();
  assert.equal(historyCalls(), settled, 'nothing is re-read once every order has finished');
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
  assert.match(desk.tradeMessage(), /Check Activity for details/);
});

test('the ticket follows live prices, flags a stale quote, and reviews in one line with a closed-market warning', async t => {
  const { desk, feed } = await tradingDesk(t);
  desk.openTrade('Buy', 'AAPL'); desk.quantity.set('10');
  feed.push([{ symbol: 'AAPL', name: 'Apple Inc.', price: 227.4, instrumentId: 'aapl-id' }]);
  assert.equal(desk.tradeQuote().price, 227.4);
  assert.equal(desk.tradePriceDelayed(), false);
  feed.status.set({ open: false, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-15T13:30:00Z', nextClose: '2026-10-15T20:00:00Z' });
  desk.marketClock.set(new Date('2026-10-15T09:00:00Z'));
  desk.orderTolerance.set(2);
  assert.match(desk.closedWarning(), /^The market is closed\. Your order will fill when it opens at /);
  assert.match(desk.reviewSummary(), /^Buy 10 AAPL · about \$2,274\.00 · fills at up to \$2,319\.48 · market closed, fills at the open/);
  assert.equal(desk.protectionNote(), 'Fills at up to $231.95 (2% above $227.40)');
  feed.push([{ symbol: 'AAPL', name: 'Apple Inc.', price: 227.4, quotedAt: new Date(Date.now() - 61000).toISOString() }]);
  assert.equal(desk.tradePriceDelayed(), true);
  desk.viewOrders();
  assert.equal(desk.activeTab(), 'Activity');
});

test('an order still running past the tracking limit points the user to Activity', async t => {
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
