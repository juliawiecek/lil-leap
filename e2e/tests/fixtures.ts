import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';

export const tradingUrl = process.env.TRADING_URL ?? 'http://localhost:4200';
export const insightsUrl = process.env.INSIGHTS_URL ?? 'http://localhost:4201';
export interface Credentials { email: string; password: string; ssn: string; }
export const test = base.extend<{ trader: Credentials; analyst: Credentials }>({
  trader: async ({ request }, use) => {
    const credentials = uniqueCredentials('trader');
    const response = await request.post(`${tradingUrl}/auth/register`, { data: traderPayload(credentials) });
    expect(response.status()).toBe(201);
    await use(credentials);
  },
  analyst: async ({ request }, use) => {
    const credentials = uniqueCredentials('analyst');
    const response = await request.post(`${insightsUrl}/auth/register`, {
      data: { user_role: 'ANALYST', email: credentials.email, password: credentials.password, employee_id: randomUUID() },
    });
    expect(response.status()).toBe(201);
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
    annual_income: '50000', net_worth_bracket: '$25k-100k', risk_profile: 'MODERATE', liquidity_position: '25000',
    accredited_investor: false, is_politically_exposed_person: false,
    account_name: 'Golden path account', account_type: 'INDIVIDUAL_CASH',
  };
}
export async function login(page: Page, credentials: Credentials, insights = false) {
  await page.goto(`${insights ? insightsUrl : tradingUrl}/login`);
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.locator(insights ? '#analyst-email' : '#email').fill(credentials.email);
  await page.locator(insights ? '#analyst-password' : '#password').fill(credentials.password);
  await page.getByRole('button', { name: insights ? 'Sign in' : 'Continue securely', exact: true }).click();
  const loggedIn = await response;
  expect(loggedIn.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  return loggedIn.json();
}
export async function registerThroughBrowser(page: Page, credentials: Credentials) {
  await page.goto(`${tradingUrl}/register`);
  await page.locator('#full-name').fill('Golden Trader');
  await page.locator('#email').fill(credentials.email);
  await page.locator('#password').fill(credentials.password);
  await page.locator('#verify-password').fill(credentials.password);
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
  await page.locator('#profile-accredited_investor').selectOption('false');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.locator('#profile-account_name').fill('Golden path account');
  await expect(page.locator('#profile-account_type')).toHaveValue('Individual cash');
  for (const id of ['is_politically_exposed_person', 'broker_affiliation', 'control_person', 'other_beneficial_owner']) {
    await page.locator(`#profile-${id}`).selectOption('false');
  }
  await page.getByRole('button', { name: /^Review details/ }).click();
  const registration = page.waitForResponse(r => r.url().endsWith('/auth/register') && r.request().method() === 'POST');
  const automaticLogin = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^Explore my workspace/ }).click();
  expect((await registration).status()).toBe(201);
  expect((await automaticLogin).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Approval/funding is fixture setup; no order, fill, or holding is written here. */
export async function fundAccount(email: string) {
  if (!email.startsWith('e2e-trader-')) throw new Error('Only suite-generated traders may be funded.');
  const db = new pg.Client();
  try {
    await db.connect();
    await db.query('BEGIN');
    const result = await db.query(`SELECT a.account_id, a.account_status, a.trader_level FROM accounts a
      JOIN users u USING (user_id) WHERE u.email = $1 FOR UPDATE OF a`, [email]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].account_status).toBe('PENDING');
    expect(result.rows[0].trader_level).toBe('NOVICE');
    const id = result.rows[0].account_id;
    await db.query("UPDATE accounts SET account_status = 'ACTIVE', trading_enabled = true WHERE account_id = $1", [id]);
    await db.query("INSERT INTO cash_transactions (account_id, transaction_type, amount, settlement_status, settled_at) VALUES ($1, 'DEPOSIT', 25000, 'SETTLED', now())", [id]);
    await db.query("INSERT INTO cash_balances (account_id, currency, balance) VALUES ($1, 'USD', 25000) ON CONFLICT (account_id, currency) DO UPDATE SET balance = 25000", [id]);
    await db.query('COMMIT');
    return id;
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await db.end(); }
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
