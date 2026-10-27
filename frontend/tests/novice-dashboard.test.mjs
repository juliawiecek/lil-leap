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
async function tradingDesk(t, { history = [[]], portfolios = [samplePortfolio], account = true, symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL'], chart = false, providers = [] } = {}) {
  if (!t.mockTimersEnabled) { t.mock.timers.enable({ apis: ['setTimeout'] }); t.mockTimersEnabled = true; }
  const feed = feedWith();
  const desk = component(t, NoviceDashboard, [feedProvider(feed), ...providers]);
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

test('the guided workspace exposes its trading pages and settings, and service failures show a banner', async t => {
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
  const { desk, feed } = await tradingDesk(t, { history: [[]], portfolios: [{ cash: 500, holdings: [{ ...holding('AAPL', 5, 100), instrumentId: 'aapl-id' }] }], chart: true });
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
  assert.deepEqual(desk.chartHistory().map((p) => p.value), [1050, 1050], 'history begins once a recorded price makes valuation possible');
  // Changing today?s bid cannot change past observations.
  const aapl = feed.quotes().find((q) => q.symbol === 'AAPL');
  feed.quotes.set(feed.quotes().map((q) => (q.symbol === 'AAPL' ? { ...q, bid: aapl.price * 0.99 } : q)));
  await desk.loadChart();
  assert.deepEqual(desk.chartHistory().map((p) => p.value), [1050, 1050], 'today spread cannot rewrite historical bids');
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
  // Market closure gates executions, not the continuously running demo quote feed.
  const session = { open: loaded - 3600000, close: loaded + 500 };
  desk.chartHistory.set([{ at: loaded - 3600000, value: 20000 }, { at: loaded, value: 20000 }]);
  desk.chartSpan.set({ start: session.open, end: loaded, fromOpening: false, session });
  assert.equal(desk.chartPoints().at(-1).at, desk.chartLive().at(-1).at);
  assert.ok(desk.chartPoints().at(-1).at > session.close);
  assert.deepEqual(desk.chartPoints().slice(0, 2), desk.chartHistory(), 'closing history keeps its original values and times');
  desk.chartLive.set([]);
  assert.deepEqual(desk.chartPoints(), desk.chartHistory(), 'without a new observation, live balances cannot rewrite the closing price');
  desk.chartLive.set(times.slice(-2).map((at, i) => ({ at, value: [19000, 19100][i] })));
  // Longer periods keep one live value per price bar, as the history has.
  desk.chartPeriod.set('1W');
  desk.chartSpan.set({ start: loaded - 7 * 86400000, end: loaded, fromOpening: false });
  assert.equal(desk.chartPoints().length, 3, 'the history, then only the latest of the live values in their hour');
  assert.equal(desk.chartPoints().at(-1).value, desk.portfolioValue());
  desk.ngOnDestroy();
});

test('reloading the day after close includes recorded after-hours quotes', async t => {
  const now = Date.parse('2026-10-20T21:30:00Z');
  t.mock.method(Date, 'now', () => now);
  const { desk, feed } = await tradingDesk(t, { portfolios: [{ cash: 900, holdings: [{ ...holding('AAPL', 1, 100), instrumentId: 'aapl-id' }] }], chart: true });
  desk.cashActivityClient = { list: async () => [{ occurredAt: '2026-10-19T13:00:00Z', amount: 1000 }] };
  desk.orderHistoryClient = { list: async () => [historyRow('FILLED', {
    quantity: 1, filledQuantity: 1, fillPrice: 100, filledAt: '2026-10-20T14:00:00Z',
  })] };
  feed.client = { closes: async () => [
    { at: Date.parse('2026-10-20T19:30:00Z'), price: 110 },
    { at: Date.parse('2026-10-20T21:29:00Z'), price: 115 },
  ] };
  await desk.loadChart();
  assert.equal(desk.chartSpan().start, Date.parse('2026-10-20T05:00:00Z'));
  assert.equal(desk.chartSpan().session, undefined);
  assert.equal(desk.chartSpan().end, now);
  assert.ok(desk.chartHistory().some(p => p.at === Date.parse('2026-10-20T21:29:00Z') && p.value === 1015));
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
  // Friday in UTC is still Thursday on the app's Central clock. Keep the fixture
  // independent of the machine's time zone and the hour this suite runs.
  const now = new Date('2026-10-23T02:00:00Z');
  desk.marketClock.set(now);
  desk.chartHistory.set([{ at: now - 2000, value: 1000 }, { at: now - 1000, value: 1000 }]);
  desk.chartSpan.set({ start: now - 2000, end: now - 1000, fromOpening: false, session: { open: now - 2000, close: now } });
  assert.equal(desk.headerChange().label, 'Today');
  const lastWeek = now.getTime() - 7 * 86400000;
  desk.chartSpan.set({ start: lastWeek, end: lastWeek + 1000, fromOpening: false, session: { open: lastWeek, close: lastWeek + 1000 } });
  assert.equal(desk.headerChange().label, 'Thursday');
  desk.ngOnDestroy();
});

test('the big number and its change line follow the period, the scrubbed point and its sign', async t => {
  const { desk } = await tradingDesk(t, { portfolios: [{ cash: 1000, holdings: [] }] });
  assert.equal(desk.headerChange().label, 'Change unavailable', 'before the chart loads: today’s move');
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
  assert.equal(desk.headerChange().label, 'Since first record');
  desk.chartHistory.set([{ at: 0, value: 1000 }, { at: 10, value: 1000 }]);
  assert.equal(desk.headerChangeText(), '$0.00 (0.00%)');
  desk.chartHistory.set([{ at: 0, value: 0 }, { at: 10, value: 1000 }]);
  assert.equal(desk.headerChange().amount, 1000, 'a later deposit does not replace the zero baseline');
  assert.equal(desk.headerChange().percent, null);
  assert.equal(desk.headerChangeText(), '+$1,000.00 (percentage unavailable)');
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

test('the allocation ring uses market quotes and remains unavailable with only book cost', async t => {
  const { desk, feed } = await tradingDesk(t);
  assert.equal(desk.allocationReady(), false, 'missing instrument quotes cannot be called market value');
  const h = { ...holding('AAPL', 1, 100), instrumentId: 'aapl-id' };
  feed.push([{ symbol: 'AAPL', instrumentId: 'aapl-id', price: 100 }]);
  desk.applyPortfolio({ cash: 100, holdings: [h] });
  assert.equal(desk.stocksShare(), 50);
  assert.equal(desk.assetAllocation().cashPercent, 50);
  desk.applyPortfolio({ cash: 100, holdings: [] });
  assert.equal(desk.stocksShare(), 0);
  desk.applyPortfolio({ cash: 0, holdings: [h] });
  assert.equal(desk.stocksShare(), 100);
  desk.applyPortfolio({ cash: 999999, holdings: [h] });
  assert.ok(desk.stocksShare() > 0 && desk.stocksShare() < 1, 'tiny allocations keep their arc');
  desk.applyPortfolio({ cash: 0, holdings: [] });
  assert.equal(desk.assetAllocation().cashPercent, 0, 'empty is not 100% cash');
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
  for (const [hour, greeting] of [[9, 'Good Morning'], [14, 'Good Afternoon'], [20, 'Good Evening']]) {
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

test('search Enter selects the latest match and leaves empty, unmatched and composing searches alone', t => {
  const desk = component(t, NoviceDashboard, [feedProvider(feedWith())]);
  const opened = []; t.mock.method(desk, 'openTrade', (...args) => opened.push(args));
  const event = patch => ({ key: 'Enter', preventDefault() {}, ...patch });
  desk.query.set(' msft '); desk.submitSearch(event({}));
  assert.deepEqual(opened, [['Buy', 'MSFT']]);
  desk.query.set('apple'); desk.submitSearch(event({}));
  assert.deepEqual(opened.at(-1), ['Buy', 'AAPL']);
  for (const query of ['', '   ', 'missing company']) { desk.query.set(query); desk.submitSearch(event({})); }
  desk.query.set('NVDA');
  for (const guard of ['isComposing', 'repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) desk.submitSearch(event({ [guard]: true }));
  assert.equal(opened.length, 2);
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

test('the spoken briefing reads the portfolio as shown, live moves and this account\'s orders (PS-18)', async t => {
  const fill = historyRow('FILLED', { fillPrice: 176.5, filledQuantity: 2, filledAt: new Date().toISOString() });
  const { desk, feed } = await tradingDesk(t);
  feed.push(listed().map((q) => ({ ...q, change: q.symbol === 'NVDA' ? 2.5 : 0.4 })));
  let asked;
  desk.orderHistoryClient = { list: async (filters) => { asked = filters; return [fill]; } };
  const snapshot = await desk.briefingSource();
  assert.equal(asked.accountId, 'acct-1');
  assert.equal(snapshot.accountId, 'acct-1', 'so this account remembers its own last briefing');
  assert.equal(snapshot.total, desk.portfolioValue());
  assert.equal(snapshot.gain, desk.totalReturn());
  assert.equal(snapshot.buyingPower, 6420.18);
  const cost = samplePortfolio.holdings.reduce((sum, h) => sum + h.quantity * h.averageCost, 0);
  assert.ok(Math.abs(snapshot.gainPercent - (desk.totalReturn() / cost) * 100) < 0.01, 'percent of what the shares cost');
  assert.deepEqual(snapshot.holdings.map((h) => [h.symbol, h.dayChangePercent]), [['AAPL', 0.4], ['MSFT', 0.4], ['NVDA', 2.5]]);
  assert.deepEqual(snapshot.orders, [fill]);
  assert.equal(snapshot.balanceHidden, false);
  assert.equal(snapshot.pricesDelayed, false);

  desk.showBalance.set(false);
  desk.orderHistoryClient = { list: async () => { throw new Error('down'); } };
  const failed = await desk.briefingSource();
  assert.equal(failed.balanceHidden, true, 'the spoken briefing respects balance hiding');
  assert.deepEqual(failed.orders, [], 'a failed order load leaves orders out');
});

test('choosing a chart period says where the portfolio started and where it is now', async t => {
  const { desk } = await tradingDesk(t, { chart: true });
  desk.feed.client = { closes: async () => [] };
  desk.setChartPeriod('1W');
  for (let i = 0; i < 5; i++) await flush();
  assert.match(desk.chartAnnouncement(), /^Last 7 days\. /);
  desk.showBalance.set(false);
  desk.setChartPeriod('1M');
  for (let i = 0; i < 5; i++) await flush();
  assert.match(desk.chartAnnouncement(), /^Last 30 days\. (Your balance is hidden|There is no history)/);
  assert.ok(!desk.chartAnnouncement().includes('$'), 'no amounts while the balance is hidden');
});

test('reviewing an order reads it back once, cutting in; confirming does not repeat it, editing re-reads (PS-23)', async t => {
  const { SwitchScanService } = await import('../../shared/switch-scan.ts');
  const said = [];
  const scan = { announce: (text, interrupt) => said.push([text, interrupt]) };
  const { desk } = await tradingDesk(t, { providers: [{ provide: SwitchScanService, useValue: scan }] });
  desk.openTrade('Buy', 'AAPL');
  desk.quantity.set('2');
  desk.reviewTrade();
  assert.equal(said.length, 1);
  assert.match(said[0][0], /^You're about to buy 2 shares of Apple for \$353\. .*Press Confirm buy to place the order\.$/);
  assert.equal(said[0][1], true, 'cuts in on whatever switch control was saying');
  await desk.confirmTrade();
  assert.equal(said.length, 1, 'confirming re-checks the order but does not read it again');
  desk.openTrade('Sell', 'AAPL');
  desk.quantity.set('1');
  desk.reviewTrade();
  assert.match(said.at(-1)[0], /^You're about to sell 1 share of Apple/);
  desk.quantity.set('3'); desk.reviewing.set(false);
  desk.reviewTrade();
  assert.match(said.at(-1)[0], /^You're about to sell 3 shares of Apple/, 'an edited order is read again');
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
  assert.equal(desk.marketStatusLine(), 'Open · Market closes in 2h 14m');
  desk.marketClock.set(new Date('2026-10-14T19:00:00Z'));
  assert.equal(desk.marketText(), 'Market closes in 1h 0m');
  // The far-off closed wording already names the state; it must not gain a second "Closed ·".
  feed.status.set({ open: false, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-20T13:30:00Z', nextClose: '2026-10-14T20:00:00Z' });
  assert.match(desk.marketStatusLine(), /^Market closed · Opens /);
  assert.equal(desk.marketStatusLine().match(/closed/gi).length, 1);
});

test('the sidebar resizes from the keyboard and a double-click on its edge, within its limits, and snaps open to the last width', t => {
  const desk = component(t, NoviceDashboard, [feedProvider(feedWith())]);
  const key = (k) => desk.resizeSidebarWithKeys({ key: k, preventDefault() {} });
  desk.sidebarWidth.set(224);
  key('ArrowRight');
  assert.equal(desk.sidebarWidth(), 240);
  key('End');
  assert.equal(desk.sidebarWidth(), desk.sidebarMax, 'never wider than the maximum');
  key('ArrowRight');
  assert.equal(desk.sidebarWidth(), desk.sidebarMax);
  desk.sidebarWidth.set(280);
  desk.toggleSidebar();
  assert.equal(desk.sidebarWidth(), desk.sidebarMin);
  assert.equal(desk.sidebarCollapsed(), true, 'the icon strip hides labels');
  key('ArrowLeft');
  assert.equal(desk.sidebarWidth(), desk.sidebarMin, 'never narrower than the icon strip');
  desk.toggleSidebar();
  assert.equal(desk.sidebarWidth(), 280, 'a double-click re-opens at the last open width');
  assert.equal(desk.sidebarCollapsed(), false);
});

test('the Overview allocation groups what the account holds by sector, largest first, with cash kept out of the ring', t => {
  const feed = fakeFeed([
    { symbol: 'AAPL', price: 100, sector: 'Technology' }, { symbol: 'MSFT', price: 100, sector: 'Technology' },
    { symbol: 'LLY', price: 100, sector: 'Health Care' }, { symbol: 'JPM', price: 100, sector: '' },
  ]);
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  const held = (symbol, value) => ({ symbol, name: symbol, value, shares: 1, average: value, today: 0, change: 0, total: 0, totalPercent: 0, logo: '' });
  desk.holdings.set([held('AAPL', 300), held('LLY', 500), held('MSFT', 100), held('JPM', 100)]);
  desk.buyingPower.set(250);
  const { invested, cash, sectors } = desk.sectorAllocation();
  assert.equal(invested, 1000);
  assert.equal(cash, 250, 'cash is reported beside the ring, not in it');
  assert.deepEqual(sectors.map((s) => [s.name, s.percent, s.symbols.join(',')]),
    [['Health Care', 50, 'LLY'], ['Technology', 40, 'AAPL,MSFT'], ['Other', 10, 'JPM']]);
  assert.equal(sectors[0].offset, '22.65', 'the first arc starts just past the top of the ring, after half a gap');
  assert.equal(sectors[0].dash, '45.30 54.70', 'each arc is its share less the gap that keeps the round ends apart');
  assert.match(desk.sectorSummary(), /Health Care 50 percent, Technology 40 percent, Other 10 percent/);
  desk.holdings.set([]);
  assert.deepEqual(desk.sectorAllocation().sectors, []);
});

test('sector allocation alternatives match invested shares, separate cash and respect privacy', t => {
  const desk = component(t, NoviceDashboard, [feedProvider(fakeFeed([{ symbol: 'AAPL', price: 100, sector: 'Technology' }]))]);
  desk.holdings.set([{ symbol: 'AAPL', value: 1000 }]);
  desk.buyingPower.set(250);
  desk.portfolioLoaded.set(true);
  desk.allocationReady.set(true);
  assert.deepEqual(desk.allocationCategories(), [
    { label: 'Technology', value: 1000, percent: 100 },
  ]);
  assert.match(desk.allocationDescription(), /Technology.*100/);
  assert.deepEqual(desk.allocationTable().references, [{ label: 'Cash, not invested', value: '$250.00' }]);
  assert.match(desk.allocationDescription(), /Cash, not invested: \$250\.00/);
  desk.showBalance.set(false);
  assert.doesNotMatch(JSON.stringify(desk.allocationTable()), /\$/);
});

test('a diverse portfolio groups smaller sectors without losing their invested value or symbols', t => {
  const stocks = Array.from({ length: 9 }, (_, i) => ({ symbol: `STOCK${i}`, price: i + 1, sector: `Sector ${i}` }));
  const desk = component(t, NoviceDashboard, [feedProvider(fakeFeed(stocks))]);
  desk.holdings.set(stocks.map(s => ({ symbol: s.symbol, value: s.price })));
  desk.buyingPower.set(25);
  desk.portfolioLoaded.set(true); desk.allocationReady.set(true);
  const { sectors, invested } = desk.sectorAllocation();
  assert.equal(sectors.length, 7);
  assert.equal(invested, 45);
  assert.equal(sectors.reduce((sum, s) => sum + s.value, 0), invested);
  const grouped = sectors.find(s => s.name === 'Other sectors');
  assert.equal(grouped.value, 6);
  assert.deepEqual(new Set(grouped.symbols), new Set(['STOCK0', 'STOCK1', 'STOCK2']));
  assert.equal(desk.allocationTable().rows.length, 7);
  assert.match(desk.allocationDescription(), /Other sectors/);
});

test('allocation alternatives distinguish loading, missing quotes and a genuinely empty portfolio', t => {
  const desk = component(t, NoviceDashboard, [feedProvider(fakeFeed([]))]);
  assert.match(desk.allocationDescription(), /not loaded/);
  assert.deepEqual(desk.allocationTable().rows, []);
  desk.portfolioLoaded.set(true);
  assert.match(desk.allocationTable().note, /unavailable/);
  assert.match(desk.allocationDescription(), /unavailable/);
  desk.allocationReady.set(true);
  assert.match(desk.allocationDescription(), /No assets/);
  assert.deepEqual(desk.sectorAllocation().sectors, []);
});

test('the ticket stock menu opens downwards, moves with the arrow keys and picks with Enter', t => {
  const desk = component(t, NoviceDashboard, [feedProvider(fakeFeed([
    { symbol: 'AAPL', price: 100, sector: 'Technology' }, { symbol: 'MSFT', price: 200, sector: 'Technology' },
  ]))]);
  const key = (k) => ({ key: k, preventDefault() {}, stopPropagation() {} });
  desk.chooseTradeSymbol('AAPL');
  desk.stockMenuKey(key('ArrowDown'));
  assert.equal(desk.stockMenuOpen(), true, 'an arrow key opens the menu on the current stock');
  const start = desk.stockMenuIndex();
  desk.stockMenuKey(key('ArrowDown'));
  assert.equal(desk.stockMenuIndex(), Math.min(start + 1, desk.tradableQuotes().length - 1));
  desk.stockMenuKey(key('End'));
  const last = desk.tradableQuotes().at(-1).symbol;
  desk.stockMenuKey(key('Enter'));
  assert.equal(desk.tradeQuote().symbol, last);
  assert.equal(desk.stockMenuOpen(), false, 'picking closes the menu');
  desk.toggleStockMenu();
  desk.stockMenuKey(key('Escape'));
  assert.equal(desk.stockMenuOpen(), false, 'Escape closes just the menu');
});

test('the Buy/Sell window charts the chosen stock from its recorded prices, follows a switch and changes period', async t => {
  const feed = fakeFeed([{ symbol: 'AAPL', price: 110 }, { symbol: 'MSFT', price: 400 }]);
  const desk = component(t, NoviceDashboard, [feedProvider(feed)]);
  desk.quotes.set(feed.quotes());
  const asked = [];
  feed.client = {
    closes: async (id, interval, limit, now) => {
      asked.push([id, interval]);
      return id === 'aapl-uuid'
        ? [{ at: now - 3 * 60_000, price: 100 }, { at: now - 60_000, price: 110 }]
        : [{ at: now - 3 * 60_000, price: 400 }, { at: now - 60_000, price: 380 }];
    },
  };
  desk.openTrade('Buy', 'AAPL');
  for (let i = 0; i < 4; i++) await flush();
  assert.deepEqual(desk.stockChartPoints().map((p) => p.value), [100, 110]);
  assert.equal(desk.stockChartChange().amount, 10, 'the change is measured over the period shown');
  desk.stockChartScrub.set(desk.stockChartPoints()[0]);
  assert.equal(desk.stockChartPrice(), 100, 'hovering shows that point’s price');

  desk.chooseTradeSymbol('MSFT');
  for (let i = 0; i < 4; i++) await flush();
  assert.deepEqual(desk.stockChartPoints().map((p) => p.value), [400, 380], 'switching the stock redraws its chart');
  assert.equal(desk.stockChartScrub(), null);

  desk.setStockChartPeriod('1M');
  for (let i = 0; i < 4; i++) await flush();
  assert.equal(desk.stockChartPeriod(), '1M');
  assert.equal(asked.at(-1)[0], 'msft-uuid');
  desk.closeModal();
});

test('trade chart loading and missing history never report a zero gain as observed performance', async t => {
  const { desk, feed } = await tradingDesk(t);
  let answer;
  feed.client = { closes: () => new Promise(resolve => { answer = resolve; }) };
  desk.openTrade('Buy', 'AAPL');
  assert.equal(desk.stockChartChangeAvailable(), false);
  answer([]); await flush();
  assert.equal(desk.stockChartChangeAvailable(), false);
  assert.equal(desk.stockChartChange().percent, null);
  // With no backfilled history, real live observations still form a useful chart.
  desk.stockChartLive.set([{ at: Date.now() - 1000, value: 100 }, { at: Date.now(), value: 110 }]);
  assert.equal(desk.stockChartChangeAvailable(), true);
  assert.equal(desk.stockChartChange().label, 'Available history');
  assert.equal(desk.stockChartChange().amount, 10);
  desk.setStockChartPeriod('1M');
  assert.equal(desk.stockChartChangeAvailable(), false);
  desk.closeModal();
  answer([{ at: Date.now(), price: 999 }]); await flush();
  assert.deepEqual(desk.stockChartHistory(), [], 'closing a ticket invalidates its pending request');
});
