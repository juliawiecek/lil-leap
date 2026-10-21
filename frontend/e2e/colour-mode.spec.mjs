import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { auditTextContrast } from './colour-audit.mjs';

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade', 'PS-27 belongs to the NextTrade trading application.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} colour settings support pointer, keyboard, switch-style activation and restore before first paint`, async ({ page }) => {
    await colourFixture(page, tier);
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('app-root')) {
          globalThis.ps27FirstMode = document.documentElement.dataset.colourMode;
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: tier === 'NOVICE' ? 'Main navigation' : 'Advanced navigation' });
    await expect(nav).toBeVisible();
    if (tier === 'ADVANCED') {
      const review = page.getByRole('button', { name: 'Review Order', exact: true });
      await review.hover();
      await expect(review).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    }
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    const off = page.getByRole('radio', { name: 'Off', exact: true });
    const redGreen = page.getByRole('radio', { name: 'Red-green safe', exact: true });
    const blueYellow = page.getByRole('radio', { name: 'Blue-yellow safe', exact: true });
    await expect(off).toBeChecked();
    await redGreen.check();
    await expect(page.locator('html')).toHaveAttribute('data-colour-mode', 'red-green');
    await redGreen.focus();
    await page.keyboard.press('ArrowRight');
    await expect(blueYellow).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-colour-mode', 'blue-yellow');
    // A switch scanner activates the same native input with click or Space, without custom keys.
    await off.focus();
    await page.keyboard.press('Space');
    await expect(off).toBeChecked();
    await expect(off.locator('..')).toHaveCSS('outline-style', 'solid');
    await blueYellow.click();
    await expect(page.locator('html')).toHaveAttribute('data-colour-mode', 'blue-yellow');
    await page.reload();
    await expect(blueYellow).toBeChecked();
    expect(await page.evaluate(() => globalThis.ps27FirstMode)).toBe('blue-yellow');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nexttrade.accessibility')).colourMode)).toEqual({ mode: 'blue-yellow' });
    const audit = await auditTextContrast(page);
    expect(audit.failures).toEqual([]);
  });
}

test('palette changes recolour existing SVG paths, gradients and financial values without changing geometry', async ({ page }) => {
  await colourFixture(page);
  await page.goto('/dashboard');
  const chart = page.locator('app-portfolio-chart svg');
  const line = chart.locator('.line');
  await expect(line).toHaveAttribute('d', /^M/);
  const original = await line.getAttribute('d');
  const element = await line.elementHandle();
  const defaults = await line.evaluate(node => getComputedStyle(node).stroke);
  for (const mode of ['red-green', 'blue-yellow', 'off']) {
    await page.locator('html').evaluate((root, mode) => root.setAttribute('data-colour-mode', mode), mode);
    const expected = await chart.evaluate(node => getComputedStyle(node).getPropertyValue('--area-line').trim());
    const actual = await line.evaluate(node => getComputedStyle(node).stroke);
    expect(actual).toBeTruthy();
    expect(expected).toBeTruthy();
    if (mode === 'off') expect(actual).toBe(defaults);
    else expect(actual).not.toBe(defaults);
    const painted = await chart.evaluate(node => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      const paint = colour => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = colour; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data];
      };
      const stops = [...node.querySelectorAll('stop')];
      return { line: paint(getComputedStyle(node.querySelector('.line')).stroke), top: paint(getComputedStyle(stops[0]).stopColor), bottom: paint(getComputedStyle(stops[1]).stopColor) };
    });
    const colour = { off: [34, 197, 94], 'red-green': [131, 198, 255], 'blue-yellow': [105, 216, 173] }[mode];
    expect(painted.line).toEqual([...colour, 255]);
    painted.top.slice(0, 3).forEach((channel, index) => expect(Math.abs(channel - colour[index])).toBeLessThanOrEqual(1));
    expect(painted.top[3]).toBe(102);
    expect(painted.bottom[3]).toBe(0);
    expect(await element.evaluate(node => node.isConnected)).toBe(true);
    expect(await line.getAttribute('d')).toBe(original);
    expect(await chart.locator('.area').getAttribute('d')).toMatch(/^M/);
    expect(await chart.locator('stop').first().evaluate(node => getComputedStyle(node).stopColor)).not.toBe('');
    await expect(page.locator('.holdings-table')).toContainText('-');
    await expect(page.locator('.holdings-table')).toContainText('+');
  }
});

test('falling stock prices retain their label and switch the existing line to the selected loss palette', async ({ page }) => {
  await colourFixture(page, 'ADVANCED');
  await page.goto('/dashboard');
  const dashboard = page.locator('app-retail-stock-dashboard');
  await expect(dashboard.locator('.current-price')).toHaveText('$200.00', { timeout: 12000 });
  await page.getByLabel('Search symbols or companies').fill('MSFT');
  await page.locator('.search-results button').filter({ hasText: 'MSFT' }).click();
  await expect(dashboard.locator('.current-price')).toHaveText('$190.00', { timeout: 12000 });
  const chart = dashboard.locator('app-stock-svg-chart svg');
  await expect(chart).toHaveAttribute('data-performance', 'loss');
  await expect(chart).toHaveAttribute('aria-label', /Below session open/);
  const line = chart.locator('[data-line]');
  await expect(line).toHaveAttribute('d', /^M/);
  const original = await line.getAttribute('d');
  for (const [mode, colour] of [['red-green', 'rgb(255, 173, 112)'], ['blue-yellow', 'rgb(237, 131, 204)'], ['off', 'rgb(34, 197, 94)']]) {
    await page.locator('html').evaluate((root, mode) => root.setAttribute('data-colour-mode', mode), mode);
    await expect(line).toHaveCSS('stroke', colour);
    await expect(line).toHaveCSS('stroke-dasharray', mode === 'off' ? 'none' : '6px, 4px');
    await expect(line).toHaveAttribute('d', original);
  }
});

test('both safe modes retain contrast on the guided dashboard and order controls at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await colourFixture(page);
  await page.goto('/dashboard');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const mode of ['Red-green safe', 'Blue-yellow safe']) {
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: mode, exact: true }).check();
    await nav.getByRole('button', { name: 'Overview', exact: true }).click();
    const buy = page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true });
    await expect(buy).toBeVisible();
    await buy.hover();
    await expect(buy).toHaveCSS('background-color', mode === 'Red-green safe' ? 'rgb(191, 174, 253)' : 'rgb(211, 193, 250)');
    await buy.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#novice-shares').fill('1');
    await expect(page.getByRole('dialog')).toContainText('Buy');
    const audit = await auditTextContrast(page);
    expect(audit.failures).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  }
});
