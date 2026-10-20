import { test, expect } from '@playwright/test';
import { identity, ready, uuid } from './fixtures.mjs';

const stocks = [
  {
    instrumentId: 'a0000000-0000-4000-8000-000000000001',
    symbol: 'AAPL',
    instrumentName: 'Apple Inc.',
    marketCode: 'NASDAQ',
    currency: 'USD',
    sector: 'TECH',
    enabled: true,
    tradable: true,
    assetClass: 'EQUITY',
  },
  {
    instrumentId: 'a0000000-0000-4000-8000-000000000002',
    symbol: 'MSFT',
    instrumentName: 'Microsoft Corporation',
    marketCode: 'NASDAQ',
    currency: 'USD',
    sector: 'TECH',
    enabled: true,
    tradable: true,
    assetClass: 'EQUITY',
  },
];

async function market(page, tier) {
  const requests = [];
  const quote = (stock) => ({
    ...stock,
    quoteId: uuid,
    bid: stock.symbol === 'AAPL' ? 124.99 : 389.99,
    ask: stock.symbol === 'AAPL' ? 125.01 : 390.01,
    midpoint: stock.symbol === 'AAPL' ? 125 : 390,
    quotedAt: new Date().toISOString(),
    synthetic: true,
    source: 'TEST',
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let json = [];
    if (path.endsWith('/accounts'))
      json = [
        {
          account_id: uuid,
          account_number: '0001',
          account_name: 'Trading',
          account_status: 'ACTIVE',
          trader_level: tier,
          trading_enabled: true,
          created_at: new Date().toISOString(),
        },
      ];
    else if (path.endsWith('/instruments')) json = stocks;
    else if (path.endsWith('/cash')) json = [{ balance: 10000 }];
    else if (path.endsWith('/market/status'))
      json = {
        open: true,
        exchangeTimeZone: 'America/New_York',
        nextOpen: new Date().toISOString(),
        nextClose: new Date(Date.now() + 3600000).toISOString(),
      };
    else if (path.endsWith('/quotes/day-opens'))
      json = stocks.map((stock) => ({
        ...quote(stock),
        midpoint: stock.symbol === 'AAPL' ? 100 : 400,
        quotedAt: new Date().toISOString(),
      }));
    else if (path.endsWith('/quotes/latest/by-instruments')) json = stocks.map(quote);
    else if (path.endsWith('/quotes/latest/by-market-symbol')) {
      const stock = stocks.find((row) => row.symbol === url.searchParams.get('symbol'));
      requests.push({
        symbol: stock?.symbol,
        authorized: !!route.request().headers()['authorization'],
      });
      json = quote(stock ?? stocks[0]);
    } else if (path.includes('/quotes/history/')) {
      const stock = stocks.find((row) => path.endsWith(row.instrumentId)) ?? stocks[0];
      json = Array.from({ length: 120 }, (_, i) => ({
        ...quote(stock),
        midpoint: quote(stock).midpoint + Math.sin(i / 10),
        quotedAt: new Date(Date.now() - i * 5000).toISOString(),
      }));
    } else if (path.includes('/quotes/latest/by-instrument/'))
      json = quote(stocks.find((row) => path.endsWith(row.instrumentId)) ?? stocks[0]);
    await route.fulfill({ json });
  });
  return requests;
}

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(tier === 'NOVICE' ? 'novice overview keeps the portfolio chart without the stock explorer' : 'advanced overview switches the backend stock stream', async ({
    page,
  }, info) => {
    test.setTimeout(45000);
    test.skip(info.project.metadata.role !== 'TRADER');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await identity(page, info, { tier });
    const requests = await market(page, tier);
    await page.goto('/dashboard');
    await ready(page);
    if (tier === 'NOVICE') {
      await expect(page.getByRole('region', { name:'Explore a stock', exact:true })).toHaveCount(0);
      await expect(page.locator('app-retail-stock-dashboard')).toHaveCount(0);
      await expect(page.locator('app-portfolio-chart')).toBeVisible();
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
      return;
    }
    const dashboard = page.locator('app-retail-stock-dashboard');
    await expect(dashboard).toHaveCount(1);
    await expect(dashboard.getByRole('heading', { name: 'AAPL', exact: true })).toBeVisible({
      timeout: 12000,
    });
    await expect(dashboard.locator('.current-price')).toHaveText('$125.00');
    await expect(dashboard.locator('.current-price')).toHaveCSS('color', 'rgb(34, 197, 94)');
    const oldRequests = requests.filter((row) => row.symbol === 'AAPL').length;
    await page.getByLabel('Search symbols or companies').fill('MSFT');
    await page.locator('.search-results button').filter({ hasText: 'MSFT' }).click();
    await expect(dashboard.getByRole('heading', { name: 'MSFT', exact: true })).toBeVisible({
      timeout: 12000,
    });
    await expect(dashboard.locator('.current-price')).toHaveText('$390.00');
    await expect(dashboard.locator('.current-price')).toHaveCSS('color', 'rgb(239, 68, 68)');
    expect(requests.filter((row) => row.symbol === 'AAPL')).toHaveLength(oldRequests);
    expect(requests.every((row) => row.authorized)).toBe(true);
    await expect(dashboard.locator('app-stock-svg-chart [data-line]')).toHaveAttribute(
      'stroke',
      '#22c55e',
    );
    await expect(dashboard.locator('app-stock-svg-chart [data-line]')).toHaveAttribute(
      'stroke-width',
      '2',
    );
    await expect(dashboard.locator('app-stock-svg-chart stop').first()).toHaveAttribute(
      'stop-color',
      'rgba(34, 197, 94, 0.4)',
    );
    await expect(dashboard.locator('app-stock-svg-chart stop').last()).toHaveAttribute(
      'stop-color',
      'rgba(34, 197, 94, 0.0)',
    );
    expect(await dashboard.locator('canvas').count()).toBe(0);
    const chart = dashboard.locator('app-stock-svg-chart svg');
    await chart.focus();
    await page.keyboard.press('Home');
    await expect(dashboard.locator('.tooltip')).toBeVisible();
    const inspectedPath = await chart.locator('[data-line]').getAttribute('d');
    const gradientBefore = await chart
      .locator('linearGradient')
      .evaluate((element) => ({
        id: element.id,
        top: element.getAttribute('y1'),
        bottom: element.getAttribute('y2'),
      }));
    await page.waitForTimeout(5500);
    await expect(chart.locator('[data-line]')).toHaveAttribute('d', inspectedPath);
    expect(await chart.locator('linearGradient').getAttribute('gradientUnits')).toBe(
      'userSpaceOnUse',
    );
    expect(
      await chart
        .locator('linearGradient')
        .evaluate((element) => ({
          id: element.id,
          top: element.getAttribute('y1'),
          bottom: element.getAttribute('y2'),
        })),
    ).toEqual(gradientBefore);
    await page.keyboard.press('Escape');
    await expect(dashboard.locator('.tooltip')).toBeHidden();
    if (tier === 'ADVANCED') {
      await page.locator('.historical-chart summary').click();
      await expect(
        page.getByRole('region', { name: 'Stock price chart', exact: true }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(chart).toBeVisible();
    expect((await chart.boundingBox()).width).toBeGreaterThan(300);
    await page.setViewportSize({ width: 390, height: 844 });
    await dashboard.scrollIntoViewIfNeeded();
    await expect(dashboard.locator('app-stock-svg-chart [data-line]')).toHaveAttribute('d', /^M/);
    await chart.dispatchEvent('pointerdown', { clientX: 150, pointerType: 'touch', pointerId: 1 });
    await expect(dashboard.locator('.tooltip')).toBeVisible();
    await chart.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1 });
    await expect(dashboard.locator('.tooltip')).toBeHidden();
    await dashboard.screenshot({
      path: info.outputPath(`${tier.toLowerCase()}-stock-dashboard.png`),
    });
    expect(errors).toEqual([]);
  });
}

test('portfolio day chart keeps its whole line connected to the endpoint on load, updates and resize', async ({
  page,
}, info) => {
  test.skip(info.project.metadata.role !== 'TRADER');
  const now = Date.parse('2026-10-20T17:00:00Z');
  await page.clock.install({ time: new Date(now) });
  await identity(page, info, { tier: 'NOVICE' });
  await market(page, 'NOVICE');
  let bid = 100;
  const stock = stocks[0];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json;
    if (path.endsWith('/accounts'))
      json = [
        {
          account_id: uuid,
          account_number: '0001',
          account_name: 'Trading',
          account_status: 'ACTIVE',
          trader_level: 'NOVICE',
          trading_enabled: true,
          created_at: new Date(now - 86400000).toISOString(),
        },
      ];
    else if (path.endsWith('/accounts/cash-activity'))
      json = [
        {
          transactionId: uuid,
          accountId: uuid,
          accountName: 'Trading',
          type: 'DEPOSIT',
          amount: 5000,
          settlementStatus: 'SETTLED',
          occurredAt: new Date(now - 5 * 3600000).toISOString(),
        },
      ];
    else if (path.endsWith('/cash')) json = [{ balance: 4500 }];
    else if (path.endsWith('/holdings')) json = [{ ...stock, quantity: 5, averageCost: 100 }];
    else if (path.includes('/clients/') && path.endsWith('/orders'))
      json = [
        {
          orderId: uuid,
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 5,
          status: 'FILLED',
          submittedAt: new Date(now - 4 * 3600000).toISOString(),
          filledAt: new Date(now - 4 * 3600000).toISOString(),
          fillPrice: 100,
          filledQuantity: 5,
        },
      ];
    else if (path.includes('/quotes/candles/'))
      json = Array.from({ length: 211 }, (_, i) => ({
        time: new Date(now - (211 - i) * 60000).toISOString(),
        close: 100 + Math.sin(i * 0.7) * 0.6 + Math.sin(i * 0.13) * 0.4,
      }));
    else if (path.includes('/quotes/latest/')) {
      const quote = {
        ...stock,
        quoteId: uuid,
        bid,
        ask: bid,
        midpoint: bid,
        quotedAt: new Date(now).toISOString(),
        synthetic: true,
        source: 'TEST',
      };
      json = path.endsWith('/by-instruments') ? [quote] : quote;
    } else return route.fallback();
    return route.fulfill({ json });
  });
  await page.goto('/dashboard');
  await ready(page);
  const chart = page.locator('app-portfolio-chart');
  const line = chart.locator('path.line');
  await expect(line).toHaveAttribute('d', /^M.+C/);
  await expect(chart.getByRole('button', { name: 'Recent hour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const checkConnection = async () => {
    const result = await chart.evaluate((element) => {
      const line = element.querySelector('path.line');
      const dot = element.querySelector('path.endpoint');
      const end = line.getPointAtLength(line.getTotalLength());
      const style = getComputedStyle(line);
      const endpoint = dot.getPointAtLength(0);
      return {
        distance: Math.hypot(end.x - endpoint.x, end.y - endpoint.y),
        animation: style.animationName,
        dash: style.strokeDasharray,
        stroke: style.stroke,
        width: style.strokeWidth,
      };
    });
    expect(result.distance).toBeLessThan(0.15);
    expect(result.animation).toBe('none');
    expect(result.dash).toBe('none');
    expect(result.stroke).not.toBe('none');
    expect(result.width).toBe('2px');
  };
  await checkConnection();
  await expect(chart.locator('linearGradient')).toHaveAttribute('gradientUnits', 'userSpaceOnUse');
  await expect(chart.locator('linearGradient stop').first()).toHaveAttribute(
    'stop-color',
    'rgba(34, 197, 94, 0.4)',
  );
  await expect(chart.locator('linearGradient stop').last()).toHaveAttribute(
    'stop-color',
    'rgba(34, 197, 94, 0.0)',
  );
  await expect(chart.locator('path.area')).toHaveAttribute('d', /Z$/);
  expect(await line.evaluate((element) => getComputedStyle(element).stroke)).toBe(
    'rgb(34, 197, 94)',
  );
  const recent = await line.getAttribute('d');
  await chart.getByRole('button', { name: 'Full day', exact: true }).click();
  await expect(line).not.toHaveAttribute('d', recent);
  expect((await line.getAttribute('d')).split('C').length).toBeGreaterThan(
    recent.split('C').length,
  );
  await checkConnection();
  await chart.getByRole('button', { name: 'Recent hour', exact: true }).click();
  await expect(chart.getByRole('button', { name: 'Recent hour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  bid = 99;
  await page.clock.fastForward(5000);
  await expect(line).not.toHaveAttribute('d', recent);
  await checkConnection();
  await chart.screenshot({ path: info.outputPath('portfolio-day-desktop.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkConnection();
  expect(
    await chart
      .locator('.periods')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await chart.screenshot({ path: info.outputPath('portfolio-day-mobile.png') });
});
