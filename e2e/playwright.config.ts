import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const phase = process.env.E2E_REPORT_PHASE ?? 'journey';
const artifacts = process.env.E2E_ARTIFACTS ?? fileURLToPath(new URL('./artifacts/', import.meta.url));
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: `${artifacts}/${phase}/results`,
  reporter: [ ['list'], ['junit', { outputFile: `${artifacts}/${phase}/junit.xml` }],
    ['html', { outputFolder: `${artifacts}/${phase}/html`, open: 'never' }] ],
  use: {
    browserName: 'chromium',
    baseURL: process.env.TRADING_URL ?? 'http://localhost:4200',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'auth', testMatch: '**/auth.spec.ts' },
    { name: 'journey', testIgnore: ['**/session-default.spec.ts', '**/auth.spec.ts'] },
    { name: 'default-timeout', testMatch: '**/session-default.spec.ts' },
    { name: 'golden', testMatch: '**/golden-path.spec.ts' },
  ],
});
