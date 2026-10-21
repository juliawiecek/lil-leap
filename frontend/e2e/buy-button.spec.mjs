import { test, expect } from '@playwright/test';
import { identity } from './fixtures.mjs';

/** Sample the painted background throughout the transition, including its first frame. */
async function backgroundFrames(button) {
  return button.evaluate(element => new Promise(resolve => {
    const frames = [];
    const start = performance.now();
    const sample = now => {
      const style = getComputedStyle(element);
      frames.push({ color: style.backgroundColor, image: style.backgroundImage });
      if (now - start < 220) {
        requestAnimationFrame(sample);
      } else {
        resolve(frames);
      }
    };
    sample(start);
  }));
}

function expectBlueBackground(frames) {
  expect(frames.length).toBeGreaterThan(1);
  for (const frame of frames) {
    if (frame.image !== 'none') {
      continue;
    }
    const [red, green, blue, alpha = 1] = frame.color.match(/[\d.]+/g).map(Number);
    expect(alpha, `Transparent hover frame: ${frame.color}`).toBe(1);
    expect(blue).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(100);
  }
}

for (const width of [1440, 390]) {
  test(`Buy stays blue throughout repeated hover transitions at ${width}px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'NextTrade', 'The allocation Buy button belongs to NextTrade.');
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await identity(page, info, { tier: 'NOVICE' });
    await page.goto('/dashboard');
    const buy = page.locator('.trade-actions').getByRole('button', { name: 'Buy', exact: true });
    await expect(buy).toBeVisible();
    for (let cycle = 0; cycle < 3; cycle++) {
      await buy.hover();
      expectBlueBackground(await backgroundFrames(buy));
      await page.mouse.move(0, 0);
      expectBlueBackground(await backgroundFrames(buy));
    }
  });
}
