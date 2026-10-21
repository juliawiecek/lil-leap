import { expect } from '@playwright/test';
import { identity, ready, uuid } from './fixtures.mjs';

export const secondId = '00000000-0000-4000-8000-000000000002';
export const account2 = '00000000-0000-4000-8000-000000000003';
export async function advancedDesk(page, info, options = {}) {
  await identity(page, info);
  const state = {
    status: 'PENDING', rejectSubmit: false, failCash: false, stale: false, open: true,
    posts: [], orders: [], transfers: [], errors: [], requests: [],
    accounts: [
      { account_id: uuid, account_number: '001', account_name: 'Trading', account_status: 'ACTIVE', trading_enabled: true, trader_level: 'ADVANCED', available_cash: 5000 },
      { account_id: account2, account_number: '002', account_name: 'Savings', account_status: 'ACTIVE', trading_enabled: true, trader_level: 'ADVANCED', available_cash: 1000 },
    ], ...options,
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    state.requests.push(path);
    const scope = url.searchParams.get('accountId') ?? uuid;
    const quote = { instrumentId: uuid, symbol: 'AAPL', bid: 99, ask: 101, midpoint: 100, quotedAt: new Date(Date.now() - (state.stale ? 120000 : 0)).toISOString() };
    const other = { ...quote, instrumentId: secondId, symbol: 'MSFT', bid: 199, ask: 201, midpoint: 200 };
    const now = new Date().toISOString();
    let json = [];
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      if (path.endsWith('/orders')) {
        state.posts.push(body);
        if (state.rejectSubmit) return route.fulfill({ status: 400, json: { message: 'Test rejection: insufficient cash.' } });
        const orderId = `10000000-0000-4000-8000-${String(state.posts.length).padStart(12, '0')}`;
        const instrument = body.instrumentId === uuid ? quote : other;
        const price = body.side === 'BUY' ? instrument.ask : instrument.bid;
        state.orders.unshift({ ...body, orderId, symbol: instrument.symbol, status: state.status, submittedAt: now,
          fillPrice: state.status === 'FILLED' ? price : null, filledQuantity: state.status === 'FILLED' ? body.quantity : null, filledAt: state.status === 'FILLED' ? now : null });
        return route.fulfill({ status: 201, json: { orderId, status: state.status, ...body } });
      }
      if (path.endsWith('/cancel')) {
        const order = state.orders.find(o => path.includes(o.orderId));
        if (order) order.status = 'CANCELLED';
        return route.fulfill({ json: { orderId: order?.orderId, status: 'CANCELLED' } });
      }
      if (path.endsWith('/accounts')) {
        const id = '00000000-0000-4000-8000-000000000004';
        state.accounts.push({ ...state.accounts[0], account_id: id, account_name: body.nickname, account_number: '004', available_cash: 0 });
        return route.fulfill({ status: 201, json: { accountId: id, accountNumber: '004', nickname: body.nickname, cashBalance: 0 } });
      }
      if (path.endsWith('/accounts/transfers')) {
        state.transfers.push(body);
        const from = state.accounts.find(a => a.account_id === body.fromAccountId), to = state.accounts.find(a => a.account_id === body.toAccountId);
        from.available_cash -= body.amount; to.available_cash += body.amount;
        return route.fulfill({ json: { ...body, transferId: uuid, fromBalance: from.available_cash, toBalance: to.available_cash, transferredAt: now } });
      }
      throw new Error(`Unexpected write: ${path}`);
    }
    if (path.endsWith('/accounts')) json = state.accounts;
    else if (path.endsWith('/instruments')) json = [
      { instrumentId: uuid, symbol: 'AAPL', instrumentName: 'Apple', sector: 'Technology', tradable: true, enabled: true },
      { instrumentId: secondId, symbol: 'MSFT', instrumentName: 'Microsoft', sector: 'Technology', tradable: true, enabled: true },
    ];
    else if (path.endsWith('/cash')) {
      if (state.failCash) return route.fulfill({ status: 503, json: {} });
      json = [{ balance: state.accounts.find(a => a.account_id === scope)?.available_cash ?? 0 }];
    }
    else if (path.endsWith('/holdings')) json = scope === uuid ? [{ instrumentId: uuid, symbol: 'AAPL', instrumentName: 'Apple', quantity: 20, averageCost: 90 }] : [];
    else if (path.endsWith('/quotes/latest/by-instruments')) json = [quote, other];
    else if (path.endsWith('/quotes/day-opens')) json = [{ ...quote, midpoint: 90 }, { ...other, midpoint: 210 }];
    else if (path.includes('/quotes/latest/by-instrument/')) json = path.endsWith(uuid) ? quote : other;
    else if (path.includes('/quotes/candles/')) json = Array.from({ length: 30 }, (_, n) => ({ time: new Date(Date.now() - (30 - n) * 60000).toISOString(), open: 90 + n / 3 + (n % 2 ? 0.5 : -0.5), high: 92 + n / 3, low: 88 + n / 3, close: 90 + n / 3 }));
    else if (path.includes('/quotes/history/')) json = [quote];
    else if (path.endsWith('/market/status')) json = { open: state.open, exchangeTimeZone: 'America/New_York', nextOpen: new Date(Date.now() + 3600000).toISOString(), nextClose: new Date(Date.now() + 7200000).toISOString() };
    else if (path.endsWith('/accounts/cash-activity')) json = [{ movementId: uuid, transactionId: uuid, accountId: scope, accountName: state.accounts.find(a => a.account_id === scope)?.account_name, type: 'DEPOSIT', transactionType: 'DEPOSIT', amount: scope === uuid ? 5000 : 1000, occurredAt: new Date(Date.now() - 86400000).toISOString(), settlementStatus: 'SETTLED' }];
    else if (path.endsWith('/orders')) json = state.orders.filter(o => o.accountId === scope);
    else if (path.endsWith('/status')) json = { status: state.status, reasonCode: 'PRICE_MOVED' };
    return route.fulfill({ json });
  });
  await page.goto('/dashboard'); await ready(page);
  const ticket = page.locator('app-advanced-ticket');
  await expect(ticket.locator('.quote-strip')).toContainText('$101.00');
  if (!state.failCash) await expect(page.locator('.summary-metrics')).toContainText('$5,000.00');
  return { state, ticket, nav: page.getByRole('navigation', { name: 'Advanced navigation' }), dialog: page.locator('dialog[aria-labelledby="pro-dialog-title"]') };
}
