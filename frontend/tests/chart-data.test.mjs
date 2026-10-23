import assert from 'node:assert/strict';
import { test } from 'node:test';
import { of, throwError } from 'rxjs';
import { component } from './component-helper.mjs';
import { fakeFeed, feedProvider } from './feed-helper.mjs';
const { quoteHistoryPoints, orderedPrices, allocation } = await import('../src/app/chart-data.ts');
const { MarketFeedClient } = await import('../src/app/market-feed-api.ts');
const { candleMetadata } = await import('../src/app/market-feed-api.ts');
const { tradeMarks } = await import('../src/app/trade-marks.ts');
const { ema, rsi, vwap } = await import('../src/app/technical-chart-math.ts');
const { portfolioEvents, portfolioSeries, ledgerMatches } = await import('../src/app/portfolio-history.ts');
const { hasMarketValuation } = await import('../src/app/portfolio-api.ts');
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const at = Date.parse('2026-10-21T14:00:00Z');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('malformed candle fields are not coerced to financial observations', () => {
  const bar = { time: new Date(at).toISOString(), open: 2, high: 3, low: 1, close: 2 };
  for (const field of ['open', 'high', 'low', 'close']) {
    for (const invalid of [null, undefined, '', false, true, NaN, Infinity]) {
      assert.equal(candleMetadata({ ...bar, [field]: invalid }), undefined);
    }
  }
  assert.equal(candleMetadata(bar).volume, null);
});

test('trade markers require valid executions and never substitute submitted quantity', () => {
  const fill = { symbol: 'AAPL', side: 'BUY', status: 'FILLED', quantity: 100,
    filledQuantity: 2, fillPrice: 10, filledAt: new Date(at).toISOString() };
  assert.equal(tradeMarks([fill], 'AAPL')[0].quantity, 2);
  for (const invalid of [
    { filledQuantity: null }, { filledQuantity: NaN }, { filledQuantity: 0 },
    { fillPrice: null }, { filledAt: 'invalid' }, { side: 'UNKNOWN' }, { status: 'ACCEPTED' },
  ]) assert.deepEqual(tradeMarks([{ ...fill, ...invalid }], 'AAPL'), []);
});

test('ledger reconciliation rejects non-finite cash, shares and snapshot quantities', () => {
  const snapshot = { cash: 0, holdings: [] };
  assert.equal(ledgerMatches(snapshot, [{ at, amount: NaN }], []), false);
  assert.equal(ledgerMatches(snapshot, [{ at: NaN, amount: 0 }], []), false);
  assert.equal(ledgerMatches(snapshot, [], [{ at, symbol: 'AAPL', quantity: NaN, price: 10 }]), false);
  assert.equal(ledgerMatches({ cash: 0, holdings: [{ symbol: 'AAPL', quantity: NaN }] }, [], []), false);
});

test('history mapping normalizes zones to epoch ms, preserves precision and newest timestamp ties', () => {
  const rows = [
    { quotedAt: '2026-10-21T10:00:00-04:00', midpoint: '101.12345678', bid: '100.12' },
    { quotedAt: '2026-10-21T14:00:00Z', midpoint: 99, bid: 98 },
    { quotedAt: '2026-10-21T13:59:00Z', midpoint: 100, bid: 99 },
    ...[null, undefined, '', false, Infinity, NaN, 0, -1].map(midpoint => ({ quotedAt: '2026-10-21T13:58:00Z', midpoint })),
    { quotedAt: 'invalid', midpoint: 10 },
  ];
  assert.deepEqual(quoteHistoryPoints(rows), [{ time: at - 60000, value: 100 }, { time: at, value: 101.12345678 }]);
  assert.deepEqual(quoteHistoryPoints(rows, 'bid'), [{ time: at - 60000, value: 99 }, { time: at, value: 100.12 }]);
  assert.deepEqual(quoteHistoryPoints([]), []);
  assert.deepEqual(orderedPrices([{ at, price: 1 }, { at: at - 1, price: 2 }, { at, price: 3 }]), [{ at: at - 1, price: 2 }, { at, price: 3 }]);
});

test('bid candles use actual observation times and bids, never bucket ends or today’s spread', async () => {
  const rows = [{ time: new Date(at - 60000).toISOString(), observedAt: new Date(at - 15000).toISOString(),
    open: 101, high: 104, low: 100, close: 103, bidClose: '102.98765432' }];
  const client = new MarketFeedClient({ accessToken: 'token' }, { get: () => of(rows) });
  assert.deepEqual(await client.closes('a', '1m', 10, at, 'bid'), [{ at: at - 15000, price: 102.98765432 }]);
  const midpoint = await client.closes('a', '1m', 10, at);
  assert.equal(midpoint[0].at, at - 15000);
  assert.equal(midpoint[0].candle.volume, null);
  delete rows[0].observedAt;
  assert.deepEqual(await client.closes('a', '1m', 10, at, 'bid'), []);
});

test('history requests coalesce across price bases, retry failures and do not survive a token change', async () => {
  let calls = 0, fail = false;
  const tokens = { accessToken: 'a' };
  const client = new MarketFeedClient(tokens, { get: () => {
    calls++;
    return fail ? throwError(() => new Error('offline')) : of([{ quotedAt: new Date(at).toISOString(), midpoint: 10, bid: 9 }]);
  } });
  const [mid, bid] = await Promise.all([client.history('a'), client.history('a', 1000, 'bid')]);
  assert.equal(calls, 1);
  assert.equal(mid[0].price, 10); assert.equal(bid[0].price, 9);
  tokens.accessToken = 'b'; await client.history('a'); assert.equal(calls, 2);
  fail = true; await assert.rejects(client.history('b')); fail = false;
  await client.history('b'); assert.equal(calls, 4);
});

test('EMA SMA seed and Wilder RSI match independent hand/reference values without rounding', () => {
  const points = values => values.map((price, i) => ({ at: at + i * 60000, price }));
  assert.deepEqual(ema(points([10, 11, 12, 13, 14]), 3).map(p => p.price), [11, 12, 13]);
  // Wilder's published 14-period example, first RSI 70.464135... then 66.249618...
  const values = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
  const result = rsi(points(values), 14);
  assert.ok(Math.abs(result[0].price - 70.46413502109705) < 1e-10);
  assert.ok(Math.abs(result[1].price - 66.24961855355505) < 1e-10);
  assert.equal(result[0].at, at + 14 * 60000);
  assert.deepEqual(rsi(points(values.slice(0, 14)), 14), []);
  assert.deepEqual(ema(points(values), 200), []);
  const linear = points(Array.from({ length: 201 }, (_, i) => i + 1));
  assert.deepEqual(ema(linear, 200).map(p => p.price), [100.5, 101.5]);
  assert.deepEqual(ema(linear.slice(0, 51), 50).map(p => p.price), [25.5, 26.5]);
  assert.equal(rsi(points([1, 2, 3]), 2)[0].price, 100);
  assert.equal(rsi(points([3, 2, 1]), 2)[0].price, 0);
  assert.equal(rsi(points([2, 2, 2]), 2)[0].price, 50);
  assert.notDeepEqual(rsi(points(values), 3), rsi(points(values), 14));
});

test('VWAP weights typical OHLC prices by reported shares and resets on New York days', () => {
  const bar = (time, price, volume) => ({ at: time, price, candle: { time, open: price, high: price + 1, low: price - 1, close: price, volume } });
  assert.deepEqual(vwap([bar(at, 10, 100), bar(at + 60000, 13, 200)]).map(p => p.price), [10, 12]);
  assert.equal(vwap([bar(at, 10, 100), bar(at + 86400000, 20, 50)]).at(-1).price, 20);
  assert.deepEqual(vwap([bar(at, 10, null)]), []);
  assert.deepEqual(vwap([bar(at, 10, 0)]), []);
  assert.deepEqual(vwap([bar(at, 10, 100), bar(at + 60000, 13, null)]), [], 'no incomplete cumulative VWAP');
  const invalid = bar(at, 10, 100);
  invalid.candle.time = NaN;
  assert.deepEqual(vwap([invalid]), [], 'invalid bar times never throw or create a session');
  invalid.candle.time = at; invalid.candle.high = NaN;
  assert.deepEqual(vwap([invalid]), [], 'invalid OHLC never enters VWAP');
  assert.deepEqual(vwap([bar(at, 10, 0), bar(at + 60000, 13, 100)]).map(p => p.price), [13]);
});

test('executed buys and sells move cash/shares once; open orders and pending transfers do not', () => {
  const order = (id, side, quantity, price, time) => ({ orderId: id, status: 'FILLED', symbol: 'AAPL', side, filledQuantity: quantity, fillPrice: price, filledAt: new Date(time).toISOString() });
  const buy = order('buy', 'BUY', 5, 100, at + 1000), sell = order('sell', 'SELL', 2, 110, at + 3000);
  const events = portfolioEvents([{ transactionId: 'cash', occurredAt: new Date(at).toISOString(), amount: 1000 },
    { occurredAt: new Date(at).toISOString(), amount: 999, settlementStatus: 'PENDING' }], [buy, buy, sell, { status: 'ACCEPTED' }]);
  const prices = new Map([['AAPL', [{ at: at + 1000, price: 100 }, { at: at + 2000, price: 104 }, { at: at + 3000, price: 110 }]]]);
  const result = portfolioSeries({ start: at, end: at + 4000 }, events.cash, events.shares, prices);
  assert.equal(result.find(p => p.at === at + 1000).value, 1000);
  assert.equal(result.find(p => p.at === at + 2000).value, 1020);
  assert.equal(result.find(p => p.at === at + 3000).value, 1050);
  assert.equal(ledgerMatches({ cash: 720, holdings: [{ symbol: 'AAPL', quantity: 3 }] }, events.cash, events.shares), true);
  assert.equal(ledgerMatches({ cash: 700, holdings: [{ symbol: 'AAPL', quantity: 3 }] }, events.cash, events.shares), false);
  assert.throws(() => portfolioEvents([], [{ ...buy, fillPrice: null }]), /incomplete/);
  assert.deepEqual(portfolioSeries({ start: at, end: at + 4000 }, events.cash, events.shares, new Map()), []);
  assert.deepEqual(portfolioSeries({ start: at, end: at + 4000 }, [], [], new Map()), [{ at, value: 0 }, { at: at + 4000, value: 0 }]);
});

test('allocations use actual current valuations, sum to 100 after rounding, and handle no value', () => {
  const result = allocation(1, 2);
  assert.equal(result.stocksPercent, 33.3); assert.equal(result.cashPercent, 66.7);
  assert.equal(result.stocksPercent + result.cashPercent, 100);
  assert.equal(allocation(2, 2).stocksPercent, 50);
  assert.equal(allocation(0, 0).cashPercent, 0);
  assert.equal(allocation(NaN, 2).available, false);
  assert.equal(hasMarketValuation({ cash: 2, holdings: [{ instrumentId: 'a', quantity: 1 }] }, new Map()), false);
  assert.equal(hasMarketValuation({ cash: 2, holdings: [{ instrumentId: 'a', quantity: 1 }] }, new Map([['a', 100]])), true);
});

for (const Type of [NoviceDashboard, AdvancedDashboard]) {
  test(`${Type.name}: a stale balance response cannot overwrite newer account data`, async t => {
    const desk = component(t, Type, [{ provide: AuthService, useValue: { accessToken: null } }, feedProvider(fakeFeed([]))]);
    const old = deferred();
    let calls = 0;
    desk.portfolioClient = { load: () => ++calls === 1 ? old.promise : Promise.resolve({ cash: 200, holdings: [] }) };
    const initial = desk.refreshPortfolio(); await desk.refreshPortfolio();
    old.resolve({ cash: 100, holdings: [] }); await initial;
    assert.equal(desk.buyingPower(), 200);
  });
}

test('advanced history drops stale symbols/timeframes, preserves empty windows and retries errors', async t => {
  const feed = fakeFeed([]), old = deferred();
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useValue: { accessToken: null } }, feedProvider(feed)]);
  desk.selected.set({ symbol: 'AAPL', instrumentId: 'a', price: 100, quotedAt: new Date(at).toISOString() });
  feed.client = { closes: () => old.promise, history: async () => [] };
  desk.setPeriod('1D'); assert.equal(desk.historyLoading(), true);
  desk.selected.set({ symbol: 'MSFT', instrumentId: 'm', price: 200, quotedAt: new Date(at).toISOString() });
  feed.client.closes = async () => [{ at: at - 60000, price: 190 }, { at, price: 200 }];
  desk.setPeriod('1W'); await flush();
  old.resolve([{ at, price: 999 }]); await flush();
  assert.equal(desk.priceHistory().at(-1).price, 200);
  assert.equal(desk.historyLoading(), false);
  feed.client.closes = async () => { throw new Error('down'); };
  desk.setPeriod('1M'); await flush();
  assert.match(desk.historyError(), /could not be loaded/);
  feed.client.closes = async () => [];
  desk.setPeriod('1M'); await flush();
  assert.equal(desk.historyError(), ''); assert.deepEqual(desk.priceHistory(), []);
  desk.priceHistory.set([{ at, price: 200 }]);
  desk.setPeriod('1D'); await flush();
  assert.deepEqual(desk.priceHistory(), [], 'a successful empty refresh clears prior observations');
  desk.selected.set({ symbol: 'UNKNOWN', price: 0 });
  desk.setPeriod('1W');
  assert.deepEqual(desk.priceHistory(), []);
  assert.equal(desk.historyLoading(), false);
  assert.match(desk.historyError(), /unavailable/);
});

test('a live quote in a new interval stays a raw observation until real OHLC arrives', async t => {
  const feed = fakeFeed([]);
  const desk = component(t, AdvancedDashboard, [{ provide: AuthService, useValue: { accessToken: null } }, feedProvider(feed)]);
  const time = Math.floor(Date.now() / 300000) * 300000 - 300000;
  const candle = { time, open: 100, high: 105, low: 99, close: 103, volume: null };
  feed.client = { closes: async () => Array.from({ length: 30 }, (_, i) => ({
    at: time - (29 - i) * 300000 + 1000, price: 103, candle: { ...candle, time: time - (29 - i) * 300000 },
  })), history: async () => [] };
  feed.push([{ symbol: 'AAPL', price: 103, quotedAt: new Date(time + 1000).toISOString() }]);
  await flush();
  assert.ok(desk.priceHistory().at(-1).candle);
  feed.push([{ symbol: 'AAPL', price: 106, quotedAt: new Date(time + 301000).toISOString() }]);
  assert.equal(desk.priceHistory().at(-1).price, 106);
  assert.equal(desk.priceHistory().at(-1).candle, undefined);
});
