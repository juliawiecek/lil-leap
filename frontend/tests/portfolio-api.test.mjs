import assert from 'node:assert/strict';
import { test } from 'node:test';
const { PortfolioClient, valuePortfolio } = await import('../src/app/portfolio-api.ts');

const holding = (instrumentId, quantity, averageCost) => ({ instrumentId, symbol: instrumentId.toUpperCase(), instrumentName: instrumentId, quantity, averageCost });

test('holdings are valued at the latest bid, falling back to average cost without a quote', () => {
  const valuation = valuePortfolio(
    { cash: 1000, holdings: [holding('aapl', 10, 200), holding('msft', 2, 400)] },
    new Map([['aapl', 190.5]]),
  );
  assert.deepEqual(valuation.holdings.map(h => [h.price, h.value, h.gain, h.gainPercent]), [[190.5, 1905, -95, -4.75], [400, 800, 0, 0]]);
  assert.equal(valuation.holdingsValue, 2705);
  assert.equal(valuation.total, 3705);
  assert.equal(valuation.gain, -95);
  assert.equal(valuation.gainPercent, -3.39);
});

test('an empty portfolio is worth its cash with no gain', () => {
  assert.deepEqual(valuePortfolio({ cash: 50, holdings: [] }, new Map()), {
    cash: 50, holdings: [], holdingsValue: 0, total: 50, gain: 0, gainPercent: 0,
  });
});

test('load sums cash, keeps instrument ids and drops empty positions', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push([url, init.headers.Authorization]);
    const body = url.endsWith('/cash')
      ? [{ balance: '100.10' }, { balance: 5 }]
      : [{ instrumentId: 'i1', symbol: 'AAPL', instrumentName: 'Apple', quantity: '3', averageCost: '150.5' },
         { instrumentId: 'i2', symbol: 'MSFT', instrumentName: 'Microsoft', quantity: 0, averageCost: 300 }];
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const portfolio = await new PortfolioClient({ accessToken: 'tok' }, fetchImpl).load();
  assert.deepEqual(portfolio, { cash: 105.1, holdings: [{ instrumentId: 'i1', symbol: 'AAPL', instrumentName: 'Apple', quantity: 3, averageCost: 150.5 }] });
  assert.deepEqual(requests.map(([url, auth]) => [url, auth]).sort(), [['/api/v1/cash', 'Bearer tok'], ['/api/v1/holdings', 'Bearer tok']]);
});

test('latestBids reads each quote and leaves out the ones that fail', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/bad')) return new Response('{}', { status: 503 });
    if (url.endsWith('/zero')) return new Response(JSON.stringify({ bid: 0 }), { status: 200 });
    return new Response(JSON.stringify({ bid: '225.10' }), { status: 200 });
  };
  const bids = await new PortfolioClient({ accessToken: 'tok' }, fetchImpl).latestBids(['good', 'bad', 'zero']);
  assert.deepEqual([...bids], [['good', 225.1]]);
});

test('loading without a session fails with a readable message', async () => {
  await assert.rejects(new PortfolioClient({ accessToken: null }).load(), /Sign in to see your balances/);
});
