import { defineConfig } from '@playwright/test';

/**
 * PS-20 automated accessibility scan (axe-core). Unlike the mocked specs in playwright.config.mjs,
 * this signs in to a running NextTrade (dev server plus real auth, holdings and order services).
 * Start the app first, e.g. `npx ng serve --port 4320`, then `npm run test:a11y`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'accessibility.spec.mjs',
  timeout: 180000,
  expect: { timeout: 15000 },
  workers: 1,
  outputDir: 'test-results/a11y',
  reporter: [['list']],
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? 'http://localhost:4320',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
