import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { colourFixture } from './colour-fixtures.mjs';
import { identity, openOptions, uuid } from './fixtures.mjs';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function mockSpeech(page, preferences = {}) {
  await page.addInitScript(preferences => {
    if (!sessionStorage.getItem('assistive-seeded')) {
      sessionStorage.setItem('assistive-seeded', '1');
      localStorage.setItem('nexttrade.accessibility', JSON.stringify(preferences));
      localStorage.setItem('nexttrade-insights.accessibility', JSON.stringify(preferences));
    }
    window.assistiveSpeech = [];
    // Deterministic utterances; native voice properties reject a synthetic test voice.
    window.SpeechSynthesisUtterance = class extends EventTarget {
      constructor(text) { super(); this.text = text; }
    };
    let current;
    const synth = {
      speaking: false, paused: false,
      getVoices: () => [{ name: 'Local test voice', voiceURI: 'test-local', lang: 'en-US', localService: true, default: true }],
      speak(utterance) { current = utterance; this.speaking = true; window.assistiveSpeech.push(utterance.text); },
      cancel() { this.speaking = false; current = undefined; },
      pause() { this.paused = true; }, resume() { this.paused = false; },
    };
    window.finishAssistiveSpeech = () => { synth.speaking = false; current?.onend?.(new Event('end')); current = undefined; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  }, preferences);
}
const toolsOrigin = new WeakMap();
async function tools(page) {
  toolsOrigin.set(page, page.url());
  if (new URL(page.url()).pathname === '/login') {
    await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
    const panel = page.getByRole('dialog', { name: 'Accessibility tools', exact: true });
    await expect(panel).toBeVisible(); await openOptions(panel); return panel;
  }
  await page.keyboard.press('Alt+Shift+a');
  await expect(page).toHaveURL(/\/settings$/);
  const panel = page.locator('main app-assistive-settings');
  await expect(panel).toBeVisible(); await openOptions(panel); return panel;
}
async function closeTools(page) {
  if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
  else if (page.url() !== toolsOrigin.get(page)) { await page.goBack(); await expect(page.locator('main h1')).toBeFocused(); }
}
async function audit(page, label, info) {
  const result = await new AxeBuilder({ page }).withTags(tags).analyze();
  await info.attach(`${label}-axe.json`, { body: JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2), contentType: 'application/json' });
  expect.soft(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), label).toEqual([]);
}
async function insightsFixture(page, info, operations = false) {
  await identity(page, info, { role: operations ? 'OPERATIONS' : 'ANALYST' });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const account = { accountId: uuid, accountNumber: 'NT-001', accountName: 'Trading', clientName: 'Test Client', email: 'client@example.test', traderLevel: 'NOVICE', status: 'ACTIVE', tradeCount: 1, tradedValue: 200, lastTradeAt: '2026-10-22T15:00:00Z' };
  const order = { orderId: uuid, filledAt: account.lastTradeAt, symbol: 'AAPL', side: 'BUY', quantity: 1, fillPrice: 200 };
  const paged = content => ({ content, page: 0, size: 25, totalPages: 1, totalElements: content.length });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json = [];
    if (path.endsWith('/orders-today')) json = { date: '2026-10-22', dayStart: '2026-10-22T05:00:00Z', orders: [] };
    else if (path.includes('activity-trend')) json = [{ hour: '09:00', tradeCount: 1 }, { hour: '10:00', tradeCount: 2 }];
    else if (path.includes('top-instruments')) json = [{ instrument: 'AAPL', tradeCount: 3 }];
    else if (path.endsWith('summary')) json = { date: '2026-10-22', fills: 3, orders: 3, accounts: 1, gross_executed_value: 600 };
    else if (path.endsWith('/orders')) json = paged([order]);
    else if (path.endsWith('/clients/' + uuid)) json = { account, holdings: [{ symbol: 'AAPL', instrumentName: 'Apple', quantity: 1, averageCost: 200, costBasis: 200 }] };
    else if (path.endsWith('/clients')) json = paged([account]);
    else if (path.includes('/trades/')) json = { ...order, instrumentName: 'Apple', price: 200, value: 200, account, events: [] };
    await route.fulfill({ json });
  });
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('voice arrow navigation works from sign-in with a keyboard shortcut and persists in both apps', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/login');
  await expect(page.locator('#landing-title')).toBeVisible();
  await page.keyboard.press('Alt+Shift+v');
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toBe('Voice mode on.');

  const panel = await tools(page);
  await panel.getByRole('button', { name: 'Arrow-key navigation', exact: true }).focus();
  await page.keyboard.press('Enter');
  const headingBox = await panel.getByRole('heading', { name: 'Accessibility tools', exact: true }).boundingBox();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('P');
  const paragraphBox = await page.evaluate(() => ({ top: document.activeElement.getBoundingClientRect().top }));
  expect(paragraphBox.top).toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 1);
  const text = await page.evaluate(() => document.activeElement.textContent.replace(/\s+/g, ' ').trim());
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain(text);
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();

  const email = page.locator('input[type="email"]:visible').first();
  await email.focus(); await email.fill('user@example.test');
  await page.keyboard.press('ArrowLeft');
  await expect(email).toBeFocused(); await expect(email).toHaveValue('user@example.test');
  await page.keyboard.press('Alt+Shift+v');
  const count = await page.evaluate(() => window.assistiveSpeech.length);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => window.assistiveSpeech.length)).toBe(count);
  await page.keyboard.press('Alt+Shift+v');
  await page.reload(); await expect(page.locator('#landing-title')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.length)).toBeGreaterThan(0);
});

test('the single arrow-key navigation toggle starts navigation and moves focus instead of scrolling', async ({ page }) => {
  await mockSpeech(page, { voice: { enabled: true }, visual: { arrowNavigation: false } });
  await page.goto('/login');
  const panel = await tools(page);
  const start = panel.getByRole('button', { name: 'Arrow-key navigation', exact: true });
  await expect(start).toHaveCount(1);
  await start.focus(); await page.keyboard.press('Enter');
  await expect(panel.getByRole('heading', { name: 'Accessibility tools', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain('Arrow-key navigation started. Press Down or Up arrow');
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('button', { name: 'Close accessibility tools', exact: true })).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain('Close accessibility tools');
  await expect(panel).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(panel.getByRole('heading', { name: 'Accessibility tools', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown'); // introductory paragraph below the header
  await expect.poll(() => page.evaluate(() => document.activeElement.tagName)).toBe('P');
  await page.keyboard.press('ArrowDown');
  const group = panel.locator('fieldset[data-scan-group="Arrow-key navigation"]');
  await expect(group).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain('Group. Press Enter');
  await page.keyboard.press('Enter');
  expect(await group.evaluate(node => node.contains(document.activeElement) && node !== document.activeElement)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain('Inside Arrow-key navigation');
  await page.keyboard.press('Escape');
  await expect(group).toBeFocused(); await expect(panel).toBeVisible();
  await page.keyboard.press('Escape'); await expect(panel).not.toBeVisible();
});

for (const unsupported of [false, true]) {
  test(`silent arrow navigation persists independently of voice${unsupported ? ' without speech support' : ''}`, async ({ page }, info) => {
    await mockSpeech(page);
    if (unsupported) await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
      window.SpeechSynthesisUtterance = undefined;
    });
    await page.goto('/login');
    const panel = await tools(page);
    const voice = panel.getByRole('button', { name: 'Voice mode', exact: true });
    const navigation = panel.getByRole('button', { name: 'Arrow-key navigation', exact: true });
    await expect(voice).toHaveAttribute('aria-pressed', 'false');
    await expect(navigation).toHaveAttribute('aria-pressed', 'false');
    if (unsupported) await expect(voice).toBeDisabled();
    const start = navigation;
    await expect(panel.getByRole('button', { name: /arrow-key navigation/i })).toHaveCount(1);
    await expect(start).toBeEnabled(); await start.focus(); await page.keyboard.press('Enter');
    await expect(navigation).toHaveAttribute('aria-pressed', 'true');
    await expect(voice).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(panel.getByRole('button', { name: 'Close accessibility tools', exact: true })).toBeFocused();
    await expect(panel.getByRole('button', { name: 'Close accessibility tools', exact: true })).toHaveAttribute('data-a11y-nav-focus', '');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    const group = panel.locator('fieldset[data-scan-group="Arrow-key navigation"]');
    await expect(group).toBeFocused(); await page.keyboard.press('Enter');
    expect(await group.evaluate(node => node !== document.activeElement && node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape'); await expect(group).toBeFocused();
    expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
    await page.reload(); await expect(page.locator('#landing-title')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement.hasAttribute('data-a11y-nav-focus'))).toBe(true);
    expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
    const key = info.project.name === 'Insights' ? 'nexttrade-insights.accessibility' : 'nexttrade.accessibility';
    let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    expect(saved.visual.arrowNavigation).toBe(true); expect(saved.voice.enabled).toBe(false);
    await page.keyboard.press('Alt+Shift+n');
    saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    expect(saved.visual.arrowNavigation).toBe(false); expect(saved.voice.enabled).toBe(false);
    await page.keyboard.press('Alt+Shift+n');
    expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
  });
}

test('spatial navigation follows a rendered grid and enters and exits groups without activating their buttons', async ({ page }) => {
  await mockSpeech(page, { voice: { enabled: true } });
  await page.goto('/login'); await expect(page.locator('#landing-title')).toBeVisible();
  // A real browser layout fixture exercises the production delegated controller in both apps.
  await page.evaluate(() => {
    window.spatialActivations = 0;
    const dialog = document.createElement('dialog');
    dialog.id = 'spatial-layout'; dialog.tabIndex = -1;
    dialog.style.cssText = 'width:540px;height:420px;padding:20px;max-height:90vh';
    dialog.innerHTML = `<section data-a11y-nav-group="Bottom right" style="position:absolute;left:290px;top:220px;width:220px;height:150px"><button>Bottom right action</button></section>
      <section data-a11y-nav-group="Top left" style="position:absolute;left:20px;top:20px;width:220px;height:150px"><button data-test-action>First action</button><button>Second action</button></section>
      <section data-a11y-nav-group="Bottom left" style="position:absolute;left:20px;top:220px;width:220px;height:150px"><button>Bottom left action</button></section>
      <section data-a11y-nav-group="Top right" style="position:absolute;left:290px;top:20px;width:220px;height:150px"><button>Top right action</button></section>`;
    dialog.querySelector('[data-test-action]').addEventListener('click', () => window.spatialActivations++);
    document.body.append(dialog); dialog.showModal(); dialog.focus();
  });
  const fixture = page.locator('#spatial-layout');
  const group = name => fixture.locator(`[data-a11y-nav-group="${name}"]`);
  await page.keyboard.press('ArrowDown'); await expect(group('Top left')).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(group('Top right')).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(group('Bottom right')).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(group('Bottom left')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(group('Top left')).toBeFocused();
  const scroll = await page.evaluate(() => document.querySelector('#spatial-layout').scrollTop);
  await page.keyboard.press('ArrowUp'); await expect(group('Top left')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toBe('No item above.');
  expect(await fixture.evaluate(node => node.scrollTop)).toBe(scroll);
  await page.keyboard.down('Enter'); await expect(fixture.getByRole('button', { name: 'First action', exact: true })).toBeFocused();
  await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  expect(await page.evaluate(() => window.spatialActivations)).toBe(0);
  await page.keyboard.press('Enter'); expect(await page.evaluate(() => window.spatialActivations)).toBe(1);
  await page.keyboard.press('Escape'); await expect(group('Top left')).toBeFocused();
  await expect(fixture).toBeVisible();
  await group('Top right').evaluate(node => { node.style.left = '20px'; node.style.top = '185px'; node.style.height = '25px'; });
  await page.keyboard.press('ArrowDown'); await expect(group('Top right')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(fixture).not.toBeVisible();
});

test('dashboard arrows move between real panels and Enter and Escape explore their contents', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.setViewportSize({ width: 1600, height: 1100 });
  await colourFixture(page, 'NOVICE'); await mockSpeech(page, { voice: { enabled: true } });
  await page.goto('/dashboard');
  const investments = page.locator('section[data-scan-group="Your investments"]');
  const portfolio = page.locator('section[data-scan-group="Portfolio"]');
  const allocation = page.locator('section[data-scan-group="Asset allocation"]');
  await investments.getByRole('button', { name: /View all holdings/ }).focus();
  await page.keyboard.press('Escape'); await expect(investments).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(portfolio).toBeFocused();
  await page.keyboard.press('ArrowRight'); await expect(allocation).toBeFocused();
  await page.keyboard.press('ArrowLeft'); await expect(portfolio).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await portfolio.evaluate(node => node.contains(document.activeElement) && node !== document.activeElement)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toContain('Inside Portfolio');
  await page.keyboard.press('Escape'); await expect(portfolio).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Reflow to one column; the same panel is now found below, never by wrapping Right.
  await page.setViewportSize({ width: 600, height: 900 });
  await page.keyboard.press('ArrowDown');
  const after = await page.evaluate(() => ({ top: document.activeElement.getBoundingClientRect().top + scrollY }));
  const pageTop = await page.evaluate(() => scrollY);
  // Scroll-into-view can move the viewport; compare document coordinates after the move.
  const portfolioNow = await portfolio.boundingBox();
  expect(after.top).toBeGreaterThanOrEqual(portfolioNow.y + pageTop + portfolioNow.height - 1);
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  for (const voice of [false, true]) {
    test(`${tier} quantity editing exits without trapping focus or closing the trade with voice ${voice ? 'on' : 'off'}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'NextTrade');
      await colourFixture(page, tier);
      await mockSpeech(page, { visual: { arrowNavigation: true }, voice: { enabled: voice } });
      let orders = 0;
      page.on('request', request => { if (request.method() === 'POST' && /\/orders(?:\?|$)/.test(request.url())) orders++; });
      await page.goto('/dashboard');
      if (tier === 'NOVICE') {
        const search = page.locator('[data-a11y-search] input');
        await search.fill('AAPL'); await expect(page.locator('[data-a11y-results] button')).toHaveCount(1); await search.press('Enter');
        await expect(page.getByRole('dialog', { name: 'Buy AAPL', exact: true })).toBeVisible();
      }
      const quantity = page.locator(tier === 'NOVICE' ? '#novice-shares' : '#pro-quantity');
      await quantity.fill('2'); await quantity.press('Escape');
      await expect(quantity).toBeFocused(); await expect(quantity).toHaveValue('2');
      if (tier === 'NOVICE') await expect(page.getByRole('dialog', { name: 'Buy AAPL', exact: true })).toBeVisible();
      await page.keyboard.press('ArrowDown'); await expect(quantity).not.toBeFocused();
      await expect(quantity).toHaveValue('2');
      await page.keyboard.press('ArrowUp'); await expect(quantity).toBeFocused();
      await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp');
      await expect(quantity).toHaveValue('3');
      await page.keyboard.press('Escape'); await expect(quantity).toBeFocused();
      await page.keyboard.press('ArrowDown'); await expect(quantity).not.toBeFocused();
      await expect(quantity).toHaveValue('3'); expect(orders).toBe(0);
      if (!voice) expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
    });
  }

  test(`${tier} Left reaches the sidebar from settings and its navigation opens a page`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade');
    await page.setViewportSize({ width: 1600, height: 1100 });
    await colourFixture(page, tier); await mockSpeech(page);
    await page.goto('/settings'); await expect(page.locator('main h1')).toBeVisible();
    await page.keyboard.press('Alt+Shift+n'); await expect(page.locator('main h1')).toBeFocused();
    const sidebar = page.locator('aside[data-scan-group="Menu"]');
    await page.keyboard.press('ArrowLeft');
    await expect(sidebar).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(sidebar.locator('nav [aria-current="page"]')).toBeFocused();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowUp');
    await expect(sidebar.getByRole('button', { name: 'Overview', exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('main h1')).toBeFocused();
    await page.keyboard.press('ArrowLeft'); await expect(sidebar).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await expect(sidebar).toBeFocused();
    await page.keyboard.press('ArrowRight');
    expect(await sidebar.evaluate(node => node.contains(document.activeElement))).toBe(false);
    expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
  });

  for (const navigation of [false, true]) {
    test(`${tier} Enter searches for a stock with arrow navigation ${navigation ? 'on' : 'off'}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'NextTrade');
      await colourFixture(page, tier);
      await mockSpeech(page, { visual: { arrowNavigation: navigation } });
      let orders = 0;
      page.on('request', request => { if (request.method() === 'POST' && /\/orders(?:\?|$)/.test(request.url())) orders++; });
      await page.goto('/dashboard');
      const search = page.locator('[data-a11y-search] input');
      await search.fill('MSFT');
      await expect(page.locator('[data-a11y-results] button')).toHaveCount(1);
      await search.press('Enter');
      if (tier === 'NOVICE') await expect(page.getByRole('dialog', { name: 'Buy MSFT', exact: true })).toBeVisible();
      else await expect(page.locator('#pro-symbol')).toHaveValue('MSFT');
      await expect(search).toHaveValue('');
      expect(orders).toBe(0);
    });
  }
}

test('stock-picker Escape closes the menu and releases its arrows without closing the trade', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'NOVICE'); await mockSpeech(page, { visual: { arrowNavigation: true } });
  await page.goto('/dashboard');
  const search = page.locator('[data-a11y-search] input');
  await search.fill('AAPL'); await expect(page.locator('[data-a11y-results] button')).toHaveCount(1); await search.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buy AAPL', exact: true }); await expect(dialog).toBeVisible();
  const picker = page.locator('#novice-stock'), quantity = page.locator('#novice-shares');
  await picker.focus(); await page.keyboard.press('Escape'); await expect(picker).toBeFocused();
  await page.keyboard.press('Enter'); await expect(picker).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
  await expect(picker).toHaveAttribute('aria-expanded', 'false'); await expect(dialog).toBeVisible();
  await page.keyboard.press('ArrowDown'); await expect(quantity).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(quantity).not.toBeFocused();
  await expect(dialog).toBeVisible();
});

test('native stock selection and limit-price editing release arrows without reviewing an order', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'ADVANCED'); await mockSpeech(page, { visual: { arrowNavigation: true } });
  await page.goto('/dashboard');
  const ticket = page.locator('app-advanced-ticket'), symbol = page.locator('#pro-symbol');
  await expect(symbol.locator('option')).toHaveCount(2);
  await symbol.focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
  await expect(symbol).toHaveAttribute('data-a11y-interacting', '');
  await page.keyboard.press('ArrowDown'); await expect(symbol).toHaveValue('MSFT');
  await page.keyboard.press('Escape'); await expect(symbol).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(symbol).not.toBeFocused();
  await ticket.getByRole('button', { name: 'Limit', exact: true }).click();
  const limit = page.locator('#pro-limit'); await limit.fill('185'); await limit.press('Escape');
  await expect(limit).toBeFocused(); await expect(limit).toHaveValue('185');
  await page.keyboard.press('ArrowDown'); await expect(limit).not.toBeFocused();
  const quantity = page.locator('#pro-quantity'); await quantity.fill('2'); await quantity.press('Enter');
  await expect(quantity).toBeFocused(); await expect(quantity).not.toHaveAttribute('data-a11y-interacting', '');
  await expect(ticket.getByRole('button', { name: /Confirm/ })).toHaveCount(0);
});

test('chart Escape cleans up inspection and returns navigation without closing its trade dialog', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'NOVICE'); await mockSpeech(page, { visual: { arrowNavigation: true } });
  await page.goto('/dashboard');
  const search = page.locator('[data-a11y-search] input');
  await search.fill('AAPL'); await expect(page.locator('[data-a11y-results] button')).toHaveCount(1); await search.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Buy AAPL', exact: true });
  const chart = dialog.locator('.trade-chart svg[role="img"][tabindex="0"]');
  await expect(chart).toBeVisible(); await chart.focus(); await page.keyboard.press('ArrowRight');
  await expect(chart.locator('line.cursor')).toHaveCount(1);
  await page.keyboard.press('Escape'); await expect(chart).toBeFocused(); await expect(dialog).toBeVisible();
  await expect(chart.locator('line.cursor')).toHaveCount(0);
  await page.keyboard.press('ArrowDown'); await expect(chart).not.toBeFocused(); await expect(dialog).toBeVisible();
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} all page routes expose native structure and pass the WCAG axe rules`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade'); test.setTimeout(120000);
    await colourFixture(page, tier); await mockSpeech(page);
    const pages = tier === 'NOVICE' ? ['/dashboard', '/portfolio', '/activity', '/settings'] : ['/dashboard', '/portfolio', '/activity', '/markets', '/settings'];
    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page).toHaveTitle(/NextTrade/);
      await audit(page, `${tier}-${path.slice(1)}`, info);
    }
    expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
  });
}

test('focus speech is opt-in, follows keyboard navigation, preserves typing and never activates Buy', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page); await mockSpeech(page);
  await page.goto('/dashboard');
  const buy = page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true });
  await buy.focus(); await buy.hover();
  expect(await page.evaluate(() => window.assistiveSpeech)).toEqual([]);
  const panel = await tools(page);
  await panel.getByRole('button', { name: 'Voice mode', exact: true }).click();
  await panel.getByLabel('Speak on keyboard focus', { exact: true }).check();
  await closeTools(page);
  await page.evaluate(() => { window.finishAssistiveSpeech(); window.assistiveSpeech.length = 0; });
  await buy.focus(); await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.join(' '))).toMatch(/Sell/i);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const search = page.getByLabel('Search for a company or symbol');
  await search.fill('AAPL'); await page.keyboard.press('Alt+Shift+r'); await expect(search).toHaveValue('AAPL');
  await page.keyboard.press('Alt+Shift+x');
  expect(await page.evaluate(() => speechSynthesis.speaking)).toBe(false);
  await page.reload();
  const restored = await tools(page); await expect(restored.getByLabel('Speak on keyboard focus', { exact: true })).toBeChecked();
});

test('hover speech waits for intent, does not repeat during live updates, and reads on demand with continuous voice off', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page); await mockSpeech(page, { voice: { enabled: true, hover: true, hoverDelay: 550 }, visual: { highlightSpeech: true } });
  await page.goto('/dashboard');
  const buy = page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true });
  await buy.hover(); await page.mouse.move(1400, 10);
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.length), { timeout: 1000 }).toBe(0);
  await buy.hover();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.join(' '))).toMatch(/Buy/);
  await expect(buy).toHaveAttribute('data-a11y-speaking', '');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const before = await page.evaluate(() => window.assistiveSpeech.length);
  await page.evaluate(() => window.finishAssistiveSpeech());
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.assistiveSpeech.length)).toBe(before);
  await buy.focus();
  const panel = await tools(page);
  await panel.getByRole('button', { name: 'Voice mode', exact: true }).click();
  await closeTools(page); await buy.focus(); await page.keyboard.press('Alt+Shift+r');
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.at(-1))).toMatch(/Buy/);
  await page.keyboard.press('Alt+Shift+Space');
  expect(await page.evaluate(() => speechSynthesis.paused)).toBe(true);
  await page.keyboard.press('Alt+Shift+Space');
  await page.keyboard.press('Alt+Shift+x');
  expect(await page.evaluate(() => speechSynthesis.speaking)).toBe(false);
});

test('keyboard search, route focus, dialog restoration and trade review work without submitting a trade', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page, 'ADVANCED'); await mockSpeech(page);
  let submitted = 0;
  await page.route('**/api/**/orders', async route => {
    if (route.request().method() === 'POST') { submitted++; return route.fulfill({ status: 500, json: {} }); }
    await route.fallback();
  });
  await page.goto('/dashboard');
  const search = page.getByLabel('Search symbols or companies');
  await search.fill('MSFT'); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('group', { name: 'Stock search results' }).getByRole('button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('app-stock-svg-chart svg[role=img]')).toHaveAttribute('aria-label', /MSFT/);
  const nav = page.getByRole('navigation', { name: 'Advanced navigation' });
  await nav.getByRole('button', { name: 'Activity', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/activity/); await expect(page.locator('main h1')).toBeFocused();
  await nav.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.locator('#pro-quantity').fill('2');
  const review = page.getByRole('button', { name: 'Review Order', exact: true });
  await review.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /Confirm/i }) })).toBeVisible();
  expect(submitted).toBe(0);
  await page.keyboard.press('Escape'); await expect(review).toBeFocused(); expect(submitted).toBe(0);
});

test('visual assistance persists, reflows at narrow widths and preserves the switch highlight', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await colourFixture(page); await mockSpeech(page);
  await page.goto('/settings');
  const panel = await tools(page);
  await panel.getByLabel('Enhanced focus highlighting', { exact: true }).check();
  await panel.getByLabel('Minimum text size', { exact: true }).selectOption('extra-large');
  await panel.getByLabel('Increased text spacing', { exact: true }).check();
  await panel.getByLabel('Increased interface contrast', { exact: true }).check();
  await closeTools(page);
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('main')].some(main => main.clientWidth > 0 && main.scrollWidth > main.clientWidth + 1));
    expect(overflow, `ordinary content must reflow at ${width}px`).toBe(false);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-a11y-text', 'extra-large');
  await expect(page.locator('html')).toHaveAttribute('data-a11y-spacing', '');
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.scan-ring')).toHaveCSS('position', 'fixed');
  await expect(page.locator('.scan-ring')).toHaveCSS('border-top-width', '4px');
  await page.keyboard.press('Alt+s');
});

test('public auth controls, password privacy, validation and accessibility tools pass axe', async ({ page }, info) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await mockSpeech(page);
  await page.goto('/login');
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  await audit(page, `${info.project.name}-login`, info);
  const panel = await tools(page); await audit(page, `${info.project.name}-tools`, info);
  await page.keyboard.press('Escape');
  const password = page.getByLabel('Password', { exact: true }); await password.fill('do-not-speak-this');
  const voice = await tools(page);
  await voice.getByRole('button', { name: 'Voice mode', exact: true }).click();
  await voice.getByLabel('Speak on keyboard focus', { exact: true }).check();
  await page.keyboard.press('Escape');
  // Back onto the password field by keyboard: its label is read, never what was typed.
  await password.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.join(' '))).toMatch(/Password/);
  expect(await page.evaluate(() => window.assistiveSpeech.join(' '))).not.toContain('do-not-speak-this');
});

test('Insights routes, role-specific trade lookup, tab keys and native screen-reader structure', async ({ page }, info) => {
  test.skip(info.project.name !== 'Insights'); test.setTimeout(120000);
  await insightsFixture(page, info, true); await mockSpeech(page);
  for (const path of ['/insights', '/clients', '/clients/' + uuid, '/reports', '/trades', '/trades/' + uuid, '/settings']) {
    await page.goto(path); await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/NextTrade Insights/);
    await audit(page, `Insights-${path.replaceAll('/', '-')}`, info);
  }
  await page.goto('/clients/' + uuid);
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  await overview.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Orders/ })).toBeFocused();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter'); await expect(page.locator('#panel-orders')).toBeVisible();
  await page.getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.locator('main h1')).toBeFocused();
  const panel = await tools(page);
  await panel.getByRole('button', { name: 'Voice mode', exact: true }).click();
  await panel.getByLabel('Speak on keyboard focus', { exact: true }).check();
  await closeTools(page);
  await page.getByRole('link', { name: 'Clients', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.length)).toBeGreaterThan(0);
});

test('Insights reflows with larger text and its mobile navigation supports keyboard dismissal', async ({ page }, info) => {
  test.skip(info.project.name !== 'Insights'); test.setTimeout(120000);
  await insightsFixture(page, info, true);
  await mockSpeech(page, { visual: { textSize: 'extra-large', textSpacing: true, enhancedFocus: true } });
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of ['/insights','/clients','/clients/' + uuid,'/reports','/trades']) {
    await page.goto(path); await expect(page.locator('main h1')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth + 1);
    expect.soft(overflow, `Insights ${path} at 320px`).toBe(false);
    await audit(page, `Insights-mobile-${path.replaceAll('/', '-')}`, info);
  }
  const toggle = page.getByRole('button', { name: 'Toggle navigation' });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: 'Clients', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused(); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: 'test-results/site-insights-320.png' });
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} dialogs pass axe and return focus`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade'); test.setTimeout(120000);
    await colourFixture(page, tier); await mockSpeech(page); await page.goto('/dashboard');
    const triggers = tier === 'NOVICE'
      ? [page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true }), page.locator('.allocation-panel').getByRole('button', { name: /View/ })]
      : [page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }), page.locator('.exposure-panel').getByRole('button', { name: /View/ })];
    for (const trigger of triggers) {
      await trigger.click(); await expect(page.locator('dialog[open]')).toHaveCount(1);
      await audit(page, `${tier}-dialog`, info); await page.keyboard.press('Escape');
    }
  });
}
test('registration, recovery and reset forms pass axe', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade'); test.setTimeout(120000);
  await page.goto('/login'); await audit(page, 'sign-in', info);
  await page.getByRole('tab', { name: /Create account/i }).click();
  await audit(page, 'registration', info);
  await page.goto('/login'); await page.getByRole('button', { name: /Forgot password/i }).click();
  await audit(page, 'forgot-password', info);
  await page.goto('/reset-password?token=test-token'); await audit(page, 'reset-password', info);
});

for (const tier of ['NOVICE', 'ADVANCED']) {
 test(`${tier} order reviews and account dialogs pass axe`, async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade'); test.setTimeout(120000);
  await colourFixture(page, tier); await mockSpeech(page);
  await page.route('**/api/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/accounts')) return route.fulfill({json:[uuid, '00000000-0000-4000-8000-000000000002'].map((id,i)=>({account_id:id, account_name:i?'Savings':'Trading',account_status:'ACTIVE',trading_enabled:true,trader_level:tier,available_cash:4500}))});
    await route.fallback();
  });
  await page.goto('/dashboard');
  if (tier === 'NOVICE') {
   await page.locator('.trade-actions').getByRole('button',{name:'Buy',exact:true}).click();
   await page.getByLabel('Number of shares', {exact:true}).fill('1');
   await page.getByRole('button',{name:'Review buy',exact:true}).click();
  } else {
   await page.getByLabel('Quantity',{exact:true}).fill('1');
   await page.getByRole('button',{name:'Review Order',exact:true}).click();
  }
  await expect(page.locator('dialog[open]')).toHaveCount(1); await audit(page, tier+'-order-review', info); await page.keyboard.press('Escape');
  if (tier === 'ADVANCED') {
   await page.getByRole('button', {name:'Limit',exact:true}).click(); await page.getByLabel('Limit price (USD)',{exact:true}).fill('190');
   await page.getByRole('button', {name:'Take profit Off',exact:true}).click(); await page.getByLabel('Take-profit price (USD)',{exact:true}).fill('210');
   await page.getByRole('button', {name:'Stop loss Off',exact:true}).click(); await page.getByLabel('Stop-loss price (USD)',{exact:true}).fill('170');
   await audit(page, 'advanced-limit-ticket', info);
   await page.getByRole('button',{name:'Review Order',exact:true}).click(); await expect(page.locator('dialog[open]')).toHaveCount(1); await audit(page, 'advanced-limit-review', info); await page.keyboard.press('Escape');
  }
  for (const name of ['Add account','Transfer funds']) {
   await page.locator('.switcher-trigger').click(); await page.getByRole('button',{name:new RegExp(name)}).click();
   await expect(page.locator('dialog[open]')).toHaveCount(1); await audit(page, tier+'-'+name, info); await page.keyboard.press('Escape');
  }
 });
}
