import { apiHttp } from './http-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { PortfolioClient, valuePortfolio, dayGainOf } = await import('../src/app/portfolio-api.ts');
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';

test('portfolio distinguishes transport failures from HTTP rejection', async () => {
  for (const failure of [new TypeError('offline'), new HttpErrorResponse({ status: 0 }), new HttpErrorResponse({ status: 503 })]) {
    const client = new PortfolioClient({ accessToken: 'token' }, { get: () => throwError(() => failure) });
    await assert.rejects(client.load(), failure.status === 503 ? /Could not load your balances/ : /Could not reach the server/);
  }
});

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
    cash: 50, holdings: [], holdingsValue: 0, total: 50, gain: 0, gainPercent: 0, dayGain: 0, dayGainPercent: 0,
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
  const portfolio = await new PortfolioClient({ accessToken: 'tok' }, apiHttp(fetchImpl)).load();
  assert.deepEqual(portfolio, { cash: 105.1, holdings: [{ instrumentId: 'i1', symbol: 'AAPL', instrumentName: 'Apple', quantity: 3, averageCost: 150.5 }] });
  assert.deepEqual(requests.map(([url, auth]) => [url, auth]).sort(), [['/api/v1/cash', undefined], ['/api/v1/holdings', undefined]]);
});

test("today's gain comes from each stock's change since the day's first quote (PS-06)", () => {
  // AAPL is up 5% today: 10 shares worth $2,100 now were worth $2,000 at the open.
  const valuation = valuePortfolio(
    { cash: 0, holdings: [holding('aapl', 10, 150), holding('msft', 1, 400)] },
    new Map([['aapl', 210], ['msft', 400]]),
    new Map([['aapl', 5], ['msft', 0]]),
  );
  assert.deepEqual(valuation.holdings.map(h => [h.dayGain, h.dayChangePercent]), [[100, 5], [0, 0]]);
  assert.equal(valuation.dayGain, 100);
  assert.equal(valuation.dayGainPercent, 4.17, '100 on the 2,400 the positions were worth at the open');
  assert.equal(dayGainOf(110, 10), 10);
  assert.equal(dayGainOf(110, 0), 0);
});

test('loading without a session fails with a readable message', async () => {
  await assert.rejects(new PortfolioClient({ accessToken: null }).load(), /Sign in to see your balances/);
});
