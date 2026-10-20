import { randomUUID } from 'node:crypto';
import { test, expect, login, openedAccount, tradingUrl } from './fixtures';

// Seed client in reports/trades.csv, the dataset the Clients and Reports pages read.
const DEMO = { accountNumber: 'NT-DEMO-0001', name: 'Maya Chen', email: 'maya.chen@demo.nexttrade.local',
  orderId: 'f0000000-0000-4000-8000-000000000012' };

// TS-18.5: an analyst sees today's real Insights figures, then finds a client's orders in the reporting dataset.
test('analyst sees today\'s Insights figures and opens a client\'s orders', async ({ page, request, trader, analyst }) => {
  const traderLogin = await (await request.post(`${tradingUrl}/auth/login`, {
    data: { email: trader.email, password: trader.password },
  })).json();
  const headers = { Authorization: `Bearer ${traderLogin.accessToken}` };
  const accountId = await openedAccount(request, traderLogin.accessToken);
  const submitted = await request.post(`${tradingUrl}/api/v1/orders`, {
    headers, data: { accountId, symbol: 'AAPL', side: 'BUY', quantity: 1, orderType: 'MARKET', clientReference: randomUUID() },
  });
  expect(submitted.status()).toBe(201);
  const { orderId } = await submitted.json();
  const claims = JSON.parse(Buffer.from(traderLogin.accessToken.split('.')[1], 'base64url').toString());
  await expect.poll(async () => {
    const history = await (await request.get(`${tradingUrl}/api/v1/clients/${claims.sub}/orders`, { headers })).json();
    return history.find((row: { orderId: string }) => row.orderId === orderId)?.status;
  }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe('FILLED');

  const summary = page.waitForResponse(r => r.url().endsWith('/api/v1/reports/summary') && r.status() === 200);
  await login(page, analyst, true);
  const today = await (await summary).json();
  expect(today.fills).toBeGreaterThan(0);
  await expect(page.getByTestId('summary-fills')).toHaveText(new Intl.NumberFormat('en-US').format(today.fills));
  await expect(page.getByRole('table', { name: /Most traded stocks today/ })).toContainText('AAPL');

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByLabel('Search').fill(DEMO.email);
  const row = page.locator('tbody tr').filter({ hasText: DEMO.accountNumber });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(DEMO.name);
  await row.getByRole('link', { name: DEMO.accountNumber }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(DEMO.accountNumber);
  await expect(page.getByText(`${DEMO.name} · ${DEMO.email}`)).toBeVisible();
  await expect(page.getByRole('table', { name: /Stocks this account holds/ }).locator('tbody tr').first()).toBeVisible();
  await page.getByRole('tab', { name: /Orders/ }).click();
  const orders = page.getByRole('table', { name: /Orders for account/ });
  await page.getByLabel('Find an order').fill(DEMO.orderId);
  await expect(orders.locator(`[title="${DEMO.orderId}"]`)).toHaveCount(1);
  await expect(orders).toContainText('BAC');
  await expect(orders.getByRole('link')).toHaveCount(0);

  await page.getByRole('link', { name: '← All clients' }).click();
  await expect(page).toHaveURL(url => url.pathname === '/clients' && url.searchParams.get('search') === DEMO.email);
});
