import assert from 'node:assert/strict';
import { test } from 'node:test';
import './component-helper.mjs';
const { MarketDataClient } = await import('../src/app/market-data-api.ts');

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const row = { time: '2026-10-14T14:00:00Z', open: '1', high: '2', low: '0.5', close: '1.5' };

test('candles sends the token and timeframe, and converts the rows', async () => {
  const calls = [];
  const client = new MarketDataClient({ accessToken: 'tok' }, async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    return json([row]);
  });
  const candles = await client.candles('id/1', { interval: '5m', limit: 78 });
  assert.deepEqual(calls, [{ url: '/api/v1/quotes/candles/id%2F1?interval=5m&limit=78', auth: 'Bearer tok' }]);
  assert.deepEqual(candles, [{ time: Date.UTC(2026, 9, 14, 14) / 1000, open: 1, high: 2, low: 0.5, close: 1.5 }]);
});

test('candles explains each failure in words a user can act on', async () => {
  const timeframe = { interval: '1m', limit: 1 };
  await assert.rejects(new MarketDataClient({ accessToken: null }).candles('a', timeframe), /Sign in/);
  await assert.rejects(new MarketDataClient({ accessToken: 't' }, async () => { throw new TypeError('down'); })
    .candles('a', timeframe), /Could not reach the server/);
  let expired = null;
  const tokens = { accessToken: 'old', unauthorized: token => { expired = token; } };
  await assert.rejects(new MarketDataClient(tokens, async () => json({}, 401)).candles('a', timeframe), /Could not load the price chart/);
  assert.equal(expired, 'old');
});

test('candlesFor loads several instruments and leaves out the ones that fail', async () => {
  const client = new MarketDataClient({ accessToken: 't' }, async url => (url.includes('/bad?') ? json({}, 500) : json([row])));
  const byId = await client.candlesFor(['good', 'bad'], { interval: '1m', limit: 1 });
  assert.deepEqual([...byId.keys()], ['good']);
  assert.equal(byId.get('good').length, 1);
});
