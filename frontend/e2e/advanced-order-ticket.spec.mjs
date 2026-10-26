import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';

test('advanced order controls, review and account presets survive a fresh browser context', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  const saved = new Map();
  async function setup(target) {
    await colourFixture(target, 'ADVANCED');
    await target.route('**/orders/presets?*', async route => {
      const request = route.request();
      const query = new URL(request.url()).searchParams;
      const account = query.get('accountId');
      let presets = saved.get(account) ?? [];
      if (request.method() === 'PUT') {
        const preset = request.postDataJSON();
        presets = [...presets.filter(p => p.name !== preset.name), preset];
      } else if (request.method() === 'DELETE') presets = presets.filter(p => p.name !== query.get('name'));
      saved.set(account, presets);
      await route.fulfill({ json: presets });
    });
  }
  await setup(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dashboard');
  const panel = page.locator('app-advanced-ticket');
  await expect(panel.getByRole('button', { name: 'Limit', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Limit', exact: true }).click();
  await panel.locator('#pro-limit').fill('190');
  await panel.getByRole('button', { name: 'Take profit Off', exact: true }).click();
  await panel.locator('#pro-profit').fill('210');
  await panel.getByRole('button', { name: 'Stop loss Off', exact: true }).click();
  await panel.locator('#pro-stop').fill('180');
  await panel.locator('summary').filter({ hasText: 'Risk-based sizing' }).click();
  await panel.locator('#pro-risk-budget').fill('40');
  await panel.getByRole('button', { name: 'Apply share quantity' }).click();
  await expect(panel.locator('#pro-quantity')).toHaveValue('4');
  await panel.locator('summary').filter({ hasText: 'Saved order presets' }).click();
  await panel.locator('#pro-preset-name').fill('Swing');
  await panel.getByRole('button', { name: 'Save current settings' }).click();
  await expect(panel.locator('.preset-status')).toContainText('Saved Swing to your account');
  await panel.getByRole('button', { name: 'Review Order' }).click();
  const review = page.locator('dialog[aria-labelledby="pro-dialog-title"]');
  await expect(review).toBeVisible();
  await expect(review).toContainText('Buy / Limit');
  await expect(review).toContainText('$760.00');
  await expect(review).toContainText('$210.00');
  await review.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const box = await panel.locator('section').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    await panel.getByRole('button', { name: 'Review Order' }).click();
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Edit', exact: true }).click();
    await panel.locator('section').screenshot({ path: `test-results/advanced-order-ticket-${width}.png` });
  }
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await setup(other);
    await other.goto(new URL('/dashboard', page.url()).href);
    const restored = other.locator('app-advanced-ticket');
    await restored.locator('summary').filter({ hasText: 'Saved order presets' }).click();
    await restored.locator('.preset-apply').filter({ hasText: 'Swing' }).click();
    await expect(restored.locator('#pro-quantity')).toHaveValue('4');
    await expect(restored.locator('#pro-limit')).toHaveValue('200.00');
    await restored.getByRole('button', { name: 'Remove preset Swing' }).click();
    await expect(restored.locator('.preset-apply')).toHaveCount(0);
  } finally { await context.close(); }
  expect(errors).toEqual([]);
});
