import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { insightsFixture } from './insights-fixtures.mjs';
import { uuid } from './fixtures.mjs';
test('Insights pages and allocation alternatives pass axe WCAG 2.2 AA', async ({ page }, info) => {
 test.skip(info.project.name !== 'Insights'); test.setTimeout(120000);
 await insightsFixture(page, info, true);
 for (const path of ['/insights', '/clients', '/clients/' + uuid, '/reports', '/trades', '/settings']) {
   await page.goto(path); await expect(page.locator('main h1')).toBeVisible();
   const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
   await info.attach(path.replaceAll('/', '-') + '-axe.json', { body: JSON.stringify(result.violations), contentType: 'application/json' });
   expect.soft(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), path).toEqual([]);
 }
 await page.goto('/clients/' + uuid);
 const allocation = page.locator('#client-allocation-table');
 await page.locator('app-insights-chart-access').getByRole('button', { name: 'Show as table', exact: true }).click();
 await expect(allocation).toContainText('AAPL');
});
for (const app of ['NextTrade', 'Insights']) {
 test(`${app} sign-in switch toggle and URL opt-in are usable`, async ({ page }, info) => {
  test.skip(info.project.name !== app);
  await page.goto('/login?switch=on'); await expect(page.locator('.scan-bar')).toBeVisible();
  await page.keyboard.press('Alt+s'); await expect(page.locator('.scan-bar')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Switch control Off', exact: true });
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scan-ring')).toHaveCSS('border-top-width', '4px');
 });
}
