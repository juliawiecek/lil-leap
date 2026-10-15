import { test, expect, uniqueCredentials, registerThroughBrowser, openedAccount, login, authedGet } from './fixtures';

test('AC1/AC4: register ? login ? real order fill ? holdings', async ({ page, request }) => {
  const credentials = uniqueCredentials('trader');
  await registerThroughBrowser(page, credentials);
  await page.getByRole('button', { name: /^Sign out/ }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  const tokens = await login(page, credentials);
  const accountId = await openedAccount(request, tokens.accessToken);
  expect(await authedGet(request, '/api/v1/holdings', tokens.accessToken)).toEqual([]);
  const cashBefore = await authedGet(request, '/api/v1/cash', tokens.accessToken);
  expect(Number(cashBefore.find(row => row.accountId === accountId).balance)).toBe(25000);

  await page.getByRole('button', { name: 'Buy', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Stock', { exact: true }).selectOption('AAPL');
  await dialog.getByLabel('Number of shares').fill('1');
  await dialog.getByRole('button', { name: 'Review buy', exact: true }).click();
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/v1/orders') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirm buy', exact: true }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  expect(response.request().headers().authorization).toBe(`Bearer ${tokens.accessToken}`);
  const order = await response.json();
  const claims = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString());
  let filled;
  await expect.poll(async () => {
    const history = await authedGet(request, `/api/v1/clients/${claims.sub}/orders`, tokens.accessToken);
    filled = history.find(row => row.orderId === order.orderId);
    return filled?.status;
  }, { timeout: 40_000, intervals: [500, 1000, 2000] }).toBe('FILLED');
  await expect(dialog.locator('output')).toContainText('Bought 1 AAPL', { timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Portfolio', exact: true }).click();
  const row = page.locator('.holdings-table tbody tr').filter({ hasText: 'AAPL' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(3)).toHaveText('1.000');
  const holdings = await authedGet(request, '/api/v1/holdings', tokens.accessToken);
  const holding = holdings.find(row => row.accountId === accountId && row.symbol === 'AAPL');
  expect(Number(holding.quantity)).toBe(1);
  expect(Number(holding.averageCost)).toBeCloseTo(Number(filled.fillPrice), 6);
  const cashAfter = await authedGet(request, '/api/v1/cash', tokens.accessToken);
  expect(Number(cashAfter.find(row => row.accountId === accountId).balance)).toBeCloseTo(25000 - Number(filled.fillPrice), 2);
});
