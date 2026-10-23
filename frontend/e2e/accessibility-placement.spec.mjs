import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { identity } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
});

test('login exposes the Accessibility button and its named dialog', async ({ page }) => {
  await page.goto('/login');
  const trigger = page.getByRole('button', { name: 'Accessibility', exact: true });
  await expect(trigger).toBeVisible(); await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Accessibility tools', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} accesses accessibility through Settings and restores the launcher after sign-out`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await colourFixture(page, tier); await page.goto('/dashboard');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('.assistive-launcher')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accessibility', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const preferences = page.locator('main app-assistive-settings');
    await expect(preferences.getByLabel('Speak on keyboard focus', { exact: true })).toBeVisible();
    await preferences.getByLabel('Enhanced focus highlighting', { exact: true }).check();
    await page.getByRole('button', { name: 'Portfolio', exact: true }).click();
    await expect(page.locator('.assistive-launcher')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-a11y-focus', '');
    await page.locator('main h1').focus(); await page.keyboard.press('Alt+Shift+a');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('dialog', { name: 'Accessibility tools', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Sign out/ }).last().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Accessibility', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const role of ['ANALYST', 'OPERATIONS']) {
  test(`Insights ${role} has accessibility in Settings without an in-app floating button`, async ({ page }, info) => {
    test.skip(info.project.name !== 'Insights');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().startsWith('ERROR')) errors.push(message.text()); });
    await identity(page, info, { role });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const json = path.endsWith('/clients') ? { content: [], page: 0, size: 25, totalPages: 0, totalElements: 0 }
        : path.endsWith('/summary') ? { date: '2026-10-22', fills: 0, orders: 0, accounts: 0, gross_executed_value: 0 } : [];
      await route.fulfill({ json });
    });
    await page.goto('/insights');
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('.assistive-launcher')).toHaveCount(0);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true, level: 1 })).toBeVisible();
    await page.getByLabel('Enhanced focus highlighting', { exact: true }).check();
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    await expect(page.locator('.assistive-launcher')).toHaveCount(0);
    await page.locator('main h1').focus(); await page.keyboard.press('Alt+Shift+a');
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByLabel('Enhanced focus highlighting', { exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Accessibility', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
