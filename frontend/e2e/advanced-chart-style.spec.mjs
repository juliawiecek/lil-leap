import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';

test('advanced line and candlesticks avoid visual gaps in sparse recorded quotes', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await colourFixture(page, 'ADVANCED');
  await page.route('**/quotes/history/**', route => route.fulfill({ json: Array.from({ length: 121 }, (_, i) => ({
    quotedAt: new Date(Date.parse('2026-10-21T13:30:00Z') + i * 60000).toISOString(),
    midpoint: 200 + Math.sin(i / 7) * 2,
  })).filter((_, i) => i < 45 || i > 85) }));
  await page.goto('/dashboard');
  const card = page.locator('app-retail-stock-dashboard');
  const line = card.locator('[data-line]');
  await expect(line).toHaveAttribute('d', /^M/, { timeout: 15000 });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await line.getAttribute('d')).match(/M/g)?.length).toBe(1);
    expect((await card.locator('[data-area]').getAttribute('d')).match(/Z/g)?.length).toBe(1);
    await card.screenshot({ path: `test-results/advanced-connected-line-${width}.png` });
  }
  await card.getByRole('button', { name: 'Candlesticks', exact: true }).click();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card.locator('.plot-caption')).toContainText('empty intervals skipped');
    await expect.poll(async () => card.locator('[data-candles]').evaluate(group => {
      const positions = [...group.querySelectorAll('path')].map(path => Number(path.getAttribute('d').match(/^M([^,]+)/)[1]));
      const gaps = positions.slice(1).map((x, i) => x - positions[i]);
      return Math.max(...gaps) / Math.min(...gaps);
    })).toBeLessThan(1.001);
    await card.locator('svg[role="img"]').focus(); await page.keyboard.press('Home');
    await expect(card.locator('.tooltip')).toContainText('9:30:00 AM EDT');
    await page.keyboard.press('End');
    await expect(card.locator('.tooltip')).toContainText('11:30:00 AM EDT');
    await page.keyboard.press('Escape');
    await card.screenshot({ path: `test-results/advanced-connected-candles-${width}.png` });
  }
});

for (const mode of ['off', 'red-green', 'blue-yellow']) {
  test(`advanced line and candlesticks work with the ${mode} palette`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await colourFixture(page, 'ADVANCED');
    await page.addInitScript(mode => document.documentElement.setAttribute('data-colour-mode', mode), mode);
    await page.route('**/quotes/history/**', route => route.fulfill({ json: Array.from({ length: 1000 }, (_, i) => ({
      quotedAt: new Date(Date.parse('2026-10-21T14:23:24Z') + i * 4000).toISOString(),
      midpoint: 198 + Math.sin(i / 90) * 1.5 + Math.sin(i * 1.7) * .4,
    })) }));
    await page.goto('/dashboard');
    // Apply after bootstrap too, matching an in-session settings change.
    await page.locator('html').evaluate((node, mode) => node.setAttribute('data-colour-mode', mode), mode);
    const card = page.locator('app-retail-stock-dashboard');
    const chart = card.locator('app-stock-svg-chart');
    await expect(chart.locator('[data-line]')).toHaveAttribute('d', /^M/, { timeout: 15000 });
    expect((await chart.locator('[data-line]').getAttribute('d')).split('C').length).toBeLessThan(103);
    await card.screenshot({ path: `test-results/advanced-line-${mode}.png` });
    const toggle = card.getByRole('button', { name: 'Candlesticks', exact: true });
    await toggle.focus(); await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('[data-line]')).toHaveAttribute('visibility', 'hidden');
    expect(await chart.locator('[data-candles] path').count()).toBeGreaterThan(10);
    const up = chart.locator('[data-candles] .up').first();
    const down = chart.locator('[data-candles] .down').first();
    await expect(up).toHaveAttribute('fill', 'var(--candle-hollow)');
    await expect(down).toHaveAttribute('fill', 'var(--candle-down)');
    const colors = await chart.evaluate(node => ({
      up: getComputedStyle(node.querySelector('[data-candles] .up')).stroke,
      down: getComputedStyle(node.querySelector('[data-candles] .down')).stroke,
    }));
    expect(colors.up).not.toBe(colors.down);
    await chart.locator('svg[role="img"]').focus(); await page.keyboard.press('Home');
    await expect(chart.locator('.tooltip')).toContainText(/O \$.*H \$.*L \$.*C \$/);
    await page.keyboard.press('Escape');
    await card.screenshot({ path: `test-results/advanced-candles-${mode}.png` });
    await chart.getByRole('button', { name: 'Show as table', exact: true }).click();
    await expect(chart.locator('thead')).toContainText('Open');
    await expect(chart.locator('thead')).toContainText('Close');
    await chart.getByRole('button', { name: 'Hide table', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toBeVisible();
    const box = await card.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await card.screenshot({ path: `test-results/advanced-candles-mobile-${mode}.png` });
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const forced = await chart.evaluate(node => ({
      hollow: getComputedStyle(node.querySelector('[data-candles] .up')).fill,
      filled: getComputedStyle(node.querySelector('[data-candles] .down')).fill,
    }));
    expect(forced.hollow).not.toBe(forced.filled);
    await card.getByRole('button', { name: 'Line', exact: true }).click();
    await expect(chart.locator('[data-line]')).toHaveAttribute('visibility', 'visible');
  });
}
