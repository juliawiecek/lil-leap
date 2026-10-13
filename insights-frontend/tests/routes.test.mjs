import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { routes } = await import('../src/app/app.routes.ts');
test('Insights route loaders resolve the workspace for lists and record details', async () => {
  for (const route of routes.filter((route) => route.loadComponent)) {
    const Type = await route.loadComponent();
    assert.equal(Type.name, 'App');
    assert.ok(route.canActivate.length);
  }
});
