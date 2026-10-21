import { test, expect } from '@playwright/test';
import { advancedDesk } from './advanced-dashboard-fixture.mjs';

test('sidebar edge drags both ways, clamps, remembers width and supports keyboard', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER');
  await advancedDesk(page, info);
  const handle = page.getByRole('separator', { name: 'Resize sidebar' });
  const sidebar = page.locator('.pro-sidebar');
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toHaveCount(0);
  async function drag(delta) {
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 150);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + delta, box.y + 150, { steps: 10 }); await page.mouse.up();
  }
  await drag(80); await expect(handle).toHaveAttribute('aria-valuenow', '280');
  expect((await sidebar.boundingBox()).width).toBe(280);
  await drag(-180); await expect(handle).toHaveAttribute('aria-valuenow', '100');
  expect((await sidebar.boundingBox()).width).toBe(100);
  await expect(page.locator('.pro-shell')).toHaveClass(/collapsed/);
  await drag(500); await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await expect(page.locator('.pro-shell')).not.toHaveClass(/resizing-sidebar/);
  await page.reload(); await expect(handle).toHaveAttribute('aria-valuenow', '320');
  await handle.press('Home'); await expect(handle).toHaveAttribute('aria-valuenow', '64');
  await handle.press('ArrowRight'); await expect(handle).toHaveAttribute('aria-valuenow', '80');
  await handle.press('End'); await expect(handle).toHaveAttribute('aria-valuenow', '320');
  // Check the widths between fully expanded and icon-only, where footer labels used to overflow.
  for (const width of [200, 184, 180, 179, 160]) {
    await handle.press('Home');
    await drag(width - 64);
    await expect(handle).toHaveAttribute('aria-valuenow', String(width));
    const bounds = await sidebar.evaluate(el => {
      const edge = el.getBoundingClientRect().right;
      const label = el.querySelector('.sidebar-help button span');
      return { collapsed: el.parentElement.classList.contains('collapsed'), right: label.getBoundingClientRect().right, edge };
    });
    if (!bounds.collapsed) expect(bounds.right).toBeLessThanOrEqual(bounds.edge - 5);
  }
  await handle.press('Home');
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
