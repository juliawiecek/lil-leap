import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiHttp } from './http-helper.mjs';
import { MarketFeedClient } from '../src/app/market-feed-api.ts';

test('candles preserve all OHLC values and request the chosen stock and interval', async () => {
  const requests = [];
  const client = new MarketFeedClient({ accessToken: 'test' }, apiHttp(async url => {
    requests.push(url);
    return new Response(JSON.stringify([{ time: '2026-10-21T13:30:00Z', open: '100', high: '104', low: '98', close: '102' }]));
  }));
  assert.deepEqual(await client.candles('stock/id', '15m'), [{ at: Date.parse('2026-10-21T13:30:00Z'), open: 100, high: 104, low: 98, close: 102 }]);
  assert.equal(requests[0], '/api/v1/quotes/candles/stock%2Fid?interval=15m&limit=500');
});
test('missing or contradictory OHLC values fail instead of generating fake candles', async () => {
  for (const row of [{ close: 100 }, { open: 100, high: 90, low: 80, close: 95 }]) {
    const client = new MarketFeedClient({ accessToken: 'test' }, apiHttp(async () => new Response(JSON.stringify([{ time: '2026-10-21T13:30:00Z', ...row }]))));
    await assert.rejects(client.candles('a', '1m'), /Incomplete candle data/);
  }
});
