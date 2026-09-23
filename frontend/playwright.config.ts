import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: process.env['FRONTEND_E2E_URL'] || 'http://127.0.0.1:4200',
    reducedMotion: 'reduce',
    // Registration contains synthetic credentials and SSN; don't retain request traces.
    trace: 'off', screenshot: 'off', video: 'off',
  },
});
