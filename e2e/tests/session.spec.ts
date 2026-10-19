import { test, expect, login, waitForServerExpiry, tradingUrl, insightsUrl } from './fixtures';

for (const [name, url] of [['NextTrade', tradingUrl], ['Insights', insightsUrl]]) {
  test(`${name}: guards block unauthenticated navigation; invalid login stays on login`, { tag: '@smoke' }, async ({ page }) => {
    await page.goto(`${url}/dashboard`);
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await expect(page.locator('app-trading-workspace, app-insights-workspace')).toHaveCount(0);
    const insights = name === 'Insights';
    await page.locator('#email').fill('unknown-e2e@example.com');
    await page.locator('#password').fill('Incorrect-password-9!');
    await page.getByRole('button', { name: insights ? 'Sign in' : 'Continue securely', exact: true }).click();
    await expect(page.locator(insights ? '[role="alert"]' : '.form-status')).toContainText('Invalid email or password, or sign-in is locked.');
    await expect(page).toHaveURL(url => url.pathname === '/login');
  });
}

test('AC2: idle real session rejects both access and refresh after server expiry', async ({ page, request, trader }) => {
  const tokens = await login(page, trader);
  const refreshes: string[] = [];
  page.on('request', r => { if (r.url().endsWith('/auth/refresh')) refreshes.push(r.url()); });
  await waitForServerExpiry(tokens.accessToken);
  expect(refreshes).toEqual([]);
  await expect(page).toHaveURL(url => url.pathname === '/login');
  expect((await request.get(`${tradingUrl}/api/v1/holdings`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  })).status()).toBe(401);
  expect((await request.post(`${tradingUrl}/auth/refresh`, { data: { refreshToken: tokens.refreshToken } })).status()).toBe(401);
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
});

for (const app of ['NextTrade', 'Insights']) {
  test(`AC3/AC4 ${app}: server-expired token produces a real 401 and login redirect`, async ({ page, trader, analyst }) => {
    const insights = app === 'Insights';
    // Freeze the browser's scheduled session checks; server time remains real.
    await page.clock.install();
    const tokens = await login(page, insights ? analyst : trader, insights);
    if (insights) await expect(page.getByTestId('summary-accounts')).not.toHaveText('?');
    else await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    // Pause just ahead of the browser's own clock; the runner's clock can trail it.
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1_000);
    await waitForServerExpiry(tokens.accessToken);
    const rejected = page.waitForResponse(r => r.url().includes('/api/v1/') && r.status() === 401);
    if (insights) await page.getByRole('button', { name: 'Refresh summary', exact: true }).click();
    else await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Activity', exact: true }).click();
    const response = await rejected;
    expect(response.request().headers().authorization).toBe(`Bearer ${tokens.accessToken}`);
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await expect(page.locator('app-trading-workspace, app-insights-workspace')).toHaveCount(0);
  });
}

test('Insights analyst sees the real reporting summary', { tag: '@smoke' }, async ({ page, analyst }) => {
  const summaryResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/reports/summary') && r.status() === 200);
  const tokens = await login(page, analyst, true);
  const response = await summaryResponse;
  expect(response.request().headers().authorization).toBe(`Bearer ${tokens.accessToken}`);
  const summary = await response.json();
  for (const key of ['accounts', 'orders', 'fills']) await expect(page.getByTestId(`summary-${key}`)).toHaveText(String(summary[key]));
  await expect(page.getByTestId('summary-value')).toHaveText(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(summary.gross_executed_value)));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/login');
});
