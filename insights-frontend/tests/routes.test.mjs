import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { routes, RETIRED_PATHS } = await import('../src/app/app.routes.ts');

const shell = routes.find((route) => route.path === '' && route.children);

test('every page has its own component behind the sign-in guard and a role guard', async () => {
  assert.ok(shell.canActivate.length, 'the shell requires a signed-in session');
  const pages = {};
  for (const route of shell.children.filter((child) => child.loadComponent)) {
    pages[route.path] = (await route.loadComponent()).name;
    assert.ok(route.canActivate.length, `${route.path} checks the role`);
  }
  assert.deepEqual(pages, {
    insights: 'InsightsPage',
    clients: 'ClientsPage',
    'clients/:id': 'ClientDetailPage',
    reports: 'ReportsPage',
    trades: 'TradeLookupPage',
    'trades/:id': 'TradeLookupPage',
  });
});

test('pages cut in TS-18.4 and unknown paths land on Insights instead of a 404', () => {
  for (const path of ['dashboard', 'history', 'trading-activity', 'client-activity', 'orders', 'orders/:id',
    'trade-investigation', 'compliance', 'settings']) {
    assert.ok(RETIRED_PATHS.includes(path), path);
    assert.equal(shell.children.find((child) => child.path === path).redirectTo, 'insights');
  }
  assert.equal(shell.children.find((child) => child.path === '').redirectTo, 'insights');
  assert.equal(routes.find((route) => route.path === '**').redirectTo, 'insights');
});
