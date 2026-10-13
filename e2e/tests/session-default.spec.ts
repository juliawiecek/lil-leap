import { test, expect, login } from './fixtures';

for (const app of ['NextTrade', 'Insights']) {
  test(`${app}: default ten-minute client inactivity boundary`, async ({ page, trader, analyst }) => {
    await page.clock.install();
    const tokens = await login(page, app === 'Insights' ? analyst : trader, app === 'Insights');
    const claims = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBe(600);
    let refreshes = 0;
    page.on('request', r => { if (r.url().endsWith('/auth/refresh')) refreshes++; });
    // Fast-forward skips unnecessary rendering work but still fires scheduled checks.
    await page.clock.fastForward(599_000);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.clock.fastForward(16_000);
    await expect(page).toHaveURL(/\/login\?expired=1$/);
    await expect(page.locator('app-stock-dashboard, app-insights-chart')).toHaveCount(0);
    expect(refreshes).toBe(0);
  });
}
