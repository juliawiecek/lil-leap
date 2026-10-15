import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { AdvancedDashboard } = await import('../src/app/advanced-dashboard.ts');
const { NoviceDashboard } = await import('../src/app/novice-dashboard.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { PageState } = await import('../src/app/page-state.ts');
import { fakeFeed, feedProvider } from './feed-helper.mjs';

function workspace(t, Type) {
  let select, fields;
  const desk = component(t, Type, [
    { provide: AuthService, useValue: { accessToken: null } },
    feedProvider(fakeFeed(['AAPL', 'NVDA', 'MSFT'].map((symbol) => ({ symbol, price: 100 })))),
    {
      provide: PageState,
      useValue: {
        connect: (_page, _paths, query, callback) => {
          fields = query;
          select = callback;
          return {
            go: () => {
              /* Routing is observed in browser tests. */
            },
            destroy: () => {
              /* No subscriptions in this fixture. */
            },
          };
        },
      },
    },
  ]);
  return {
    desk,
    selectSymbol: (symbol) => {
      fields.find((field) => field.key === 'symbol').value.set(symbol);
      select([]);
    },
  };
}
test('advanced URL hydration selects the quote and initializes only a changed ticket', (t) => {
  const f = workspace(t, AdvancedDashboard);
  f.selectSymbol('NVDA');
  assert.equal(f.desk.selected().symbol, 'NVDA');
  assert.equal(f.desk.limitPrice(), f.desk.selected().price.toFixed(2));
  f.desk.limitPrice.set('900.00');
  f.selectSymbol('NVDA');
  assert.equal(f.desk.limitPrice(), '900.00');
  f.selectSymbol('UNKNOWN');
  assert.match(f.desk.message(), /unavailable/);
});
test('novice URL hydration selects a supported stock and reports an unavailable symbol', (t) => {
  const f = workspace(t, NoviceDashboard);
  f.selectSymbol('MSFT');
  assert.equal(f.desk.tradeQuote().symbol, 'MSFT');
  f.selectSymbol('UNKNOWN');
  assert.match(f.desk.tradeMessage(), /unavailable/);
});
// Shared HTTP pipeline and invalidation are exercised in http-auth.test.mjs.
