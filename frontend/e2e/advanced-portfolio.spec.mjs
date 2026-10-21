import { test, expect } from '@playwright/test';
import { advancedDesk } from './advanced-dashboard-fixture.mjs';

test('overall portfolio adds ranges, hover, privacy and account switching without removing stock tools', async ({ page }, info) => {
  test.skip(info.project.metadata.role !== 'TRADER');
  const { ticket, state } = await advancedDesk(page, info);
  const panel = page.getByRole('region', { name: 'Overall portfolio' });
  await expect(panel.locator('.value')).toContainText('$6,980.00');
  await expect(panel).toContainText('not investment return');
  for (const period of ['1D', '1W', '1M', '3M', '1Y', 'ALL']) {
    const button = panel.getByRole('button', { name: period, exact: true });
    await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('svg')).toBeVisible();
    await expect(panel.locator('path.line')).toHaveCSS('stroke-dasharray', 'none');
  }
  await panel.locator('svg').focus(); await panel.locator('svg').press('ArrowLeft');
  await expect(panel.locator('.cursor-time')).toBeVisible();
  await panel.locator('svg').press('Tab');
  await panel.getByRole('button', { name: 'Refresh portfolio chart' }).click();
  await expect(ticket).toBeVisible(); await expect(page.locator('app-advanced-chart')).toBeVisible();
  await ticket.locator('#pro-symbol').selectOption('MSFT');
  await expect(panel.locator('.value')).toContainText('$6,980.00');
  await page.getByRole('button', { name: 'Hide balances', exact: true }).click();
  await expect(panel).toContainText('Balances hidden'); await expect(panel.locator('svg')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show balances', exact: true }).click();
  await page.locator('.switcher-trigger').click(); await page.locator('.account-row', { hasText: 'Savings' }).click();
  await expect(panel.locator('.value')).toContainText('$1,000.00');
  await expect(panel).toContainText('Savings');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.screenshot({ path: info.outputPath('portfolio-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: info.outputPath('portfolio-mobile.png') });
  const endpoint = await panel.locator('path.line').evaluate(path => {
    const point = path.getPointAtLength(path.getTotalLength());
    const position = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
    const dot = path.closest('.chart').querySelector('.dot').getBoundingClientRect();
    return { x: Math.abs(position.x - (dot.left + dot.width / 2)), y: Math.abs(position.y - (dot.top + dot.height / 2)) };
  });
  expect(endpoint.x).toBeLessThan(1); expect(endpoint.y).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(state.errors).toEqual([]);
});
