import { test, expect } from '@playwright/test';

for (const scenario of ['unknown account', 'wrong password']) {
  test(`sign-in reports ${scenario} independently of the hidden session-warning alert`, async ({ page }) => {
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('**/auth/login', route => route.fulfill({ status: 401, json: { error: 'INVALID_CREDENTIALS' } }));
    await page.goto('/dashboard');
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await page.locator('#email').fill(scenario === 'unknown account' ? 'unknown-e2e@example.com' : 'user@example.test');
    await page.locator('#password').fill('Incorrect-password-9!');
    const rejected = page.waitForResponse(response => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Continue securely', exact: true }).click();
    expect((await rejected).status()).toBe(401);
    // Closed dialog live regions remain in the DOM; they must not be mistaken for form errors.
    const warning = page.locator('lil-session-timeout-warning dialog');
    await expect(warning.locator('[role="alert"]')).toHaveCount(1);
    await expect(warning).not.toBeVisible();
    await expect(page.locator('form .form-status')).toHaveCount(1);
    await expect(page.locator('form .form-status'))
      .toContainText('Invalid email or password, or sign-in is locked.');
    await expect(page).toHaveURL(url => url.pathname === '/login');
    await expect(page.locator('app-trading-workspace, app-insights-workspace')).toHaveCount(0);
  });
}
