import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render } from './dom-helper.mjs';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
const { routes } = await import('../src/app/app.routes.ts');
const { TradingWorkspace } = await import('../src/app/trading-workspace.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');

test('all trading route loaders resolve to their public or protected component', async () => {
  const publicPaths = ['login', 'reset-password'];
  for (const route of routes.filter((route) => route.loadComponent)) {
    const Type = await route.loadComponent();
    assert.equal(Type.name, publicPaths.includes(route.path) ? 'App' : 'TradingWorkspace');
  }
});

test('tier guards restrict guided and advanced pages after session readiness', async (t) => {
  let tier = 'NOVICE';
  const injector = createEnvironmentInjector(
    [
      { provide: AppSessionService, useValue: { initialize: async () => true } },
      {
        provide: AuthService,
        useValue: {
          get traderLevel() {
            return tier;
          },
        },
      },
      { provide: Router, useValue: { createUrlTree: () => 'dashboard' } },
    ],
    Injector.NULL,
  );
  t.after(() => injector.destroy());
  const check = async (path) => {
    const route = routes.find((route) => route.path === path);
    return runInInjectionContext(injector, () => route.canActivate[1]({ routeConfig: route }));
  };
  assert.equal(await check('learn'), true);
  assert.equal(await check('markets'), 'dashboard');
  tier = 'ADVANCED';
  assert.equal(await check('learn'), 'dashboard');
  assert.equal(await check('markets'), true);
});

for (const level of ['NOVICE', 'ADVANCED']) {
  test('workspace renders the authenticated ' + level + ' tier and delegates logout', async (t) => {
    let logouts = 0;
    const fixture = await render(t, TradingWorkspace, {}, [
      {
        provide: AuthService,
        useValue: { accessToken: null, email: 'trader@example.test', traderLevel: level },
      },
      {
        provide: AppSessionService,
        useValue: {
          logout: async () => {
            logouts++;
          },
        },
      },
    ]);
    const selected = level === 'NOVICE' ? 'app-novice-dashboard' : 'app-advanced-dashboard';
    assert.ok(fixture.nativeElement.querySelector(selected));
    const dashboard = fixture.debugElement.children[0].componentInstance;
    assert.equal(dashboard.name(), 'trader@example.test');
    dashboard.signOut.emit();
    assert.equal(logouts, 1);
  });
}
