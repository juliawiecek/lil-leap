import { expect, test, type Page } from '@playwright/test';

const password = 'SyntheticPassword123!';
const email = () => `ts015-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;

async function reviewRegistration(page: Page, address: string, checkUnderage = false) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.locator('#full-name').fill('Test Client');
  await page.locator('#email').fill(address);
  await page.locator('#password').fill(password);
  await page.locator('#verify-password').fill(password);
  await page.locator('button.primary-action').click();
  await expect(page.locator('.profile-page')).toBeVisible();
  const dob = page.locator('#profile-date_of_birth');
  const today = new Date();
  const birthday18 = `${today.getFullYear() - 18}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await dob.fill(birthday18);
  await page.locator('#profile-phone').fill('5551234567');
  await page.locator('#profile-street_address').fill('1 Test Way');
  await page.locator('#profile-city').fill('Test City');
  await page.locator('#profile-state_province').fill('Texas');
  await page.locator('#profile-postal_code').fill('12345');
  await page.locator('#profile-country').fill('United States');
  await page.locator('#profile-citizenship_status').selectOption('PERMANENT_RESIDENT');
  await page.locator('#profile-ssn').fill('111223333');
  if (checkUnderage) {
    await page.locator('button[type=submit].continue-button').click();
    await expect(dob).toBeVisible();
    expect(await dob.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  }
  await dob.fill((await dob.getAttribute('max'))!);
  await page.locator('button[type=submit].continue-button').click();
  await expect(page.locator('#profile-heading')).toHaveText('Employment & finances');
  // Full KYC is optional at registration.
  await page.locator('button[type=submit].continue-button').click();
  await page.locator('#profile-trader_level').selectOption('NOVICE');
  await page.locator('button[type=submit].continue-button').click();
  await expect(page.locator('#profile-heading')).toHaveText('Review your details');
}

test('registers a 21-year-old, rejects bad credentials, and signs in on a return visit', async ({ page, request }) => {
  const address = email();
  await reviewRegistration(page, address, true);
  const registration = page.waitForResponse(response => response.url().endsWith('/api/v1/users') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const response = await registration;
  expect(response.status()).toBe(201);
  const body = response.request().postDataJSON();
  expect(body.citizenship_status).toBe('PERMANENT_RESIDENT');
  expect(body).not.toHaveProperty('risk_profile');
  const created = await response.json();
  expect(created).not.toHaveProperty('passwordHash');
  expect(created).not.toHaveProperty('ssn');
  await expect(page.locator('.form-status')).toHaveText('Account created. Sign in to continue.');
  await expect(page.locator('#password')).toHaveValue('');
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
  // Reload discards all browser memory: authentication must use persisted credentials.
  await page.reload();
  await page.locator('#email').fill(address);
  await page.locator('#password').fill('wrong-password');
  await page.locator('button.primary-action').click();
  await expect(page.locator('.form-status')).toHaveText('Invalid email or password.');
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
  await page.locator('#password').fill(password);
  const login = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login'));
  await page.locator('button.primary-action').click();
  const signedIn = await login;
  expect(signedIn.status()).toBe(200);
  const { token } = await signedIn.json();
  const me = await request.get('/api/v1/users/me', { headers: { Authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe(address);
  // The trading dashboard's fixed-position children don't give its host a bounding box.
  await expect(page.getByRole('button', { name: /Sign out/ }).first()).toBeVisible();
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  await page.getByRole('button', { name: /Sign out/ }).first().click();
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
  await expect(page.locator('#password')).toHaveValue('');
});

test('duplicate email stays on the review screen with a useful error', async ({ page, request }) => {
  const address = email();
  const response = await request.post('/api/v1/users', { data: {
    first_name: 'Test', last_name: 'Client', date_of_birth: '2000-01-01', email: address, password,
    phone: '5551234567', street_address: '1 Test Way', city: 'Test City', state_province: 'TX',
    postal_code: '12345', country: 'United States', citizenship_status: 'CITIZEN', ssn: '111223333',
    account_name: 'Trading', account_type: 'INDIVIDUAL_CASH', trader_level: 'NOVICE',
  }});
  expect(response.status()).toBe(201);
  await reviewRegistration(page, address);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.profile-status')).toContainText('already exists');
  await expect(page.locator('#profile-heading')).toHaveText('Review your details');
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
});

test('network failure preserves the form for retry and never opens a dashboard', async ({ page }) => {
  await reviewRegistration(page, email());
  await page.route('**/api/v1/users', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.profile-status')).toContainText('Unable to connect');
  await expect(page.locator('#profile-heading')).toHaveText('Review your details');
  await expect(page.locator('app-stock-dashboard')).toHaveCount(0);
  await page.unroute('**/api/v1/users');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('.form-status')).toHaveText('Account created. Sign in to continue.');
});
