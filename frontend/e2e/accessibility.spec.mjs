import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * PS-20: axe-core scan of the sign-in page, the novice dashboard's pages and its two dialogs, plus
 * the page structure fixes (tab titles, skip link). Serious and critical violations fail the run,
 * except the documented ones in KNOWN_EXCEPTIONS. Every finding goes into
 * test-results/a11y/axe-summary.json for docs/accessibility/axe-report.md.
 *
 * Runs against a live NextTrade: `npm run test:a11y` (see playwright.a11y.config.mjs).
 * A11Y_PASSWORD is required (the demo novice's password); A11Y_BASE_URL and A11Y_EMAIL override
 * the local defaults (http://localhost:4320, demo-novice@nexttrade.local);
 * A11Y_ADVANCED_EMAIL and A11Y_ADVANCED_PASSWORD add an informational advanced dashboard scan.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING = new Set(['serious', 'critical']);
/**
 * Findings that cannot be fixed in this story, each with its reason (see the report). None today:
 * words meant only for switch control's voice ("1 day", "Apple") live in data-speak, so every
 * accessible name matches what is on screen.
 */
const KNOWN_EXCEPTIONS = [];
// The password stays out of the repository: pass A11Y_PASSWORD (and A11Y_EMAIL for another account).
const novice = {
  email: process.env.A11Y_EMAIL ?? 'demo-novice@nexttrade.local',
  password: process.env.A11Y_PASSWORD ?? '',
};
const advanced = process.env.A11Y_ADVANCED_EMAIL
  ? { email: process.env.A11Y_ADVANCED_EMAIL, password: process.env.A11Y_ADVANCED_PASSWORD ?? '' }
  : null;
const results = [];

const excepted = (rule, target) => KNOWN_EXCEPTIONS.some((e) => e.rule === rule && e.target.test(target));

function summarise(name, violations) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(' '),
      excepted: excepted(violation.id, node.target.join(' ')),
      // Colour-contrast checks report the colours and ratio they measured.
      contrast: node.any.find((check) => check.id === 'color-contrast')?.data,
    })),
  }));
}

async function scan(page, name, { include, blocking = true } = {}) {
  let builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder = builder.include(include);
  const { violations, incomplete } = await builder.analyze();
  const summary = summarise(name, violations);
  // Contrast axe could not decide (text over gradients or images) is listed for a manual check.
  const contrastToCheck = summarise(name, incomplete.filter((check) => check.id === 'color-contrast'))[0]?.nodes ?? [];
  results.push({ page: name, blocking, violations: summary, contrastToCheck });
  const failing = summary
    .filter((v) => BLOCKING.has(v.impact))
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => !n.excepted) }))
    .filter((v) => v.nodes.length)
    .map((v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes.map((n) => n.target).slice(0, 5).join(', ')}`);
  if (blocking) expect.soft(failing, `${name} has serious or critical axe violations`).toEqual([]);
}

async function signIn(page, { email, password }) {
  await page.goto('/login');
  await expect(page.locator('#email')).toBeEditable();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Continue securely', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function openPage(page, nav, name) {
  await nav.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('main h1')).toBeVisible();
  // Let the page's first data load settle so the scan sees real content, not spinners.
  await page.waitForTimeout(1500);
}

test('sign-in page and novice dashboard', async ({ page }) => {
  test.skip(!novice.password, 'Set A11Y_PASSWORD to the novice account password.');
  await test.step('Sign in', async () => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeEditable();
    await expect(page).toHaveTitle('Sign in · NextTrade');
    await scan(page, 'Sign in');
  });
  await signIn(page, novice);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeVisible();

  await test.step('Skip link', async () => {
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  for (const name of ['Overview', 'Portfolio', 'Activity', 'Settings']) {
    await test.step(name, async () => {
      await openPage(page, nav, name);
      await expect(page).toHaveTitle(`${name} · NextTrade`);
      await expect(page.locator('h1')).toHaveCount(1);
      await scan(page, name);
    });
  }

  await test.step('Trade dialog', async () => {
    await openPage(page, nav, 'Overview');
    await page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true }).click();
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByLabel('Number of shares')).toBeVisible();
    await scan(page, 'Trade dialog', { include: 'dialog[open]' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  await test.step('Keyboard shortcuts dialog', async () => {
    await page.locator('main h1').click();
    await page.keyboard.press('?');
    const dialog = page.locator('dialog[open]');
    await expect(dialog.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await scan(page, 'Keyboard shortcuts dialog', { include: 'dialog[open]' });
    await page.keyboard.press('Escape');
  });
});

test('advanced dashboard (informational, not yet gating)', async ({ page }) => {
  test.skip(!advanced, 'Set A11Y_ADVANCED_EMAIL to scan the advanced dashboard.');
  await signIn(page, advanced);
  const nav = page.getByRole('navigation', { name: 'Advanced navigation' });
  await expect(nav).toBeVisible();
  for (const name of ['Overview', 'Portfolio', 'Activity', 'Markets', 'Settings']) {
    await openPage(page, nav, name);
    await scan(page, `Advanced ${name}`, { blocking: false });
  }
});

test.afterAll(async ({}, info) => {
  if (!results.length) return;
  mkdirSync(info.project.outputDir, { recursive: true });
  writeFileSync(`${info.project.outputDir}/axe-summary.json`, JSON.stringify(results, null, 2));
  const rules = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const nodes = { ...rules };
  for (const result of results.filter((r) => r.blocking)) {
    for (const violation of result.violations) {
      rules[violation.impact] += 1;
      nodes[violation.impact] += violation.nodes.length;
    }
  }
  console.log('axe, sign-in + novice: violations (rule per page) by impact', JSON.stringify(rules));
  console.log('axe, sign-in + novice: affected elements by impact', JSON.stringify(nodes));
});
