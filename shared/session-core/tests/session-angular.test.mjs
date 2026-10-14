import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { signal, createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
const { SessionCoordinator } = await import('../src/app-session.service.ts');
const { PageState, safeReturnUrl } = await import('../src/page-state.ts');
const { createAuthGuard, createGuestGuard } = await import('../src/auth-routing.ts');
const coreApi = await import('../src/core.ts');
const angularApi = await import('../src/angular.ts');
const browser = new Window({ url: 'http://localhost/' });
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.Node = browser.Node;
globalThis.HTMLElement = browser.HTMLElement;
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
const paths = { Dashboard: '/dashboard', Orders: '/orders', Clients: '/clients' };
const returnUrl = (value) => safeReturnUrl(value, paths, ['clients']);

test('public package entrypoints expose the shared contracts', () => {
  assert.equal(typeof coreApi.AuthClient, 'function');
  assert.equal(typeof coreApi.SessionKeeper, 'function');
  assert.equal(angularApi.SessionCoordinator, SessionCoordinator);
  assert.equal(angularApi.PageState, PageState);
});

function coordinator(t, role = 'TRADER', restored = true) {
  let invalidate;
  const navigations = [];
  const router = {
    url: '/orders?status=FILLED',
    navigate: async (commands, options) => {
      navigations.push(options);
      router.url = '/login';
    },
  };
  const auth = {
    accessToken: 'test',
    userRole: role,
    lastActivityAt: Date.now(),
    accessTokenExpiresAt: Date.now() + 900000,
    onInvalidated: (callback) => {
      invalidate = callback;
      return () => {
        invalidate = null;
      };
    },
    restoreSession: async () => restored,
    refresh: async () => {
      auth.accessToken = 'rotated';
    },
    recordActivity: (at) => {
      auth.lastActivityAt = at;
    },
    logout: async () => {
      auth.accessToken = null;
      invalidate?.();
    },
  };
  const session = new SessionCoordinator(auth, router, 'TRADER', returnUrl);
  t.after(() => session.destroy());
  return { session, auth, router, navigations };
}

test('startup shares restoration, preserves activity, and input/visibility events use the keeper', async (t) => {
  const { session, auth } = coordinator(t);
  const first = session.initialize();
  assert.equal(first, session.initialize());
  assert.equal(await first, true);
  assert.equal(session.running, true);
  auth.lastActivityAt = 0;
  document.dispatchEvent(new browser.Event('pointerdown'));
  assert.ok(auth.lastActivityAt > 0);
  window.dispatchEvent(new browser.Event('pageshow'));
  document.dispatchEvent(new browser.Event('visibilitychange'));
  session.recordActivity();
  session.stop();
  assert.equal(session.running, false);
});

test('wrong-role and failed restores never open a protected workspace', async (t) => {
  assert.equal(await coordinator(t, 'ANALYST').session.initialize(), false);
  assert.equal(await coordinator(t, 'TRADER', false).session.initialize(), false);
});

test('logout and idle expiry clear the coordinator and preserve a safe destination', async (t) => {
  const { session, auth, navigations } = coordinator(t);
  await session.initialize();
  await session.logout();
  assert.equal(session.authenticated, false);
  assert.equal(session.running, false);
  assert.equal(navigations[0].queryParams.returnUrl, '/orders?status=FILLED');
  auth.accessToken = 'new';
  session.start();
  session.keeper.start(Date.now() - 600000);
  await session.keeper.check();
  assert.equal(auth.accessToken, null);
});

test('guards await restoration, check idle expiry, and restrict return URLs', async (t) => {
  class Session {}
  const session = {
    authenticated: true,
    initialize: async () => true,
    keeper: {
      check: async () => {
        session.authenticated = false;
      },
    },
  };
  const router = { createUrlTree: (_, options) => options, parseUrl: (value) => value };
  const injector = createEnvironmentInjector(
    [
      { provide: Session, useValue: session },
      { provide: Router, useValue: router },
    ],
    Injector.NULL,
  );
  t.after(() => injector.destroy());
  const guard = createAuthGuard(Session, returnUrl);
  assert.deepEqual(await runInInjectionContext(injector, () => guard(null, { url: '/orders' })), {
    queryParams: { returnUrl: '/orders' },
  });
  const guest = createGuestGuard(Session, returnUrl);
  assert.equal(await runInInjectionContext(injector, () => guest(null, { url: '/login' })), true);
  session.authenticated = true;
  assert.equal(
    await runInInjectionContext(injector, () =>
      guest(null, { url: '/login?returnUrl=%2Fclients%2F123' }),
    ),
    '/clients/123',
  );
  assert.equal(
    await runInInjectionContext(injector, () =>
      guest(null, { url: '/login?returnUrl=https%3A%2F%2Fevil.test' }),
    ),
    '/dashboard',
  );
});

test('page state without a router still supports local navigation', (t) => {
  const injector = createEnvironmentInjector([], Injector.NULL);
  t.after(() => injector.destroy());
  const state = runInInjectionContext(injector, () => new PageState());
  const page = signal('Dashboard');
  const binding = state.connect(page, paths, []);
  binding.go('Orders');
  assert.equal(page(), 'Orders');
  binding.destroy();
});

test('URL hydration, query updates and browser navigation retain validated state', (t) => {
  const events = new Subject();
  const writes = [];
  const router = {
    config: [{}],
    url: '/orders?q=AAPL&date=2026-09-01&compact=1&foreign=keep',
    events,
    getCurrentNavigation: () => null,
    navigateByUrl: async (url) => {
      writes.push(url);
      router.url = url;
    },
    navigate: async (commands, options) => {
      writes.push({ commands, options });
    },
  };
  TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  t.after(() => TestBed.resetTestingModule());
  const state = TestBed.runInInjectionContext(() => new PageState());
  const page = signal('Dashboard'),
    query = signal(''),
    date = signal(''),
    compact = signal(false),
    status = signal('All');
  const binding = state.connect(page, paths, [
    { key: 'q', value: query },
    { key: 'date', value: date, date: true },
    { key: 'compact', value: compact },
    { key: 'status', value: status, allowed: ['All', 'Filled'] },
  ]);
  t.after(() => binding.destroy());
  assert.equal(page(), 'Orders');
  assert.equal(query(), 'AAPL');
  assert.equal(date(), '2026-09-01');
  assert.equal(compact(), true);
  query.set('NVDA');
  TestBed.tick();
  assert.match(writes.at(-1), /q=NVDA/);
  assert.match(writes.at(-1), /foreign=keep/);
  binding.go('Clients', '123');
  assert.deepEqual(writes.at(-1).commands, ['/clients', '123']);
  router.url = '/orders?date=2026-99-99&status=INVALID';
  events.next(new NavigationEnd(1, router.url, router.url));
  assert.equal(date(), '');
  assert.equal(status(), 'All');
  assert.equal(query(), '');
  TestBed.tick();
  router.url = '/login';
  query.set('ignored');
  TestBed.tick();
  assert.equal(router.url, '/login');
  binding.destroy();
});
