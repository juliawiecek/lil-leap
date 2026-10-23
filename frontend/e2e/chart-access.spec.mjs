import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { identity } from './fixtures.mjs';

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

async function alternatives(page, image, access) {
  await expect(image).toHaveAttribute('role', 'img');
  await expect(image).toHaveAttribute('aria-label', /\S/);
  const id = await image.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
  const explain = access.getByRole('button', { name: 'Explain this chart', exact: true });
  await explain.click();
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  const tableId = await access.getByRole('button', { name: 'Show as table', exact: true }).getAttribute('aria-controls');
  const toggle = access.locator(`button[aria-controls="${tableId}"]`);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(access.locator('caption')).toHaveText(/data table/);
  expect(await access.locator('thead th[scope="col"]').count()).toBeGreaterThanOrEqual(2);
  await expect(access.locator('tbody th[scope="row"]').first()).toBeVisible();
  return page.locator(`[id="${id}"]`);
}

for (const side of ['Buy', 'Sell']) {
  test(`${side} chart shares portfolio controls, stock-specific alternatives and keyboard inspection`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade');
    await colourFixture(page);
    await page.goto('/dashboard');
    await page.locator('.trade-actions').getByRole('button', { name: side, exact: true }).click();
    const dialog = page.getByRole('dialog');
    const chart = dialog.locator('app-portfolio-chart');
    await expect(chart.locator('.line')).toHaveAttribute('d', /^M/);
    const image = chart.locator('svg[role="img"]');
    await expect(image).toHaveAttribute('aria-label', 'AAPL price chart');
    await dialog.screenshot({ path: `test-results/merge-${side.toLowerCase()}-chart.png` });
    const description = await alternatives(page, image, chart.locator('app-chart-access'));
    await expect(description).toContainText('AAPL price');
    await expect(chart.locator('caption')).toContainText('AAPL price');
    await image.focus(); await page.keyboard.press('ArrowRight');
    await expect(chart.locator('.cursor-time')).toBeVisible();
    await chart.getByRole('button', { name: '1W', exact: true }).click();
    await expect(chart.getByRole('button', { name: '1W', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('.coverage-flag')).toHaveCount(0);
    await expect(description).toContainText('Only part of the requested period has recorded values');
    await dialog.locator('#novice-stock').click();
    await dialog.getByRole('option').filter({ hasText: 'MSFT' }).click();
    await expect(image).toHaveAttribute('aria-label', 'MSFT price chart');
    await expect(description).toContainText('MSFT price');
    await expect(chart.locator('caption')).toContainText('MSFT price');
  });
}

test('novice portfolio and allocation expose real summaries, focus voice and equivalent tables', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page);
  await page.addInitScript(() => {
    localStorage.setItem('nexttrade.accessibility', JSON.stringify({ voice: { enabled: true } }));
    window.chartSpeech = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, speak(u) { window.chartSpeech.push(u.text); }, cancel() {} } });
  });
  await page.goto('/dashboard');
  const portfolio = page.locator('.portfolio-panel app-portfolio-chart');
  await expect(portfolio.locator('.line')).toHaveAttribute('d', /^M/);
  const description = await alternatives(page, portfolio.locator('svg[role="img"]'), portfolio.locator('app-chart-access'));
  await expect(description).toContainText('Low was');
  await portfolio.locator('svg[role="img"]').focus();
  await expect.poll(() => page.evaluate(() => window.chartSpeech.join(' '))).toContain('Portfolio value');
  const donut = page.locator('.allocation-donut');
  const allocation = page.locator('app-chart-access').filter({ has: page.locator('#novice-allocation-summary') });
  await alternatives(page, donut, allocation);
  await expect(allocation.locator('tbody')).toContainText('$590.00');
  await expect(allocation.locator('thead')).toContainText('Share of investments');
  await expect(allocation.locator('tfoot')).toContainText('$4,500.00');
  await expect(page.locator('.allocation-panel h2')).toHaveText('Allocation by sector');
  await expect(donut.locator('circle.ring.sector')).toHaveCount(1);
  await donut.focus();
  await expect.poll(() => page.evaluate(() => window.chartSpeech.join(' '))).toContain('Allocation by sector');
  await page.locator('.allocation-panel').getByRole('button', { name: 'View details' }).click();
  await expect(page.getByRole('dialog')).toContainText('By sector');
  await expect(page.getByRole('dialog')).toContainText('By asset class');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await portfolio.screenshot({ path: 'test-results/ps25-portfolio.png' });
  await page.locator('.allocation-panel').screenshot({ path: 'test-results/ps25-allocation.png' });
  const toggle = portfolio.locator('button[aria-controls$="-table"]');
  await toggle.click(); await expect(toggle).toBeFocused();
  await page.getByRole('button', { name: 'Hide portfolio balance', exact: true }).click();
  // The existing privacy control removes the whole portfolio plot; it must remove its
  // description and table as well. Allocation remains mounted and redacts its alternatives.
  await expect(portfolio).toHaveCount(0);
  await expect(allocation.locator('p').first()).toContainText('Amounts are hidden');
  await expect(allocation.locator('tbody')).not.toContainText('$');
});

test('advanced price, OHLC/indicators, exposure and real reported volume have alternatives', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'ADVANCED');
  await page.addInitScript(() => {
    localStorage.setItem('nexttrade.accessibility', JSON.stringify({ voice: { enabled: true } }));
    window.chartSpeech = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, speak(u) { window.chartSpeech.push(u.text); }, cancel() {} } });
  });
  await page.route('**/quotes/candles/**', route => route.fulfill({ json: Array.from({ length: 240 }, (_, i) => ({ time: new Date(Date.parse('2026-10-21T13:30:00Z') + i * 30000).toISOString(), open: 195, high: 202, low: 190, close: 198 + i / 120, volume: 10 + i })) }));
  await page.goto('/dashboard');
  const live = page.locator('app-stock-svg-chart');
  test.setTimeout(45000);
  await expect(live.locator('[data-line]')).toHaveAttribute('d', /^M/, { timeout: 12000 });
  await alternatives(page, live.locator('svg[role="img"]'), live.locator('app-chart-access'));
  await live.locator('svg[role="img"]').focus();
  await expect.poll(() => page.evaluate(() => window.chartSpeech.join(' '))).toContain('Apple one-day stock price');
  await page.getByText('Trade history and long-range chart', { exact: true }).click();
  const technical = page.locator('app-technical-chart');
  const priceAccess = technical.locator('app-chart-access').first();
  const priceSummary = await alternatives(page, technical.locator('.technical-plot'), priceAccess);
  await expect(priceSummary).toContainText('bought 2 shares');
  await expect(priceSummary).toContainText('above your average cost');
  await expect(priceAccess.locator('thead')).toContainText('EMA 50');
  await expect(priceAccess.locator('thead')).toContainText('VWAP');
  await expect(priceAccess.locator('tfoot')).toContainText('Average cost reference');
  await expect(priceAccess.locator('tfoot')).toContainText('$195.00');
  const volumeAccess = technical.locator('app-chart-access').filter({ has: page.locator('[id$="-volume-data-summary"]') });
  await alternatives(page, technical.locator('.volume-plot'), volumeAccess);
  await expect(volumeAccess.locator('tbody')).toContainText('shares');
  const displayedBars = await volumeAccess.locator('tbody tr').count();
  const everyObservation = volumeAccess.getByRole('button', { name: 'Show every observation', exact: true });
  await everyObservation.focus(); await page.keyboard.press('Enter');
  await expect(volumeAccess.locator('button[aria-pressed="true"]')).toBeFocused();
  const sourceObservations = await priceAccess.locator('tbody tr').count();
  await expect(volumeAccess.locator('tbody tr')).toHaveCount(sourceObservations);
  expect(displayedBars).toBeLessThan(sourceObservations);
  await expect(volumeAccess.locator('tbody')).toContainText('10 shares');
  const exposureAccess = page.locator('app-chart-access').filter({ has: page.locator('#advanced-exposure-summary') });
  await alternatives(page, page.locator('.split-bar'), exposureAccess);
  await technical.screenshot({ path: 'test-results/ps25-technical.png' });
  const before = await priceSummary.textContent();
  await page.locator('.chart-periods').getByRole('button', { name: '1W', exact: true }).click();
  await expect(priceSummary).not.toHaveText(before);
  await expect(priceSummary).toContainText('one week');
  await page.getByLabel('Search symbols or companies').fill('MSFT');
  await page.locator('.search-results button').filter({ hasText: 'MSFT' }).click();
  await expect(live.locator('svg[role="img"]')).toHaveAttribute('aria-label', /MSFT/, { timeout: 12000 });
  await expect(live.locator('app-chart-access p').first()).toContainText('MSFT');
  await expect(priceSummary).toContainText('MSFT');
});

test('missing volume is explained without invented values and all controls work in forced colours', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await colourFixture(page, 'ADVANCED');
  await page.goto('/dashboard');
  await page.getByText('Trade history and long-range chart', { exact: true }).click();
  const volume = page.locator('app-technical-chart app-chart-access').filter({ has: page.locator('[id$="-volume-data-summary"]') });
  await volume.getByRole('button', { name: 'Explain this chart', exact: true }).click();
  await expect(volume.locator('p').first()).toContainText('unavailable');
  const toggle = volume.locator('button[aria-controls$="-table"]');
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(volume.locator('tbody')).toContainText('Unavailable');
  await expect(volume.locator('tbody')).not.toContainText('0 shares');
});

test('sector bars and the interactive performance heat map expose the same current returns', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'ADVANCED');
  await page.route('**/api/**/instruments', route => route.fulfill({ json: [
    { instrumentId: '00000000-0000-4000-8000-000000000001', symbol: 'AAPL', instrumentName: 'Apple Inc.', marketCode: 'NASDAQ', currency: 'USD', sector: 'Technology', enabled: true, tradable: true },
    { instrumentId: '00000000-0000-4000-8000-000000000002', symbol: 'MSFT', instrumentName: 'Microsoft', marketCode: 'NASDAQ', currency: 'USD', sector: 'Technology', enabled: true, tradable: true },
  ] }));
  await page.goto('/dashboard');
  const sector = page.locator('app-chart-access').filter({ has: page.locator('#advanced-market-sectors-summary') });
  const sectorDescription = await alternatives(page, page.locator('.market-panel .sector-list'), sector);
  await expect(sectorDescription).toContainText('Technology');
  await expect(sectorDescription).toContainText('equally weighted');
  await expect(sector.locator('tbody')).toContainText('Technology');
  await page.locator('.list-tabs').getByRole('tab', { name: 'Sectors', exact: true }).click();
  await alternatives(page, page.locator('.watch-panel .sector-list'), page.locator('app-chart-access').filter({ has: page.locator('#advanced-watch-sectors-summary') }));
  const heat = page.locator('app-chart-access').filter({ has: page.locator('#advanced-heatmap-summary') });
  await heat.getByRole('button', { name: 'Explain this chart', exact: true }).click();
  await expect(heat.locator('p').first()).toContainText('AAPL');
  const tableId = await heat.getByRole('button', { name: 'Show as table', exact: true }).getAttribute('aria-controls');
  const toggle = heat.locator(`button[aria-controls="${tableId}"]`);
  await toggle.focus(); await page.keyboard.press('Space');
  await expect(toggle).toBeFocused();
  await expect(heat.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('.heat-map')).toHaveAttribute('role', 'group');
  await expect(page.locator('.heat-map [role="img"]').first()).toHaveAttribute('aria-describedby', 'advanced-heatmap-summary');
  await page.locator('.market-panel').screenshot({ path: 'test-results/ps25-market-overview.png' });
  await page.locator('.heat-map button').filter({ hasText: 'MSFT' }).click();
  await expect(page.locator('app-stock-svg-chart svg[role="img"]')).toHaveAttribute('aria-label', /MSFT/, { timeout: 12000 });
  await page.getByRole('navigation').getByRole('button', { name: 'Markets', exact: true }).click();
  await alternatives(page, page.locator('.market-panel .sector-list'), page.locator('app-chart-access').filter({ has: page.locator('#advanced-market-sectors-summary') }));
});

test('chart alternatives reflow at mobile width and the exact table scrolls within its card', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.setViewportSize({ width: 390, height: 844 });
  await colourFixture(page);
  await page.goto('/dashboard');
  const chart = page.locator('.portfolio-panel app-portfolio-chart');
  await expect(chart.locator('.line')).toHaveAttribute('d', /^M/);
  await alternatives(page, chart.locator('svg[role="img"]'), chart.locator('app-chart-access'));
  const scroll = chart.locator('.table-scroll');
  const box = await scroll.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await scroll.focus(); await expect(scroll).toBeFocused();
  await page.screenshot({ path: 'test-results/ps25-mobile.png' });
});

test('Insights activity chart describes its real counts and provides a labelled table and focus voice', async ({ page }, info) => {
  test.skip(info.project.name !== 'Insights');
  await identity(page, info);
  await page.addInitScript(() => {
    window.chartSpeech = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, speak(u) { window.chartSpeech.push(u.text); }, cancel() {} } });
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path.includes('activity')) json = [{ hour: '09:00', tradeCount: 3 }, { hour: '10:00', tradeCount: 6 }];
    else if (path.includes('top-instruments')) json = [{ instrument: 'AAPL', tradeCount: 6 }, { instrument: 'MSFT', tradeCount: 3 }];
    else if (path.includes('summary')) json = { date: '2026-10-21', fills: 9, orders: 9, accounts: 1, gross_executed_value: 100 };
    await route.fulfill({ json });
  });
  await page.goto('/insights');
  const chart = page.locator('app-insights-chart');
  await expect(chart.locator('svg[role="img"]')).toBeVisible();
  await alternatives(page, chart.locator('svg[role="img"]'), chart);
  await expect(chart.locator('tbody')).toContainText('3 trades');
  await expect(chart.locator('tbody')).toContainText('6 trades');
  const ranking = page.locator('app-insights-chart-access').filter({ has: page.locator('#insights-top-summary') });
  const rankingDescription = await alternatives(page, page.locator('.ranking-graphic'), ranking);
  await expect(rankingDescription).toContainText('AAPL has the most trades, 6');
  await expect(ranking.locator('tbody')).toContainText('50%');
  expect(await page.evaluate(() => window.chartSpeech.length)).toBe(0);
  await chart.getByRole('checkbox', { name: 'Read chart summaries aloud' }).check();
  await expect(ranking.getByRole('checkbox', { name: 'Read chart summaries aloud' })).toBeChecked();
  await page.locator('.ranking-graphic').focus();
  await expect.poll(() => page.evaluate(() => window.chartSpeech.join(' '))).toContain('AAPL has the most trades, 6');
  await chart.locator('svg[role="img"]').focus();
  await expect.poll(() => page.evaluate(() => window.chartSpeech.join(' '))).toContain('3 trades on 09:00');
  await page.keyboard.press('Home');
  await expect(chart.locator('.chart-readout')).toContainText('09:00');
  await page.keyboard.press('ArrowRight');
  await expect(chart.locator('.chart-readout')).toContainText('10:00');
  await page.keyboard.press('Escape');
  await expect(chart.locator('.chart-readout')).toContainText('arrow keys');
  await ranking.getByRole('checkbox', { name: 'Read chart summaries aloud' }).uncheck();
  const spoken = await page.evaluate(() => window.chartSpeech.length);
  await chart.locator('svg[role="img"]').focus();
  expect(await page.evaluate(() => window.chartSpeech.length)).toBe(spoken);
  await ranking.getByRole('checkbox', { name: 'Read chart summaries aloud' }).check();
  await page.reload();
  await expect(chart.getByRole('checkbox', { name: 'Read chart summaries aloud' })).toBeChecked();
});
