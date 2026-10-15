import { request } from '@playwright/test';
import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';

export default async function setup() {
  const http = await request.newContext();
  const trading = process.env.TRADING_URL ?? 'http://localhost:4200';
  const insights = process.env.INSIGHTS_URL ?? 'http://localhost:4201';
  const checks: [string, number, string?][] = [
    [`${trading}/login`, 200], [`${insights}/login`, 200], [`${trading}/auth/docs-json`, 200],
    [`${trading}/api/v1/holdings`, 401], [`${trading}/api/v1/orders`, 401, 'POST'],
    [`${insights}/api/v1/reports/summary`, 401],
  ];
  try {
    for (const [url, status, method = 'GET'] of checks) {
      const deadline = Date.now() + 240_000;
      let ready = false;
      let lastResult = 'No response received';
      while (Date.now() < deadline) {
        try {
          const response = await http.fetch(url, { method, timeout: 5000 });
          lastResult = `HTTP ${response.status()} ${response.statusText()}`;
          ready = response.status() === status;
          await response.dispose();
        } catch (error) {
          lastResult = error instanceof Error ? error.message : String(error);
        }
        if (ready) break;
        await delay(1000);
      }
      if (!ready) throw new Error(`Real service did not become ready: ${method} ${url}; expected HTTP ${status}; last result: ${lastResult}`);
    }
    const deadline = Date.now() + 60_000;
    let quoteReady = false;
    while (Date.now() < deadline) {
      const db = new pg.Client();
      try {
        await db.connect();
        const result = await db.query(`SELECT EXISTS (SELECT 1 FROM quotes q JOIN instruments i USING (instrument_id)
          WHERE i.symbol = 'AAPL' AND i.enabled AND i.tradable AND q.quoted_at > now() - interval '60 seconds') AS ready`);
        quoteReady = result.rows[0].ready;
      } finally { await db.end(); }
      if (quoteReady) break;
      await delay(1000);
    }
    if (!quoteReady) throw new Error('The real quote pipeline did not publish a fresh tradable AAPL quote.');
  } finally { await http.dispose(); }
}
