import { test, expect } from '@playwright/test';
import { colourFixture } from './colour-fixtures.mjs';
import { speakable } from '../src/app/speech-text.ts';

async function scanState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const chip = document.querySelector('.scan-chip');
    return {
      live: document.querySelector('.scan-live')?.textContent ?? '',
      chip: chip && !chip.hidden ? chip.textContent : '',
      name: active?.getAttribute('aria-label') || active?.textContent?.trim().slice(0, 160),
      graphic: active?.matches('svg, .allocation-donut, .split-bar, .heat-map, .sector-list') ?? false,
    };
  });
}

async function expectVisibleRing(page) {
  const ring = page.locator('.scan-ring');
  // An unstyled div can pass toBeVisible even when its highlight is not painted.
  await expect(ring).toBeVisible();
  await expect(ring).toHaveCSS('position', 'fixed');
  await expect(ring).toHaveCSS('border-top-width', '4px');
  await expect(ring).toHaveCSS('border-top-style', /solid|dashed/);
  await expect(ring).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  await expect(ring).toBeInViewport();
}

async function scanTo(page, matches, label = 'target') {
  const visited = [];
  for (let i = 0; i < 45; i++) {
    const state = await scanState(page);
    visited.push(state);
    expect(state.graphic, 'scanning should reach the chart actions instead of stopping on non-activatable graphics').toBe(false);
    if (matches(state)) return;
    await page.clock.runFor(710);
  }
  throw new Error(`Scan ${label} not reached: ${JSON.stringify(visited.slice(-20))}`);
}

for (const [tier, key] of [['NOVICE', 'Space'], ['ADVANCED', 'Enter']]) {
  test(`${tier} switch control selects chart actions, continues scanning, restores and turns off`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date('2026-10-21T15:30:00Z') });
    await colourFixture(page, tier);
    await page.addInitScript(key => {
      if (!sessionStorage.getItem('switch-test-seeded')) {
        sessionStorage.setItem('switch-test-seeded', '1');
        localStorage.setItem('nexttrade.accessibility', JSON.stringify({
          voice: { enabled: true },
          switchControl: { enabled: false, intervalMs: 700, key, speak: false, backEverySec: 0, pauseEverySec: 0 },
        }));
      }
      // Simulate completed speech, without requiring the test machine's installed voices.
      window.scanSpeech = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        speaking: false, speak(utterance) { window.scanSpeech.push(utterance.text); setTimeout(() => utterance.onend?.(), 1); }, cancel() {},
      } });
    }, key);
    await page.goto('/dashboard');
    if (tier === 'NOVICE') await expect(page.locator('app-portfolio-chart svg[role="img"]')).toBeVisible();
    else await expect(page.locator('app-stock-svg-chart svg[role="img"]')).toBeVisible();
    await page.clock.pauseAt(new Date('2026-10-21T15:30:10Z'));
    const press = async () => { await page.keyboard.press(key); await page.clock.runFor(65); };
    const group = async name => { await scanTo(page, state => state.live === `${name} group`, name); await press(); };

    await page.keyboard.press('Alt+s'); await page.clock.runFor(20);
    await expect(page.locator('.scan-ring')).toHaveCount(1);
    await expect(page.locator('.scan-bar')).toBeVisible();
    await expectVisibleRing(page);
    if (tier === 'NOVICE') { await group('Portfolio performance'); await group('Portfolio chart'); }
    else await group('Price chart');

    await scanTo(page, state => state.name === 'Explain this chart');
    await press();
    const chart = page.locator(tier === 'NOVICE' ? 'app-portfolio-chart' : 'app-stock-svg-chart');
    const access = chart.locator('app-chart-access');
    await expect(access.getByRole('button', { name: 'Explain this chart', exact: true })).toHaveAttribute('aria-expanded', 'true');
    const summary = await access.locator('p[id$="-summary"]').textContent();
    const speech = await page.evaluate(() => window.scanSpeech);
    expect(speech.some(text => text.includes('Explain this chart selected'))).toBe(true);
    expect(speech).toContain(speakable(summary));
    await scanTo(page, state => state.name === 'Show as table'); await press();
    await expect(access.locator('table')).toBeVisible();
    await expect(access.getByRole('button', { name: 'Hide table', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await scanTo(page, state => state.live === 'Back' && state.chip.includes('Back')); await press();
    await expect(page.locator('.scan-ring')).toBeVisible();

    // Leave scanning enabled across a reload, then turn it off using the global shortcut.
    await page.reload(); await page.clock.runFor(65);
    await expect(page.locator('.scan-ring')).toHaveCount(1);
    await page.keyboard.press('Alt+s'); await page.clock.runFor(20);
    await expect(page.locator('.scan-ring')).toHaveCount(0);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('nexttrade.accessibility'))).switchControl.enabled).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('switch control reaches the shared tools dialog, toggles voice settings and chooses larger text', async ({ page }, info) => {
  test.skip(info.project.name !== 'NextTrade');
  await page.clock.install({ time: new Date('2026-10-21T15:30:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('nexttrade.accessibility', JSON.stringify({ switchControl: { enabled: false, intervalMs: 700, speak: false, backEverySec: 0, pauseEverySec: 0 } }));
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speaking: false, speak(u) { setTimeout(() => u.onend?.(), 1); }, cancel() {},
    } });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Accessibility', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Accessibility tools', exact: true });
  await expect(dialog).toBeVisible();
  await page.clock.pauseAt(new Date('2026-10-21T15:30:10Z'));
  await page.keyboard.press('Alt+s'); await page.clock.runFor(20);
  const press = async () => { await page.keyboard.press('Space'); await page.clock.runFor(65); };
  await scanTo(page, state => state.live === 'Voice assistance group'); await press();
  await scanTo(page, state => /Enable built-in voice assistance/.test(state.name)); await press();
  await expect(dialog.getByLabel('Enable built-in voice assistance', { exact: true })).toBeChecked();
  await scanTo(page, state => /Speak on keyboard focus/.test(state.name)); await press();
  await expect(dialog.getByLabel('Speak on keyboard focus', { exact: true })).toBeChecked();
  await scanTo(page, state => state.live === 'Back'); await press();
  await scanTo(page, state => state.live === 'Visual assistance group'); await press();
  await scanTo(page, state => /Minimum text size/.test(state.name)); await press();
  await scanTo(page, state => /Extra large/.test(state.name)); await press();
  await expect(page.locator('html')).toHaveAttribute('data-a11y-text', 'extra-large');
  await expectVisibleRing(page);
  await expect(dialog.locator('.scan-ring')).toHaveCount(1);
  await page.keyboard.press('Alt+s');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
});

for (const tier of ['NOVICE', 'ADVANCED']) {
  test(`${tier} native Windows speech completes and the ring advances in real time`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade' || !process.env.NEXTTRADE_NATIVE_SPEECH);
    test.setTimeout(45000);
    await colourFixture(page, tier);
    await page.addInitScript(() => {
      localStorage.setItem('nexttrade.accessibility', JSON.stringify({
        voice: { enabled: true },
        switchControl: { enabled: false, intervalMs: 700, speak: false, backEverySec: 0, pauseEverySec: 0 },
      }));
      window.nativeScanSpeech = [];
      const synth = window.speechSynthesis;
      const speak = synth.speak.bind(synth);
      // Observe the real speech engine; do not simulate completion or replace its output.
      synth.speak = utterance => {
        for (const type of ['start', 'end', 'error']) {
          utterance.addEventListener(type, event => window.nativeScanSpeech.push({ type, text: utterance.text, error: event.error }));
        }
        speak(utterance);
      };
    });
    await page.goto('/dashboard');
    await expect(page.locator(tier === 'NOVICE' ? 'app-portfolio-chart svg[role="img"]' : 'app-stock-svg-chart svg[role="img"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => speechSynthesis.getVoices().length)).toBeGreaterThan(0);
    await page.keyboard.press('Alt+s');
    await expect(page.locator('.scan-ring')).toBeVisible();
    await expectVisibleRing(page);
    const first = await page.locator('.scan-ring').getAttribute('style');
    await expect.poll(() => page.evaluate(() => window.nativeScanSpeech.filter(event => event.type === 'end').length), { timeout: 30000 }).toBeGreaterThanOrEqual(3);
    await expect.poll(() => page.locator('.scan-ring').getAttribute('style')).not.toBe(first);
    const events = await page.evaluate(() => window.nativeScanSpeech);
    expect(events.filter(event => event.type === 'end').some(event => event.text.includes('group'))).toBe(true);
    expect(events.filter(event => event.type === 'error')).toEqual([]);
    await page.keyboard.press('Alt+s');
    await expect(page.locator('.scan-ring')).toHaveCount(0);
  });
}
