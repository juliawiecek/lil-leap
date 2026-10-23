import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { colourFixture } from './colour-fixtures.mjs';
import { identity, uuid } from './fixtures.mjs';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// Reach controls using the real Tab order, including native modal containment.
async function tabTo(page, control) {
  await expect(control).toBeVisible();
  for (let i = 0; i < 100; i++) {
    if (await control.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Control could not be reached with Tab: ${await control.evaluate(el => el.outerHTML.slice(0, 300))}`);
}
async function activate(page, control) { await tabTo(page, control); await page.keyboard.press('Enter'); }
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('login uses native field errors, password privacy, tab order and explicit keyboard submission', async ({ page }, info) => {
  await identity(page, info, { seed: false, tier: 'NOVICE' });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/login');
  await activate(page, page.getByRole('button', { name: 'Continue securely', exact: true }));
  const email = page.getByLabel('Email address', { exact: true });
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toBeFocused();
  const errorId = await email.getAttribute('aria-describedby');
  await expect(page.locator(`[id="${errorId}"]`)).toContainText(/Email/);
  await page.keyboard.insertText('keyboard@example.test');
  await tabTo(page, page.getByLabel('Password', { exact: true }));
  await page.keyboard.insertText('only-a-mocked-password');
  await activate(page, page.getByRole('button', { name: 'Continue securely', exact: true }));
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('main h1')).toBeVisible();
});

for (const side of ['Buy', 'Sell']) {
  test(`novice ${side} requires review then explicit confirmation; rejection is accessible`, async ({ page }) => {
    await colourFixture(page); let submissions = 0;
    await page.route('**/api/v1/orders', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      submissions++;
      await route.fulfill({ status: 422, json: { message: 'This mock order was rejected. No trade was executed.' } });
    });
    await page.goto('/dashboard');
    const trigger = page.locator('.trade-actions').getByRole('button', { name: side, exact: true });
    await activate(page, trigger);
    const dialog = page.locator('dialog[open]');
    const shares = dialog.getByLabel('Number of shares');
    await tabTo(page, shares); await page.keyboard.insertText('1');
    await activate(page, dialog.getByRole('button', { name: `Review ${side.toLowerCase()}`, exact: true }));
    await expect(dialog.locator('.review-summary')).toBeFocused();
    expect(submissions).toBe(0);
    await activate(page, dialog.getByRole('button', { name: `Confirm ${side.toLowerCase()}`, exact: true }));
    await expect.poll(() => submissions).toBe(1);
    await expect(dialog.locator('output')).toContainText(/rejected/i);
    await expect(shares).toHaveAttribute('aria-describedby', /novice-trade-message/);
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  });
}

for (const side of ['Buy', 'Sell']) {
  test(`advanced ${side} can be reviewed and explicitly confirmed using Tab and Enter`, async ({ page }) => {
    await colourFixture(page, 'ADVANCED'); let submissions = 0;
    await page.route('**/api/v1/orders', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      submissions++; expect(route.request().postDataJSON().side).toBe(side.toUpperCase());
      await route.fulfill({ status: 422, json: { message: 'Mock order rejected. No trade was executed.' } });
    });
    await page.goto('/dashboard');
    await activate(page, page.locator('.side-switch').getByRole('button', { name: side, exact: true }));
    await tabTo(page, page.getByLabel('Quantity', { exact: true })); await page.keyboard.insertText('1');
    const review = page.getByRole('button', { name: 'Review Order', exact: true });
    await activate(page, review);
    const dialog = page.locator('dialog[open]');
    expect(submissions).toBe(0);
    await activate(page, dialog.getByRole('button', { name: `Confirm ${side}`, exact: true }));
    await expect.poll(() => submissions).toBe(1);
    await expect(page.locator('#pro-ticket-message')).toContainText(/rejected/i);
    await page.keyboard.press('Escape'); await expect(review).toBeFocused();
  });
}

test('transfers validate, focus the review step, require confirmation, announce results and restore focus', async ({ page }) => {
  await colourFixture(page); let transfers = 0;
  const secondId = '00000000-0000-4000-8000-000000000002';
  const accounts = [uuid, secondId].map((id, i) => ({ account_id: id, account_number: `NT0000000${i + 1}`, account_name: i ? 'Savings' : 'Trading', account_status: 'ACTIVE', trading_enabled: true, trader_level: 'NOVICE', available_cash: i ? 0 : 1000 }));
  await page.route('**/api/v1/accounts', route => route.fulfill({ json: accounts }));
  await page.route('**/api/v1/accounts/transfers', async route => {
    expect(route.request().postDataJSON().amount).toBe(25); transfers++;
    accounts[0].available_cash = 975; accounts[1].available_cash = 25;
    await route.fulfill({ json: { transferId: uuid, fromAccountId: uuid, toAccountId: secondId, amount: 25, fromBalance: 975, toBalance: 25, transferredAt: new Date().toISOString() } });
  });
  await page.goto('/dashboard');
  const trigger = page.locator('app-account-switcher .switcher-trigger');
  await activate(page, trigger);
  await activate(page, page.getByRole('button', { name: 'Transfer funds', exact: false }));
  const dialog = page.locator('app-account-switcher dialog[open]');
  const amount = dialog.getByLabel('Amount (USD)');
  await tabTo(page, amount); await page.keyboard.insertText('9999');
  await activate(page, dialog.getByRole('button', { name: 'Review transfer', exact: true }));
  await expect(dialog.getByRole('alert')).toContainText('more than the available cash');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await tabTo(page, amount); await page.keyboard.press('Control+a'); await page.keyboard.insertText('25');
  await activate(page, dialog.getByRole('button', { name: 'Review transfer', exact: true }));
  await expect(dialog.locator('.review-lines')).toBeFocused(); expect(transfers).toBe(0);
  await activate(page, dialog.getByRole('button', { name: 'Confirm transfer', exact: true }));
  await expect(dialog.getByRole('status')).toContainText('Moved $25.00');
  await expect(dialog.getByRole('status')).toBeFocused(); expect(transfers).toBe(1);
  await activate(page, dialog.getByRole('button', { name: 'Done', exact: true }));
  await expect(trigger).toBeFocused();
});

test('order cancellation is keyboard reachable, Keep restores focus, and only explicit confirmation sends a request', async ({ page }) => {
  await colourFixture(page); let cancelled = false, requests = 0;
  await page.route('**/api/v1/clients/**/orders**', route => route.fulfill({ json: [{ orderId: uuid, symbol: 'AAPL', side: 'BUY', quantity: 1, status: cancelled ? 'CANCELLED' : 'PENDING', submittedAt: '2026-10-21T14:00:00Z', filledQuantity: 0 }] }));
  await page.route(`**/api/v1/orders/${uuid}/cancel`, async route => { requests++; cancelled = true; await route.fulfill({ status: 204 }); });
  await page.goto('/activity');
  const feed = page.locator('app-activity-feed');
  const cancel = feed.getByRole('button', { name: 'Cancel', exact: true });
  await activate(page, cancel); await expect(feed.locator('.confirm')).toBeFocused(); expect(requests).toBe(0);
  await activate(page, feed.getByRole('button', { name: 'Keep', exact: true }));
  await expect(cancel).toBeFocused(); expect(requests).toBe(0);
  await activate(page, cancel);
  await activate(page, feed.getByRole('button', { name: 'Yes, cancel', exact: true }));
  await expect(feed.getByRole('status').first()).toContainText('Order cancelled');
  await expect(feed.locator('.notice')).toBeFocused(); expect(requests).toBe(1);
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} large text and spacing reflow on all routes and mobile navigation keeps its names`, async ({ page }, info) => {
    test.setTimeout(120000); await colourFixture(page, tier);
    await page.addInitScript(() => localStorage.setItem('nexttrade.accessibility', JSON.stringify({ visual: { textSize: 'extra-large', textSpacing: true, enhancedFocus: true } })));
    await page.setViewportSize({ width: 320, height: 900 });
    const routes = tier === 'NOVICE' ? ['dashboard','portfolio','activity','learn','settings'] : ['dashboard','portfolio','activity','markets','settings'];
    for (const path of routes) {
      await page.goto('/' + path); await expect(page.locator('main h1')).toBeVisible();
      const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth > innerWidth + 1, main: [...document.querySelectorAll('main')].some(main => main.clientWidth && main.scrollWidth > main.clientWidth + 1) }));
      expect.soft(overflow, `${tier}/${path} at 320px`).toEqual({ document: false, main: false });
      const result = await new AxeBuilder({ page }).withTags(tags).analyze();
      await info.attach(`${tier}-${path}-mobile.json`, { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
      expect.soft(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), `${tier}/${path}`).toEqual([]);
    }
    await page.screenshot({ path: `test-results/site-${tier.toLowerCase()}-320.png` });
  });
}
