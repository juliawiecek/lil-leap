import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { colourFixture } from './colour-fixtures.mjs';
import { identity, uuid } from './fixtures.mjs';

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
    await expect(panel).toBeVisible(); return panel;
  }
  await page.keyboard.press('Alt+Shift+a');
  await expect(page).toHaveURL(/\/settings$/);
  const panel = page.locator('main app-assistive-settings');
  await expect(panel).toBeVisible(); return panel;
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
  const password = page.getByLabel('Password', { exact: true }); await password.fill('do-not-speak-this'); await password.focus();
  await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
  const readingPanel = page.getByRole('dialog', { name: 'Accessibility tools', exact: true });
  await readingPanel.getByRole('button', { name: 'Read focused element', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.assistiveSpeech.length)).toBeGreaterThan(0);
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
