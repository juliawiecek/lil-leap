import {
  test, expect, uniqueCredentials, openRegistration, fillCredentials,
  prepareRegistration, registerThroughBrowser, openedAccount, login,
  tradingUrl, insightsUrl,
} from './fixtures';

test('NEXT-157 AC2/AC4: browser registration creates a funded account and permits a fresh login', async ({ page, request }) => {
  const credentials = uniqueCredentials('trader');
  await registerThroughBrowser(page, credentials);
  await page.getByRole('button', { name: /^Sign out/ }).first().click();
  await expect(page).toHaveURL(url => url.pathname === '/login');
  const tokens = await login(page, credentials);
  await openedAccount(request, tokens.accessToken);
});

for (const scenario of ['missing name', 'invalid email', 'weak password', 'password mismatch']) {
  test(`NEXT-157 AC2: registration rejects ${scenario} before sending a request`, async ({ page }) => {
    const registrations: string[] = [];
    page.on('request', r => { if (r.url().endsWith('/auth/register')) registrations.push(r.url()); });
    await openRegistration(page);
    await fillCredentials(page, uniqueCredentials('invalid'));
    if (scenario === 'missing name') await page.locator('#full-name').fill('');
    if (scenario === 'invalid email') await page.locator('#email').fill('invalid-email');
    if (scenario === 'weak password') {
      // Long enough to pass native minlength; violates the actual password rules.
      await page.locator('#password').fill('onlylowercaseletters');
      await page.locator('#verify-password').fill('onlylowercaseletters');
    }
    if (scenario === 'password mismatch') await page.locator('#verify-password').fill('Another-Password-9!');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    if (scenario === 'missing name' || scenario === 'invalid email') {
      const invalid = page.locator(scenario === 'missing name' ? '#full-name' : '#email');
      await expect(invalid).toBeFocused();
      expect(await invalid.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe('');
    } else {
      await expect(page.locator('.form-status')).toContainText(
        scenario === 'weak password' ? 'password requirements' : 'Passwords do not match');
    }
    await expect(page.locator('app-investor-profile')).toHaveCount(0);
    expect(registrations).toEqual([]);
  });
}

test('NEXT-157 AC2: incomplete profile cannot advance or register', async ({ page }) => {
  const registrations: string[] = [];
  page.on('request', r => { if (r.url().endsWith('/auth/register')) registrations.push(r.url()); });
  await openRegistration(page);
  await fillCredentials(page, uniqueCredentials('incomplete'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('button', { name: /^Continue/ }).click();
  const birthDate = page.locator('#profile-date_of_birth');
  await expect(birthDate).toBeVisible();
  expect(await birthDate.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe('');
  await expect(page.locator('#profile-initial_deposit')).toBeHidden();
  expect(registrations).toEqual([]);
});

test('NEXT-157 AC2/AC4: duplicate registration shows the real Identity rejection', async ({ page, trader }) => {
  await prepareRegistration(page, trader);
  const rejected = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Explore my workspace/ }).click();
  const response = await rejected;
  expect(response.status()).toBe(409);
  expect((await response.json()).error).toBe('USER_ALREADY_EXISTS');
  await expect(page.locator('.profile-status')).toContainText('already exists');
  await expect(page.locator('app-trading-workspace')).toHaveCount(0);
});

for (const app of ['NextTrade', 'Insights']) {
  const insights = app === 'Insights';
  const url = insights ? insightsUrl : tradingUrl;
  test(`NEXT-157 AC1/AC3/AC4 ${app}: valid credentials open the authenticated workspace`, { tag: '@smoke' }, async ({ page, trader, analyst }) => {
    const tokens = await login(page, insights ? analyst : trader, insights);
    expect(tokens.user.userRole).toBe(insights ? 'ANALYST' : 'TRADER');
    await expect(page.locator(insights ? 'app-insights-workspace' : 'app-trading-workspace')).toBeVisible();
    // Exercise real refresh rotation through the browser as well as the login exchange.
    const refreshed = page.waitForResponse(r => r.url().endsWith('/auth/refresh') && r.request().method() === 'POST');
    await page.reload();
    const response = await refreshed;
    expect(response.status()).toBe(200);
    const rotated = await response.json();
    expect(rotated.accessToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(insights ? 'app-insights-workspace' : 'app-trading-workspace')).toBeVisible();
  });

  for (const scenario of ['wrong password', 'unknown account']) {
    test(`NEXT-157 AC3/AC4 ${app}: ${scenario} receives a real 401 and stays signed out`, async ({ page, trader, analyst }) => {
      const credentials = scenario === 'unknown account' ? uniqueCredentials('unknown') : insights ? analyst : trader;
      await page.goto(`${url}/login`);
      await page.locator('#email').fill(credentials.email);
      await page.locator('#password').fill('Incorrect-password-9!');
      const rejected = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: insights ? 'Sign in' : 'Continue securely', exact: true }).click();
      const response = await rejected;
      expect(response.status()).toBe(401);
      expect((await response.json()).error).toBe('INVALID_CREDENTIALS');
      await expect(page.locator(insights ? '[role="alert"]' : '.form-status')).toContainText('Invalid email or password, or sign-in is locked.');
      await expect(page).toHaveURL(url => url.pathname === '/login');
      await expect(page.locator('app-trading-workspace, app-insights-workspace')).toHaveCount(0);
    });
  }
}
