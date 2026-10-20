import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, browser } from './dom-helper.mjs';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
const { NAV_BY_ROLE, homePath, roleOf, requireRole } = await import('../src/app/roles.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { safeReturnUrl } = await import('../src/app/page-state.ts');
const { ClientsPage } = await import('../src/app/pages/clients/clients-page.ts');

test('operations staff see every analyst page plus the trade lookup; both land on Insights', () => {
  const paths = (role) => NAV_BY_ROLE[role].map((item) => item.path);
  assert.deepEqual(paths('ANALYST'), ['/insights', '/clients', '/reports']);
  assert.deepEqual(paths('OPERATIONS'), ['/insights', '/clients', '/reports', '/trades']);
  assert.equal(homePath('ANALYST'), '/insights');
  assert.equal(homePath('OPERATIONS'), '/insights');
  assert.equal(roleOf('OPERATIONS'), 'OPERATIONS');
  for (const other of ['ANALYST', 'TRADER', null, undefined]) {
    assert.equal(roleOf(other), 'ANALYST', 'anything but OPERATIONS gets the narrower analyst pages');
  }
});

function guard(t, role, allowed) {
  const router = { parseUrl: (url) => ({ redirect: url }) };
  const injector = createEnvironmentInjector([
    { provide: AuthService, useValue: { userRole: role } }, { provide: Router, useValue: router },
  ], Injector.NULL);
  t.after(() => injector.destroy());
  return runInInjectionContext(injector, () => requireRole(...allowed)());
}

test('a page guard admits its roles and sends anyone else to their own home page', (t) => {
  assert.equal(guard(t, 'OPERATIONS', ['OPERATIONS']), true);
  assert.equal(guard(t, 'OPERATIONS', ['ANALYST', 'OPERATIONS']), true);
  assert.equal(guard(t, 'ANALYST', ['ANALYST', 'OPERATIONS']), true);
  assert.deepEqual(guard(t, 'ANALYST', ['OPERATIONS']), { redirect: '/insights' }, 'analysts cannot open the trade lookup');
  assert.deepEqual(guard(t, 'TRADER', ['ANALYST']), { redirect: '/insights' });
});

test('sign-in only returns to current pages; retired pages and record IDs elsewhere are dropped', () => {
  assert.equal(safeReturnUrl('/reports'), '/reports');
  assert.equal(safeReturnUrl('/trades/3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f'), '/trades/3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f');
  for (const unsafe of ['/dashboard', '/compliance', '/clients/C-1', 'https://evil.test/insights', '//evil.test']) {
    assert.equal(safeReturnUrl(unsafe), null, unsafe);
  }
});

test('the clients page shows an honest empty state and promises no names or emails', async (t) => {
  const fixture = await render(t, ClientsPage);
  const text = fixture.nativeElement.textContent;
  assert.match(text, /No client accounts to show yet/);
  assert.match(text, /names and emails are never shown/);
  assert.ok(browser);
});
