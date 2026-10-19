import { test, expect } from '@playwright/test';
import { identity, workspace, ready } from './fixtures.mjs';
test.beforeEach(async ({ page }) => { page.on('pageerror', error => console.log('Browser error:', error.message)); });
// Each app's own pages: NextTrade's dashboard views, and the Insights pages after TS-18.4.
const PAGES = { TRADER: ['/dashboard', '/orders', '/history', '/settings'], ANALYST: ['/insights', '/clients', '/reports'] };
const home = info => info.project.metadata.role === 'TRADER' ? '/dashboard' : '/insights';

for (const [role, path] of Object.entries(PAGES).flatMap(([role, paths]) => paths.map(path => [role, path]))) {
  test('reload keeps the signed-in page ' + path, async ({ page }, info) => {
    test.skip(info.project.metadata.role !== role);
    const { calls, key } = await identity(page, info);
    await page.goto(path); await ready(page);
    await expect(page).toHaveURL(new RegExp(path + '(?:\\?|$)'));
    const before = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).refreshToken, key);
    await page.reload(); await ready(page);
    await expect(page).toHaveURL(new RegExp(path + '(?:\\?|$)'));
    const after = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), key);
    expect(after.refreshToken).not.toBe(before);
    expect(Object.keys(after).sort()).toEqual(['lastActivityAt', 'refreshToken', 'version']);
    expect(calls.filter(path => path === '/auth/refresh')).toHaveLength(2);
  });
}

test('protected content and login stay hidden until restoration resolves', async ({ page }, info) => {
  let finish; const delay = new Promise(resolve => { finish = resolve; });
  const { calls } = await identity(page, info, { delay });
  await page.goto('/orders', { waitUntil: 'domcontentloaded' });
  const loader = page.getByRole('status', { name: 'Loading session' });
  const spinner = loader.locator('.startup-spinner');
  await expect(loader).toBeVisible();
  await expect(page.getByText('Restoring your session?')).toHaveCount(0);
  await expect(spinner).toHaveCSS('animation-name', 'startup-spin');
  await expect(page.locator('html')).toHaveCSS('background-color',
    info.project.metadata.role === 'TRADER' ? 'rgb(0, 0, 0)' : 'rgb(12, 16, 17)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(spinner).toHaveCSS('animation-name', 'none');
  await expect(workspace(page)).toHaveCount(0); await expect(page.locator('#email')).toHaveCount(0);
  finish(); await ready(page);
  await expect(loader).toHaveCount(0);
  expect(calls.filter(path => path === '/auth/refresh')).toHaveLength(1);
});

test('a rejected refresh opens login and preserves the destination', async ({ page }, info) => {
  const { key } = await identity(page, info, { reject: true });
  const destination = info.project.metadata.role === 'TRADER' ? '/orders?q=AAPL' : '/reports';
  await page.goto(destination); await expect(page.locator('#email')).toBeVisible();
  await expect(workspace(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe(destination);
  expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
  await page.locator('#email').fill('user@example.test'); await page.locator('#password').fill('example-password');
  await page.locator('form button[type=submit]').click();
  await ready(page); await expect(page).toHaveURL(url => url.pathname + url.search === destination);
});

test('a ten-minute idle session is not refreshed into a new session', async ({ page }, info) => {
  const { calls, key } = await identity(page, info, { age: 600001 });
  await page.goto('/settings'); await expect(page.locator('#email')).toBeVisible();
  expect(calls).not.toContain('/auth/refresh');
  expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
});

test('a restored nine-minute idle session still expires after the remaining minute', async ({ page }, info) => {
  await page.clock.install(); await identity(page, info, { age: 540000 });
  await page.goto('/settings'); await ready(page); await page.clock.fastForward(61000);
  await expect(page.locator('#email')).toBeVisible(); await expect(workspace(page)).toHaveCount(0);
});

test('history filters survive reload and browser navigation', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER', 'Insights pages have no URL filters since TS-18.4');
  await identity(page, info);
  const path = info.project.metadata.role === 'TRADER'
    ? '/history?from=2026-09-01&to=2026-09-22&status=FILLED'
    : '/history?start=2026-09-03&end=2026-09-21&asset=Equities&market=US&cadence=Weekly';
  await page.goto(path); await ready(page); const params = new URL(page.url()).search;
  if (info.project.metadata.role === 'TRADER') { await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-09-01'); await expect(page.getByLabel(/Status/)).toHaveValue('FILLED'); }
  else { await expect(page.getByLabel('Start date', { exact: true })).toHaveValue('2026-09-03'); await expect(page.getByLabel(/^Instrument class/)).toHaveValue('Equities'); }
  await page.reload(); await ready(page); expect(new URL(page.url()).search).toBe(params);
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page).toHaveURL(/\/settings/);
  await page.goBack(); await expect(page).toHaveURL(url => url.pathname === '/history' && url.search === params);
});

test('logout clears persistence and Back cannot reveal protected content', async ({ page }, info) => {
  const { key } = await identity(page, info); await page.goto(home(info)); await ready(page);
  if (info.project.metadata.role === 'TRADER') {
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page).toHaveURL(/\/settings/);
  } else {
    await page.getByRole('link', { name: 'Reports', exact: true }).click(); await expect(page).toHaveURL(/\/reports/);
  }
  await page.getByRole('button', { name: /sign out/i }).first().click(); await expect(page.locator('#email')).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull();
  await page.goBack(); await expect(workspace(page)).toHaveCount(0);
});

test('the other app role cannot access this workspace', async ({ page }, info) => {
  await identity(page, info, { role: info.project.metadata.role === 'TRADER' ? 'ANALYST' : 'TRADER' });
  await page.goto('/dashboard'); await expect(page.locator('#email')).toBeVisible(); await expect(workspace(page)).toHaveCount(0);
});

test('an operations trade lookup survives refresh', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'ANALYST'); await identity(page, info, { role: 'OPERATIONS' });
  const orderId = '3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f';
  await page.route('**/api/v1/trades/*/events', route => route.fulfill({ json: { orderId, auditRecorded: true, events: [
    { source: 'STATUS', type: 'FILLED', actor: null, occurredAt: '2026-10-19T14:03:00Z', details: { reasonCode: 'EXECUTION_SUCCESS' } },
  ] } }));
  await page.goto('/trades/' + orderId); await ready(page); const before = page.url();
  await page.reload(); await ready(page); expect(page.url()).toBe(before);
  await expect(page.getByRole('heading', { name: 'Trade lookup', exact: true })).toBeVisible();
  await expect(page.getByText(orderId, { exact: true })).toBeVisible();
});

test('a fresh tab has no recoverable session', async ({ page, context }, info) => {
  await identity(page, info); await page.goto('/dashboard'); await ready(page);
  const fresh = await context.newPage(); await fresh.goto('/settings');
  await expect(fresh.locator('#email')).toBeVisible(); await expect(workspace(fresh)).toHaveCount(0); await fresh.close();
});

test('a protected API 401 clears the session without replaying submissions', async ({ page }, info) => {
  const { key } = await identity(page, info); const methods = [];
  await page.route('**/api/**', route => { methods.push(route.request().method()); return route.fulfill({ status: 401, json: { error: 'UNAUTHORIZED' } }); });
  await page.goto('/orders');
  await expect(page.locator('#email')).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBeNull(); expect(methods).not.toContain('POST');
});

test('invalid view parameters safely fall back to existing defaults', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER', 'Insights pages have no URL filters since TS-18.4');
  await identity(page, info);
  const url = info.project.metadata.role === 'TRADER' ? '/history?from=2026-99-99&status=INVALID' : '/history?start=2026-99-99&asset=INVALID';
  await page.goto(url); await ready(page);
  await expect(page).toHaveURL(value => !value.searchParams.has('from') && !value.searchParams.has('start') && !value.searchParams.has('asset') && !value.searchParams.has('status'));
});


test('selected stock and chart period restore together', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER'); await identity(page, info);
  await page.goto('/dashboard?symbol=NVDA&period=1W'); await ready(page);
  await expect(page.locator('#pro-symbol')).toHaveValue('NVDA');
  await expect(page.locator('#pro-limit')).toHaveValue('893.12');
  await expect(page.locator('svg[aria-label="NVDA 1W candlestick chart"]')).toBeVisible();
  await page.locator('#pro-limit').fill('900.00');
  await page.getByRole('button', { name: '1M', exact: true }).click();
  await expect(page).toHaveURL(value => value.searchParams.get('period') === '1M');
  await expect(page.locator('#pro-limit')).toHaveValue('900.00');
  await page.reload(); await ready(page); await expect(page.locator('#pro-symbol')).toHaveValue('NVDA');
  await expect(page.locator('#pro-limit')).toHaveValue('893.12');
  await expect(page.locator('svg[aria-label="NVDA 1M candlestick chart"]')).toBeVisible();
});

test('Novice restoration mounts only the guided dashboard', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER'); await identity(page, info, { tier: 'NOVICE' });
  await page.goto('/orders'); await ready(page); await expect(page.locator('app-novice-dashboard')).toBeVisible();
  await expect(page.locator('app-advanced-dashboard')).toHaveCount(0);
  await page.reload(); await ready(page); await expect(page.locator('app-novice-dashboard')).toBeVisible();
});
