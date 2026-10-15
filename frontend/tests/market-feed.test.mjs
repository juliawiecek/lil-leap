import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { apiHttp } from './http-helper.mjs';
const { MarketFeed } = await import('../src/app/market-feed.service.ts');
const { MarketTicker } = await import('../src/app/market-ticker.ts');
const { MarketFeedClient, isDelayed, changeFrom, QUOTE_STALE_MS } = await import('../src/app/market-feed-api.ts');
const { QUOTE_REFRESH_MS } = await import('../src/app/portfolio-api.ts');
const { MARKET_STATUS_REFRESH_MS, marketBadgeText, closedMarketWarning, localOpeningTime } = await import('../src/app/market-status-api.ts');

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const STOCKS = [
  { instrumentId: 'msft', symbol: 'MSFT', name: 'Microsoft', sector: 'TECH' },
  { instrumentId: 'aapl', symbol: 'AAPL', name: 'Apple', sector: 'TECH' },
];
const openStatus = { open: true, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-15T13:30:00Z', nextClose: '2026-10-14T20:00:00Z' };

/** A page whose visibility the test controls. */
function page(t) {
  const listeners = new Set();
  const doc = {
    hidden: false,
    addEventListener: (type, listener) => type === 'visibilitychange' && listeners.add(listener),
    removeEventListener: (type, listener) => listeners.delete(listener),
    setHidden(hidden) {
      this.hidden = hidden;
      for (const listener of listeners) {
        listener();
      }
    },
    listeners,
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => (original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document));
  return doc;
}

/** A feed backed by a scripted market: prices per symbol per call, and a request log. */
function feedWith(t, { prices = { MSFT: [400, 401], AAPL: [200, 199] }, fail = () => false, open = 100, signedIn = () => true } = {}) {
  const calls = { latest: 0, status: 0, perSymbol: {} };
  const feed = component(t, MarketFeed);
  feed.client = {
    get signedIn() { return signedIn(); },
    instruments: async () => STOCKS,
    dayOpen: async () => open,
    latest: async (id) => {
      calls.latest += 1;
      const symbol = STOCKS.find((s) => s.instrumentId === id).symbol;
      const n = (calls.perSymbol[symbol] = (calls.perSymbol[symbol] ?? 0) + 1);
      if (fail(symbol, n)) {
        throw new Error('quote down');
      }
      const series = prices[symbol];
      return { price: series[Math.min(n - 1, series.length - 1)], bid: 0, ask: 0, quotedAt: new Date().toISOString() };
    },
  };
  feed.statusClient = { status: async () => { calls.status += 1; return openStatus; } };
  return { feed, calls };
}

test('a client with no holdings sees every listed price move within 10 seconds, with a direction to flash', async t => {
  page(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { feed } = feedWith(t);
  const stop = feed.start();
  await flush();
  assert.deepEqual(feed.quotes().map((q) => [q.symbol, q.price, q.direction]), [['MSFT', 400, null], ['AAPL', 200, null]]);
  t.mock.timers.tick(QUOTE_REFRESH_MS); await flush();
  assert.deepEqual(feed.quotes().map((q) => [q.symbol, q.price, q.direction, q.version]), [['MSFT', 401, 'up', 1], ['AAPL', 199, 'down', 1]]);
  assert.equal(feed.quote('MSFT').change, 301, 'change is against the first quote of the day');
  stop();
});

test('a hidden tab makes no quote requests and one immediate request when shown again', async t => {
  const doc = page(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { feed, calls } = feedWith(t);
  const stop = feed.start();
  await flush();
  const afterFirst = calls.latest;
  doc.setHidden(true);
  t.mock.timers.tick(QUOTE_REFRESH_MS * 3); await flush();
  assert.equal(calls.latest, afterFirst, 'nothing is requested while hidden');
  const statusBefore = calls.status;
  doc.setHidden(false); await flush();
  assert.equal(calls.latest, afterFirst + STOCKS.length, 'one refresh of every stock, straight away');
  assert.equal(calls.status, statusBefore + 1, 'and the market status is re-read too');
  stop();
  assert.equal(doc.listeners.size, 0, 'stopping removes the visibility listener');
});

test('a failed quote keeps the last price shown', async t => {
  page(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { feed } = feedWith(t, { fail: (symbol, n) => symbol === 'AAPL' && n === 2 });
  const stop = feed.start();
  await flush();
  t.mock.timers.tick(QUOTE_REFRESH_MS); await flush();
  assert.equal(feed.quote('AAPL').price, 200);
  assert.equal(feed.quote('AAPL').direction, null);
  assert.equal(feed.quote('MSFT').price, 401);
  stop();
});

test('market status refreshes every minute, and the feed stops when the user signs out', async t => {
  page(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signedIn = true;
  const { feed, calls } = feedWith(t, { signedIn: () => signedIn });
  const stop = feed.start();
  await flush();
  assert.deepEqual(feed.status(), openStatus);
  t.mock.timers.tick(MARKET_STATUS_REFRESH_MS); await flush();
  assert.equal(calls.status, 2);
  signedIn = false;
  t.mock.timers.tick(QUOTE_REFRESH_MS); await flush();
  assert.equal(feed.running, false);
  assert.deepEqual(feed.quotes(), [], 'prices are forgotten on sign-out');
  assert.equal(feed.status(), null);
  const requests = calls.latest;
  t.mock.timers.tick(QUOTE_REFRESH_MS * 5); await flush();
  assert.equal(calls.latest, requests, 'no polling after sign-out');
  stop();
});

test('the feed keeps polling while any view uses it and stops after the last one leaves', async t => {
  page(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { feed, calls } = feedWith(t);
  const first = feed.start();
  const second = feed.start();
  await flush();
  first();
  first();
  assert.equal(feed.running, true, 'releasing twice counts once');
  second();
  assert.equal(feed.running, false);
  const requests = calls.latest;
  t.mock.timers.tick(QUOTE_REFRESH_MS * 2); await flush();
  assert.equal(calls.latest, requests);
});

test('a quote older than 60 seconds is delayed; change is measured from the day open', () => {
  const now = Date.parse('2026-10-14T15:00:00Z');
  assert.equal(isDelayed(new Date(now - 61000).toISOString(), now), true);
  assert.equal(isDelayed(new Date(now - QUOTE_STALE_MS).toISOString(), now), false);
  assert.equal(isDelayed('', now), true);
  assert.equal(changeFrom(200, 203), 1.5);
  assert.equal(changeFrom(undefined, 203), 0);
  assert.equal(changeFrom(200, 0), 0);
});

test('the ticker shows the market badge and flags a stale price', t => {
  page(t);
  const feed = {
    quotes: () => [], status: () => ({ ...openStatus, open: false, nextOpen: '2026-10-15T13:30:00Z' }),
    now: () => Date.parse('2026-10-14T21:30:00Z'), start: () => () => undefined,
  };
  const ticker = component(t, MarketTicker, [{ provide: MarketFeed, useValue: feed }]);
  assert.match(ticker.badge(), /^Closed · Opens /);
  assert.equal(ticker.delayed('2026-10-14T21:28:58Z'), true);
  assert.equal(ticker.delayed('2026-10-14T21:29:30Z'), false);
});

test('the client lists only tradable stocks and reads the first quote of the day', async () => {
  const requests = [];
  const rows = {
    '/api/v1/instruments': [
      { instrumentId: 'b', symbol: 'MSFT', instrumentName: 'Microsoft', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'a', symbol: 'AAPL', instrumentName: 'Apple', sector: 'TECH', enabled: true, tradable: true },
      { instrumentId: 'c', symbol: 'TSLA', instrumentName: 'Tesla', sector: 'AUTO', enabled: true, tradable: false },
      { instrumentId: 'd', symbol: 'META', instrumentName: 'Meta', sector: 'TECH', enabled: false, tradable: true },
    ],
    '/api/v1/quotes/latest/by-instrument/a': { bid: '199.9', ask: '200.1', midpoint: '200', quotedAt: '2026-10-14T15:00:00Z' },
    '/api/v1/quotes/history/a?limit=1000': [
      { midpoint: '201', bid: 0, ask: 0, quotedAt: '2026-10-14T14:00:00' },
      { midpoint: '198', bid: 0, ask: 0, quotedAt: '2026-10-14T09:00:00' },
      { midpoint: '150', bid: 0, ask: 0, quotedAt: '2026-10-13T20:00:00' },
    ],
  };
  const client = new MarketFeedClient({ accessToken: 'tok' }, apiHttp(async (url, init) => {
    requests.push([url, init.headers.Authorization]);
    return new Response(JSON.stringify(rows[url]), { status: rows[url] ? 200 : 404 });
  }));
  assert.equal(client.signedIn, true);
  assert.deepEqual((await client.instruments()).map((i) => i.symbol), ['AAPL', 'MSFT']);
  assert.deepEqual(await client.latest('a'), { price: 200, bid: 199.9, ask: 200.1, quotedAt: '2026-10-14T15:00:00Z' });
  assert.equal(await client.dayOpen('a', new Date('2026-10-14T16:00:00')), 198);
  assert.equal(await client.dayOpen('a', new Date('2026-10-16T16:00:00')), undefined);
  assert.ok(requests.every(([, auth]) => auth === undefined), 'the interceptor attaches the bearer token');
  await assert.rejects(client.latest('missing'), /Could not load prices/);
  await assert.rejects(new MarketFeedClient({ accessToken: null }).instruments(), /Sign in/);
});

test('the badge flips between open and closed in local time, and the ticket warns only while closed', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const closed = { ...openStatus, open: false, nextOpen: '2026-10-14T13:30:00Z' };
  const opensAt = localOpeningTime(closed.nextOpen, now, 'en-GB');
  assert.equal(marketBadgeText(closed, now, 'en-GB'), `Closed · Opens ${opensAt}`);
  assert.equal(closedMarketWarning(closed, now, 'en-GB'), `The market is closed. Your order will fill when it opens at ${opensAt}.`);
  assert.equal(marketBadgeText({ ...openStatus, nextClose: '2026-10-14T20:00:00Z' }, now, 'en-GB'),
    `Open · Closes ${localOpeningTime('2026-10-14T20:00:00Z', now, 'en-GB')}`);
  assert.equal(closedMarketWarning(openStatus, now), '');
  assert.equal(closedMarketWarning(null, now), '');
  assert.equal(marketBadgeText(null, now), 'Market status unavailable');
  assert.match(localOpeningTime('2026-10-19T13:30:00Z', now, 'en-GB'), /^Mon /, 'another day names the weekday');
});
