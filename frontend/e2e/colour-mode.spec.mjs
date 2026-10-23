import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { auditTextContrast } from './colour-audit.mjs';

async function expectGradientFade(chart, colour, bottomColour = colour) {
  // Check pixels between the stops too: endpoint alpha checks miss a fade toward black.
  const samples = await chart.evaluate(async node => {
    const stops = [...node.querySelectorAll('linearGradient stop')];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="100">
      <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        ${stops.map(stop => `<stop offset="${stop.getAttribute('offset')}" stop-color="${getComputedStyle(stop).stopColor}"/>`).join('')}
      </linearGradient></defs><rect width="1" height="100" fill="url(#fade)"/></svg>`;
    const image = new Image();
    image.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 100;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return [25, 50, 75].map(y => ({ y, pixel: [...context.getImageData(0, y, 1, 1).data] }));
  });
  for (const { y, pixel } of samples) {
    // Preserve the intended palette colours through the fade, with the same
    // 40%-to-transparent opacity profile in every palette.
    colour.forEach((channel, index) => {
      const expected = channel + (bottomColour[index] - channel) * (y + 0.5) / 100;
      expect(Math.abs(pixel[index] - expected)).toBeLessThanOrEqual(6);
    });
    expect(Math.abs(pixel[3] - 102 * (1 - (y + 0.5) / 100))).toBeLessThanOrEqual(1);
  }
}

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
  const chart = page.locator('app-portfolio-chart svg[role="img"]');
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
    await expectGradientFade(chart, colour);
    expect(await element.evaluate(node => node.isConnected)).toBe(true);
    expect(await line.getAttribute('d')).toBe(original);
    expect(await chart.locator('.area').getAttribute('d')).toMatch(/^M/);
    expect(await chart.locator('stop').first().evaluate(node => getComputedStyle(node).stopColor)).not.toBe('');
    await expect(page.locator('.holdings-table')).toContainText('−');
    await expect(page.locator('.holdings-table')).toContainText('+');
  }
});

for (const marketOpen of [true, false]) {
  test(`falling stock prices retain their label and loss palette ${marketOpen ? 'during trading' : 'after market close'}`, async ({ page }) => {
    await colourFixture(page, 'ADVANCED', { marketOpen });
    await page.goto('/dashboard');
    const dashboard = page.locator('app-retail-stock-dashboard');
    await expect(dashboard.locator('.current-price')).toHaveText('$200.00', { timeout: 12000 });
    const chart = dashboard.locator('app-stock-svg-chart svg[role="img"]');
    const line = chart.locator('[data-line]');
    // AAPL opens at 195 and trades at 200, so the loaded history is a gain: green and solid.
    await expect(chart).toHaveAttribute('data-performance', 'gain');
    await expect(chart).toHaveAttribute('aria-label', /Above session open/);
    await expect(line).toHaveCSS('stroke', 'rgb(34, 197, 94)');
    await expect(line).toHaveCSS('stroke-dasharray', 'none');
    // MSFT opens at 200 and trades at 190, so selecting it must restyle the series as a loss.
    await page.getByLabel('Search symbols or companies').fill('MSFT');
    await page.locator('.search-results button').filter({ hasText: 'MSFT' }).click();
    await expect(dashboard.locator('.current-price')).toHaveText('$190.00', { timeout: 12000 });
    await expect(chart).toHaveAttribute('data-performance', 'loss');
    await expect(chart).toHaveAttribute('aria-label', /Below session open/);
    await expect(line).toHaveAttribute('d', /^M/);
    const original = await line.getAttribute('d');
    // A session loss is dashed and uses the palette's loss colour in every mode, Off included.
    for (const [mode, colour] of [['red-green', 'rgb(255, 173, 112)'], ['blue-yellow', 'rgb(237, 131, 204)'], ['off', 'rgb(239, 68, 68)']]) {
      await page.locator('html').evaluate((root, mode) => root.setAttribute('data-colour-mode', mode), mode);
      await expect(line).toHaveCSS('stroke', colour);
      await expect(line).toHaveCSS('stroke-dasharray', '6px, 4px');
      await expect(line).toHaveAttribute('d', original);
      await expectGradientFade(chart, colour.match(/\d+/g).map(Number), mode === 'off' ? [255, 122, 110] : undefined);
    }
  });
}

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} closed market labels match the loss colour in every palette`, async ({ page }) => {
    await colourFixture(page, tier, { marketOpen: false });
    await page.goto('/dashboard');
    const badges = page.locator(tier === 'ADVANCED'
      ? '.market-status.closed, app-market-ticker .badge.closed'
      : '.market-status > span.closed, app-market-ticker .badge.closed');
    await expect(badges).toHaveCount(tier === 'ADVANCED' ? 1 : 2);
    await expect(badges.first()).toContainText('Opens Thu 8:30 AM CT');
    for (const [mode, colour] of [['off', 'rgb(255, 122, 110)'], ['red-green', 'rgb(255, 173, 112)'], ['blue-yellow', 'rgb(237, 131, 204)']]) {
      await page.locator('html').evaluate((root, mode) => root.setAttribute('data-colour-mode', mode), mode);
      for (const badge of await badges.all()) {
        await expect(badge).toHaveCSS('color', colour);
        await expect(badge.locator('i')).toHaveCSS('background-color', colour);
      }
    }
    // Reload while closed: the labels and their colours must come from the new response too.
    await page.reload();
    await expect(badges).toHaveCount(tier === 'ADVANCED' ? 1 : 2);
    for (const badge of await badges.all()) await expect(badge).toHaveCSS('color', 'rgb(255, 122, 110)');
  });
}

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
    await expect(buy).toHaveCSS('background-image', /linear-gradient\(135deg/);
    await buy.hover();
    await expect(buy).toHaveCSS('background-image', /linear-gradient\(135deg/);
    await expect(buy).toHaveCSS('background-color', mode === 'Red-green safe' ? 'rgb(191, 174, 253)' : 'rgb(211, 193, 250)');
    await buy.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#novice-shares').fill('1');
    await expect(page.getByRole('dialog')).toContainText('Buy');
    const review = page.getByRole('dialog').getByRole('button', { name: 'Review buy', exact: true });
    await review.hover();
    await expect(review).toHaveCSS('background-image', /linear-gradient\(135deg/);
    const audit = await auditTextContrast(page);
    expect(audit.failures).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  }
});
