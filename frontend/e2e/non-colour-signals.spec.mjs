import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { contrast } from '../tests/colour-math.mjs';
const now = Date.parse('2026-10-21T15:30:00Z');
const modes = ['off', 'red-green', 'blue-yellow'];

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function mode(page, value) {
  await page.locator('html').evaluate((root, value) => root.setAttribute('data-colour-mode', value), value);
}
async function historical(page, reportedVolume = false) {
  await colourFixture(page, 'ADVANCED');
  // The actual API supplies OHLC without volume. A separate fixture verifies the optional
  // renderer contract for reported volume, without manufacturing it in application code.
  await page.route('**/api/**/quotes/candles/**', route => route.fulfill({ json: Array.from({ length: 250 }, (_, i) => {
    const close = i === 249 ? 200 : 200 + Math.sin(i / 11) * 2;
    const open = close + (Math.floor(i / 12) % 2 ? 2 : -2);
    return { time: new Date(now - (250 - i) * 300000).toISOString(), open, high: Math.max(open, close) + .5, low: Math.min(open, close) - .5, close, ...(reportedVolume ? { volume: 100 + i % 7 * 50 } : {}) };
  }) }));
  await page.goto('/dashboard');
  await page.locator('.historical-chart summary').click();
  const chart = page.locator('app-technical-chart');
  await expect(chart.locator('.candle-body').first()).toBeVisible();
  return chart;
}

test('financial changes and statuses keep their meaning in every palette and grayscale', async ({ page }, info) => {
  await colourFixture(page);
  await page.goto('/dashboard');
  await expect(page.locator('.holdings-table')).toContainText('MSFT');
  const allocation = page.locator('.allocation-panel');
  await allocation.getByRole('button', { name: 'Show as table', exact: true }).click();
  for (const value of modes) {
    await mode(page, value);
    const changes = page.locator('app-financial-change');
    const signals = await changes.evaluateAll(nodes => nodes.map(node => ({ direction: node.dataset.movement, visible: node.querySelector('[aria-hidden=true]').textContent, spoken: node.querySelector('.sr-only').textContent })));
    expect(signals.some(s => s.direction === 'up')).toBe(true);
    expect(signals.some(s => s.direction === 'down')).toBe(true);
    expect(signals.some(s => s.direction === 'flat')).toBe(true);
    for (const s of signals) {
      expect(s.visible).toMatch({ up: /^▲ \+/, down: /^▼ −/, flat: /^—/ }[s.direction]);
      expect(s.spoken).toMatch({ up: /^up /, down: /^down /, flat: /^unchanged/ }[s.direction]);
    }
    // The deliberate allocation simplification (bf0cf08) removed the old hatch overlay.
    // Meaning must still survive grayscale through labels, numeric shares and the exact table.
    await expect(allocation.getByRole('img')).toHaveAttribute('aria-label', 'Asset allocation');
    await expect(allocation.locator('#novice-allocation-summary')).toContainText('Stocks: $590.00, 12 percent');
    await expect(allocation.locator('#novice-allocation-summary')).toContainText('Cash: $4,500.00, 88 percent');
    await expect(allocation.locator('tbody tr').filter({ hasText: 'Stocks' })).toContainText('$590.00');
    await expect(allocation.locator('tbody tr').filter({ hasText: 'Stocks' })).toContainText('12%');
    await expect(allocation.locator('tbody tr').filter({ hasText: 'Cash' })).toContainText('$4,500.00');
    await expect(allocation.locator('tbody tr').filter({ hasText: 'Cash' })).toContainText('88%');
    await page.screenshot({ path: info.outputPath(`novice-${value}.png`), animations: 'disabled' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'achromatopsia' });
    await page.screenshot({ path: info.outputPath(`novice-${value}-grayscale.png`), animations: 'disabled' });
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
    await cdp.detach();
  }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.locator('app-status-badge').first()).toContainText('Filled');
  await expect(page.locator('app-status-badge [aria-hidden=true]').first()).toHaveText('✓');
  await expect(page.locator('app-market-ticker .badge')).toContainText('Open');
});

test('ticker update arrows reserve their width and honour reduced motion in all palettes', async ({ page }) => {
  await colourFixture(page);
  await page.clock.install({ time: new Date(now) });
  let price = 200;
  await page.route('**/api/**/quotes/latest/by-instruments?**', route => route.fulfill({ json: [{ instrumentId: '00000000-0000-4000-8000-000000000001', bid: price, ask: price, midpoint: price, quotedAt: new Date(now).toISOString() }] }));
  await page.goto('/dashboard');
  const slot = page.locator('app-market-ticker .tape ul').first().locator('.flash-cue').first();
  await expect(slot).toBeAttached();
  const width = (await slot.boundingBox()).width;
  price = 201;
  await page.clock.fastForward(5000);
  await expect(slot).toHaveText('▲');
  for (const value of modes) {
    await mode(page, value);
    await expect(slot).toHaveText('▲');
    expect((await slot.boundingBox()).width).toBe(width);
    await expect(slot).toHaveCSS('animation-name', 'none');
  }
  price = 199;
  await page.clock.fastForward(5000);
  await expect(slot).toHaveText('▼');
  expect((await slot.boundingBox()).width).toBe(width);
  await expect(page.locator('app-market-ticker .ticker')).toHaveAttribute('aria-live', 'off');
});

test('real OHLC candles and indicators remain identifiable under grayscale and three vision simulations', async ({ page }, info) => {
  const chart = await historical(page);
  await expect(chart).toContainText('Volume unavailable');
  await expect(chart).toContainText('VWAP');
  await expect(chart.locator('.indicator-line[data-indicator="VWAP"]')).toHaveCount(0);
  await expect(chart.locator('.indicator-line[data-indicator="EMA 50"]')).toBeVisible();
  await expect(chart.locator('.indicator-line[data-indicator="EMA 200"]')).toBeVisible();
  for (const value of modes) {
    await mode(page, value);
    await expect(chart.locator('.candle.up .candle-body').first()).toHaveCSS('fill', 'none');
    await expect(chart.locator('.candle.down .candle-body').first()).not.toHaveCSS('fill', 'none');
    await expect(chart.locator('.indicator-line[data-indicator="EMA 50"]')).toHaveCSS('stroke-dasharray', 'none');
    await expect(chart.locator('.indicator-line[data-indicator="EMA 200"]')).toHaveCSS('stroke-dasharray', '8px, 5px');
    await chart.screenshot({ path: info.outputPath(`advanced-${value}.png`) });
    const cdp = await page.context().newCDPSession(page);
    for (const deficiency of ['achromatopsia', 'protanopia', 'deuteranopia', 'tritanopia']) {
      await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: deficiency });
      await chart.screenshot({ path: info.outputPath(`advanced-${value}-${deficiency}.png`) });
    }
    await cdp.send('Emulation.setEmulatedVisionDeficiency', { type: 'none' });
    await cdp.detach();
  }
  const labels = async () => {
    const rects = await chart.locator('.indicator-label').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }).sort((a,b) => a.top-b.top));
    expect(rects.length).toBeGreaterThan(0);
    rects.forEach((r,i) => { if (i) expect(r.top).toBeGreaterThanOrEqual(rects[i-1].bottom); });
  };
  await labels();
  await chart.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await chart.getByRole('button', { name: 'Earlier', exact: true }).click();
  await labels();
  await page.setViewportSize({ width: 390, height: 844 });
  await labels();
  await chart.locator('.technical-plot').focus();
  await page.keyboard.press('End');
  await expect(chart.locator('.candle-detail')).toContainText('close');
  await page.keyboard.press('Escape');
  await expect(chart.locator('.candle-detail')).toHaveCount(0);
  await chart.screenshot({ path: info.outputPath('advanced-mobile.png') });
});

test('when volume is reported its bars use outlines/hatching and VWAP has a dotted named endpoint', async ({ page }) => {
  const chart = await historical(page, true);
  await expect(chart.locator('.volume-bar.up').first()).toHaveAttribute('fill', 'none');
  await expect(chart.locator('.volume-bar.down').first()).toHaveAttribute('fill', /^url\(#technical-/);
  await expect(chart.locator('.indicator-line[data-indicator="VWAP"]')).toHaveCSS('stroke-dasharray', '1px, 5px');
  await expect(chart.locator('.indicator-label[data-indicator="VWAP"]')).toContainText('VWAP');
});

test('forced colours retain chart semantics, allocation labels, controls and focus in all palettes', async ({ page }, info) => {
  const chart = await historical(page, true);
  await page.emulateMedia({ forcedColors: 'active' });
  const system = await page.evaluate(() => {
    const probe = document.createElement('span'); document.body.appendChild(probe);
    const read = value => { probe.style.color = value; return getComputedStyle(probe).color; };
    const colours = { canvas: read('Canvas'), ink: read('CanvasText'), focus: read('Highlight') }; probe.remove(); return colours;
  });
  expect(contrast(system.canvas, system.ink)).toBeGreaterThanOrEqual(4.5);
  for (const value of modes) {
    await mode(page, value);
    await expect(chart.locator('.candle.up .candle-body').first()).toHaveCSS('fill', system.canvas);
    await expect(chart.locator('.candle.down .candle-body').first()).toHaveCSS('fill', system.ink);
    await expect(chart.locator('.indicator-line').first()).toHaveCSS('stroke', system.ink);
    const zoom = chart.getByRole('button', { name: 'Zoom in', exact: true });
    await zoom.focus();
    await expect(zoom).toHaveCSS('outline-width', '3px');
    const outline = await zoom.evaluate(node => getComputedStyle(node).outlineColor);
    expect([system.focus, system.ink]).toContain(outline);
    expect(contrast(outline, system.canvas)).toBeGreaterThanOrEqual(3);
    await expect(zoom).toHaveCSS('border-style', 'solid');
  }
  await chart.screenshot({ path: info.outputPath('advanced-forced-colors.png') });
  await page.emulateMedia({ forcedColors: 'active', colorScheme: 'dark' });
  const darkInk = await chart.locator('.indicator-line').first().evaluate(node => getComputedStyle(node).stroke);
  const darkPaper = await chart.locator('.candle.up .candle-body').first().evaluate(node => getComputedStyle(node).fill);
  expect(contrast(darkInk, darkPaper)).toBeGreaterThanOrEqual(4.5);
  await expect(chart.locator('.candle.down .candle-body').first()).toHaveCSS('fill', darkInk);
  await chart.screenshot({ path: info.outputPath('advanced-forced-colors-dark.png') });
  const context = page.context(); await page.close();
  const novice = await context.newPage();
  await novice.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await colourFixture(novice);
  await novice.goto('/dashboard');
  const allocation = novice.locator('.allocation-panel');
  await expect(allocation.getByRole('img')).toHaveAttribute('aria-describedby', 'novice-allocation-summary');
  await expect(allocation.locator('.ring.stocks')).toHaveCSS('stroke', system.ink);
  await expect(allocation.locator('.allocation-track')).toHaveCSS('stroke', system.canvas);
  await allocation.getByRole('button', { name: 'Show as table', exact: true }).click();
  await expect(allocation.locator('tbody')).toContainText('Stocks');
  await expect(allocation.locator('tbody')).toContainText('Cash');
  await expect(allocation.locator('tbody')).toContainText('12%');
  await expect(allocation.locator('tbody')).toContainText('88%');
  await expect(novice.locator('.allocation-panel .asset-dot.stocks')).toHaveCSS('border-style', 'double');
  await expect(novice.locator('.allocation-panel .asset-dot.cash')).toHaveCSS('border-style', 'dashed');
  await novice.screenshot({ path: info.outputPath('novice-forced-colors.png') });
});

test('increased contrast strengthens borders and focus without changing the default layout', async ({ page }, info) => {
  await colourFixture(page); await page.goto('/dashboard');
  await expect(page.locator('.day-summary')).toContainText('MSFT');
  const panel = page.locator('.allocation-panel');
  const before = await panel.boundingBox(), border = await panel.evaluate(n => getComputedStyle(n).borderTopColor);
  await page.emulateMedia({ contrast: 'more' });
  const after = await panel.boundingBox();
  expect(after).toEqual(before);
  expect(await panel.evaluate(n => getComputedStyle(n).borderTopColor)).not.toBe(border);
  const buy = page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true });
  await buy.focus();
  await expect(buy).toHaveCSS('outline-width', '3px');
  await page.screenshot({ path: info.outputPath('novice-increased-contrast.png') });
});
