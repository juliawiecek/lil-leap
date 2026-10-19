import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export const tradingUrl = process.env.TRADING_URL ?? 'http://localhost:4200';
export const insightsUrl = process.env.INSIGHTS_URL ?? 'http://localhost:4201';
export interface Credentials { email: string; password: string; ssn: string; }
export const test = base.extend<{ trader: Credentials; analyst: Credentials }>({
  trader: async ({ request }, use) => {
    const credentials = uniqueCredentials('trader');
    const response = await request.post(`${tradingUrl}/auth/register`, { data: traderPayload(credentials) });
    expect(response.status(), `Trader registration: ${await response.text()}`).toBe(201);
    await use(credentials);
  },
  analyst: async ({ request }, use) => {
    const credentials = uniqueCredentials('analyst');
    const response = await request.post(`${insightsUrl}/auth/register`, {
      // Identity and PostgreSQL limit employee IDs to 30 characters.
      data: { user_role: 'ANALYST', email: credentials.email, password: credentials.password, employee_id: randomUUID().slice(0, 30) },
    });
    expect(response.status(), `Analyst registration: ${await response.text()}`).toBe(201);
    await use(credentials);
  },
});
export { expect };

export function uniqueCredentials(role: string): Credentials {
  return { email: `e2e-${role}-${randomUUID()}@example.com`, password: 'E2e-Strong-Password-9!',
    ssn: String(randomInt(100000000, 999999999)) };
}
export function traderPayload(c: Credentials) {
  return {
    user_role: 'TRADER', email: c.email, password: c.password,
    first_name: 'Golden', last_name: 'Trader', date_of_birth: '1990-12-10', phone: '312-555-0123',
    street_address: '1 Main Street', city: 'Springfield', state_province: 'IL', postal_code: '62701',
    country: 'US', citizenship_status: 'CITIZEN', ssn: c.ssn, employment_status: 'RETIRED',
    annual_income: '50000', net_worth_bracket: '$25k-100k', risk_profile: 'MODERATE', liquidity_position: '25000', initial_deposit: '25000',
    accredited_investor: false, is_politically_exposed_person: false,
    account_name: 'Golden path account', account_type: 'INDIVIDUAL_CASH',
  };
}
export async function login(page: Page, credentials: Credentials, insights = false) {
  await page.goto(`${insights ? insightsUrl : tradingUrl}/login`);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.getByRole('button', { name: 'Continue securely', exact: true }).click();
  const loggedIn = await response;
  expect(loggedIn.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  return loggedIn.json();
}
export async function openRegistration(page: Page) {
  await page.goto(`${tradingUrl}/login`);
  await page.getByRole('tab', { name: 'Create account', exact: true }).click();
}

export async function fillCredentials(page: Page, credentials: Credentials) {
  await page.locator('#full-name').fill('Golden Trader');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('#verify-password').fill(credentials.password);
}

export async function prepareRegistration(page: Page, credentials: Credentials) {
  await openRegistration(page);
  await fillCredentials(page, credentials);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const fields = {
    first_name: 'Golden', last_name: 'Trader', date_of_birth: '1990-12-10', phone: '3125550123',
    street_address: '1 Main Street', city: 'Springfield', state_province: 'Illinois', postal_code: '62701',
    country: 'United States', ssn: credentials.ssn,
  };
  for (const [id, value] of Object.entries(fields)) await page.locator(`#profile-${id}`).fill(value);
  await page.locator('#profile-citizenship_status').selectOption('CITIZEN');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.locator('#profile-employment_status').selectOption('RETIRED');
  await page.locator('#profile-annual_income').fill('50000');
  await page.locator('#profile-net_worth_bracket').selectOption('$25k-100k');
  await page.locator('#profile-risk_profile').selectOption('MODERATE');
  await page.locator('#profile-liquidity_position').fill('25000');
  await page.locator('#profile-initial_deposit').fill('25000');
  await page.locator('#profile-accredited_investor').selectOption('false');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.locator('#profile-account_name').fill('Golden path account');
  await expect(page.locator('#profile-account_type')).toHaveValue('Individual cash');
  for (const id of ['is_politically_exposed_person', 'broker_affiliation', 'control_person', 'other_beneficial_owner']) {
    await page.locator(`#profile-${id}`).selectOption('false');
  }
  await page.getByRole('button', { name: /^Review details/ }).click();
}

export async function registerThroughBrowser(page: Page, credentials: Credentials) {
  await prepareRegistration(page, credentials);
  const registration = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
  const automaticLogin = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Explore my workspace/ }).click();
  expect((await registration).status()).toBe(201);
  expect((await automaticLogin).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Registration owns activation and the opening deposit; fixtures only read the result. */
export async function openedAccount(request: APIRequestContext, token: string) {
  const accounts = await authedGet(request, '/api/v1/accounts', token);
  expect(accounts).toHaveLength(1);
  expect(accounts[0].account_status).toBe('ACTIVE');
  expect(accounts[0].trading_enabled).toBe(true);
  const cash = await authedGet(request, '/api/v1/cash', token);
  expect(Number(cash.find(row => row.accountId === accounts[0].account_id).balance)).toBe(25000);
  return accounts[0].account_id;
}

/** Wait for the server's signed expiry using real elapsed time, never browser time. */
export async function waitForServerExpiry(token: string) {
  const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const remaining = exp * 1000 - Date.now() + 1500;
  expect(remaining).toBeLessThan(65_000);
  if (remaining > 0) await delay(remaining);
}
export async function authedGet(request: APIRequestContext, path: string, token: string) {
  const response = await request.get(`${tradingUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status()).toBe(200);
  return response.json();
}
