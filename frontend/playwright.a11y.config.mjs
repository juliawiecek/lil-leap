import { defineConfig } from '@playwright/test';
import base from './playwright.config.mjs';

// Mocked API audits run on both built apps. Optional live-service audits retain their own URL.
export default defineConfig({
 ...base, testIgnore: [], timeout: 180000, outputDir: 'test-results/a11y', reporter: [['list']],
 projects: [
   ...base.projects.map(project => ({ ...project, testMatch: ['site-accessibility.spec.mjs', 'insights-accessibility.spec.mjs'] })),
   { name: 'Live NextTrade', testMatch: 'accessibility.spec.mjs', use: { baseURL: process.env.A11Y_BASE_URL ?? 'http://localhost:4320' } },
 ],
});
