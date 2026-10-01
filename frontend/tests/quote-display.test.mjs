import assert from 'node:assert/strict';
import { test } from 'node:test';
import './component-helper.mjs';
import { of, throwError } from 'rxjs';
const { QuoteDisplayComponent } = await import('../src/app/quote-display.component.ts');

const apiQuote = {
  quoteId: 'q-1', instrumentId: 'i-1', symbol: 'AAPL', marketCode: 'NASDAQ',
  bid: '225.00', ask: '225.09', midpoint: '225.045', quotedAt: '2026-10-01T12:00:00Z',
  currency: 'USD', source: 'SYNTHETIC_GBM', synthetic: true,
};

function quoteService(responses) {
  const calls = [];
  return {
    calls,
    getLatestByInstrument(id) {
      calls.push(id);
      const next = responses.shift();
      return next instanceof Error ? throwError(() => next) : of(next);
    },
    normalizeQuote: quote => ({ ...quote, bid: Number(quote.bid), ask: Number(quote.ask), midpoint: Number(quote.midpoint) }),
  };
}

function display(t, service, instrumentId = 'i-1') {
  const component = new QuoteDisplayComponent(service);
  component.instrumentId = instrumentId;
  component.pollingIntervalMs = 60_000;
  t.after(() => component.ngOnDestroy());
  return component;
}

test('without an instrument id it shows an error and fetches nothing', t => {
  const service = quoteService([]);
  const component = display(t, service, '');
  component.ngOnInit();
  assert.equal(component.hasError, true);
  assert.equal(component.errorMessage, 'Instrument ID is required');
  assert.deepEqual(service.calls, []);
});

test('it fetches the latest quote straight away and stores it with numeric prices', t => {
  const service = quoteService([apiQuote]);
  const component = display(t, service);
  component.ngOnInit();
  assert.deepEqual(service.calls, ['i-1']);
  assert.equal(component.quote.symbol, 'AAPL');
  assert.equal(component.quote.midpoint, 225.045);
  assert.equal(component.isLoading, false);
  assert.equal(component.hasError, false);
});

test('a failed fetch shows the error, and retry clears it and fetches again', t => {
  const service = quoteService([new Error('No quote available'), apiQuote]);
  const component = display(t, service);
  component.ngOnInit();
  assert.equal(component.hasError, true);
  assert.equal(component.errorMessage, 'No quote available');

  component.retryFetch();
  assert.equal(component.hasError, false);
  assert.equal(component.quote.symbol, 'AAPL');
  assert.equal(service.calls.length, 2);
});

test('an error without a message falls back to a generic one', t => {
  const component = display(t, quoteService([new Error('')]));
  component.ngOnInit();
  assert.equal(component.errorMessage, 'Failed to fetch quote');
});
