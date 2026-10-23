import { identity, uuid } from './fixtures.mjs';

/** Stable demo data for palette screenshots and accessibility checks; no real orders are sent. */
export async function colourFixture(page, tier = 'NOVICE', { marketOpen = true } = {}) {
  await page.clock.setFixedTime(new Date(marketOpen ? '2026-10-21T15:30:00Z' : '2026-10-21T21:30:00Z'));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await identity(page, { project: { metadata: { role: 'TRADER', key: 'nexttrade.auth.session.v1' } } }, { tier });
  const stock = { instrumentId: uuid, symbol: 'AAPL', instrumentName: 'Apple Inc.', marketCode: 'NASDAQ', currency: 'USD', enabled: true, tradable: true, assetClass: 'COMMON_STOCK' };
  const second = { ...stock, instrumentId: '00000000-0000-4000-8000-000000000002', symbol: 'MSFT', instrumentName: 'Microsoft' };
  const quotes = [stock, second].map((instrument, i) => ({ ...instrument, bid: 200 - i * 10, ask: 200 - i * 10, midpoint: 200 - i * 10, quotedAt: '2026-10-21T15:30:00Z' }));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let json = [];
    if (path.endsWith('/accounts')) json = [{ account_id: uuid, account_name: 'Trading', account_status: 'ACTIVE', trading_enabled: true, trader_level: tier, created_at: '2026-10-19T12:00:00Z' }];
    else if (path.endsWith('/instruments')) json = [stock, second];
    else if (path.endsWith('/cash')) json = [{ balance: 4500 }];
    else if (path.endsWith('/holdings')) json = [{ ...stock, quantity: 2, averageCost: 195 }, { ...second, quantity: 1, averageCost: 200 }];
    else if (path.endsWith('/quotes/latest/by-instruments')) json = quotes;
    else if (path.endsWith('/quotes/latest/by-market-symbol')) json = quotes.find(quote => quote.symbol === url.searchParams.get('symbol')) ?? quotes[0];
    else if (path.includes('/quotes/latest/')) json = quotes.find(quote => path.endsWith(quote.instrumentId)) ?? quotes[0];
    else if (path.endsWith('/quotes/day-opens')) json = quotes.map((quote, i) => ({ ...quote, midpoint: i ? 200 : 195 }));
    else if (path.includes('/quotes/candles/')) json = Array.from({ length: 121 }, (_, i) => ({ time: new Date(Date.parse('2026-10-21T13:29:00Z') + i * 60000).toISOString(), open: 195, high: 202, low: 190, close: 200 + Math.sin(i / 7) * 2 }));
    else if (path.includes('/quotes/history/')) json = Array.from({ length: 121 }, (_, i) => ({ ...quotes[0], quotedAt: new Date(Date.parse('2026-10-21T13:30:00Z') + i * 60000).toISOString(), midpoint: 200 + Math.sin(i / 7) * 2 }));
    else if (path.endsWith('/market/status')) json = { open: marketOpen, exchangeTimeZone: 'America/New_York', nextOpen: '2026-10-22T13:30:00Z', nextClose: '2026-10-21T20:00:00Z' };
    else if (path.endsWith('/orders')) json = [
      { orderId: uuid, symbol: 'AAPL', side: 'BUY', quantity: 2, status: 'FILLED', submittedAt: '2026-10-21T14:00:00Z', filledAt: '2026-10-21T14:00:00Z', filledQuantity: 2, fillPrice: 195 },
      { orderId: second.instrumentId, symbol: 'MSFT', side: 'BUY', quantity: 1, status: 'FILLED', submittedAt: '2026-10-21T14:00:00Z', filledAt: '2026-10-21T14:00:00Z', filledQuantity: 1, fillPrice: 200 },
    ];
    // The complete test ledger must reconcile with every holding and the cash snapshot.
    else if (path.endsWith('/accounts/cash-activity')) json = [{ transactionId: uuid, accountId: uuid, type: 'DEPOSIT', amount: 5090, occurredAt: '2026-10-19T12:00:00Z' }];
    await route.fulfill({ json });
  });
}
