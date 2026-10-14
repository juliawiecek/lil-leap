import { expect } from '@playwright/test';
export const uuid = '00000000-0000-4000-8000-000000000001';
function jwt(role, tier = 'ADVANCED') {
  const now = Math.floor(Date.now() / 1000);
  return 'test.' + Buffer.from(JSON.stringify({ sub: uuid, email: 'user@example.test', user_role: role,
    iat: now, exp: now + 600, trader_level: role === 'TRADER' ? tier : undefined })).toString('base64url') + '.test';
}
export async function identity(page, info, options = {}) {
  const { role, key } = info.project.metadata;
  const valid = new Set(['initial']); let serial = 0; const calls = [];
  await page.route('**/auth/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON(); calls.push(path);
    if (path.endsWith('/logout')) { valid.delete(body.refreshToken); return route.fulfill({ status: 204 }); }
    if (path.endsWith('/refresh')) {
      if (options.reject || !valid.delete(body.refreshToken)) return route.fulfill({ status: 401, json: { error: 'INVALID_REFRESH_TOKEN' } });
      if (options.delay) await options.delay;
    }
    const refreshToken = 'rotation-' + ++serial; valid.add(refreshToken);
    return route.fulfill({ json: { accessToken: jwt(options.role ?? role, options.tier ?? 'ADVANCED'), refreshToken,
      user: { id: uuid, email: 'user@example.test', userRole: options.role ?? role } } });
  });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()); let json = [];
    if (url.pathname.endsWith('/accounts')) json = [{ accountId: uuid, accountName: 'Test', accountStatus: 'ACTIVE', tradingEnabled: true }];
    if (url.pathname.endsWith('/instruments')) json = [{ instrumentId: uuid, symbol: 'AAPL', instrumentName: 'Apple', tradable: true, enabled: true }];
    if (url.pathname.endsWith('/cash')) json = [{ balance: 5000 }];
    if (url.pathname.includes('/quotes/')) json = { bid: 99, ask: 100, midpoint: 99.5, instrumentId: uuid, symbol: 'AAPL', quotedAt: new Date().toISOString() };
    if (url.pathname.endsWith('/orders')) json = [{ orderId: uuid, symbol: 'AAPL', side: 'BUY', quantity: 1, status: 'FILLED', submittedAt: new Date().toISOString(), fillPrice: 100, filledQuantity: 1 }];
    return route.fulfill({ json });
  });
  if (options.seed !== false) await page.addInitScript(({ key, age }) => {
    if (sessionStorage.getItem('test-seeded')) return;
    sessionStorage.setItem('test-seeded', '1');
    sessionStorage.setItem(key, JSON.stringify({ version: 1, refreshToken: 'initial', lastActivityAt: Date.now() - age }));
  }, { key, age: options.age ?? 0 });
  return { calls, key };
}
export const workspace = page => page.locator('app-trading-workspace, app-insights-workspace');
export async function ready(page) { await expect(workspace(page)).toBeVisible(); }
