import { identity, uuid } from './fixtures.mjs';
export async function insightsFixture(page, info, operations = false) {
  await identity(page, info, { role: operations ? 'OPERATIONS' : 'ANALYST' });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const account = { accountId: uuid, accountNumber: 'NT-001', accountName: 'Trading', clientName: 'Test Client', email: 'client@example.test', traderLevel: 'NOVICE', status: 'ACTIVE', tradeCount: 1, tradedValue: 200, lastTradeAt: '2026-10-22T15:00:00Z' };
  const order = { orderId: uuid, filledAt: account.lastTradeAt, symbol: 'AAPL', side: 'BUY', quantity: 1, fillPrice: 200 };
  const paged = content => ({ content, page: 0, size: 25, totalPages: 1, totalElements: content.length });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path.endsWith('/orders-today')) json = { date: '2026-10-22', dayStart: '2026-10-22T05:00:00Z', orders: [] };
    else if (path.includes('activity-trend')) json = [{ hour: '09:00', tradeCount: 1 }, { hour: '10:00', tradeCount: 2 }];
    else if (path.includes('top-instruments')) json = [{ instrument: 'AAPL', tradeCount: 3 }];
    else if (path.endsWith('summary')) json = { date: '2026-10-22', fills: 3, orders: 3, accounts: 1, gross_executed_value: 600 };
    else if (path.endsWith('/orders')) json = paged([order]);
    else if (path.endsWith('/clients/' + uuid)) json = { account, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple', quantity: 1, averageCost: 200, costBasis: 200 }] };
    else if (path.endsWith('/clients')) json = paged([account]);
    else if (path.includes('/trades/')) json = { ...order, instrumentName: 'Apple', price: 200, value: 200, account, events: [] };
    await route.fulfill({ json });
  });
}
