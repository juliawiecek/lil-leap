import { defineConfig } from '@playwright/test';
export default defineConfig({
  webServer: { command: 'node e2e/serve-built-apps.mjs', url: 'http://127.0.0.1:18080', reuseExistingServer: true },
  testDir: './e2e', timeout: 30000, workers: 1,
  outputDir: 'test-results/session-e2e',
  use: { channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'NextTrade', use: { baseURL: process.env.NEXT220_TRADING_URL ?? 'http://127.0.0.1:18080' }, metadata: { role: 'TRADER', key: 'nexttrade.auth.session.v1' } },
    { name: 'Insights', use: { baseURL: process.env.NEXT220_INSIGHTS_URL ?? 'http://127.0.0.1:18081' }, metadata: { role: 'ANALYST', key: 'nexttrade-insights.auth.session.v1' } },
  ],
});
