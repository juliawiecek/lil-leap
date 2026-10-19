import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
const { Login } = await import('../src/app/login.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AppSessionService } = await import('../src/app/app-session.service.ts');
const { AuthApiError } = await import('../src/app/auth-api.ts');
function setup(t, options = {}) {
  const navigations = [];
  let starts = 0,
    logouts = 0;
  const auth = {
    userRole: options.role ?? 'ANALYST',
    login: options.login ?? (async () => ({ userRole: 'ANALYST' })),
    logout: async () => {
      logouts++;
    },
  };
  const login = component(t, Login, [
    { provide: AuthService, useValue: auth },
    {
      provide: AppSessionService,
      useValue: {
        start: () => {
          starts++;
        },
      },
    },
    {
      provide: Router,
      useValue: {
        navigateByUrl: async (value) => {
          navigations.push(value);
        },
      },
    },
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: {
          queryParamMap: convertToParamMap(
            options.returnUrl ? { returnUrl: options.returnUrl } : {},
          ),
        },
      },
    },
  ]);
  return { login, navigations, starts: () => starts, logouts: () => logouts };
}
test('Analyst sign-in starts the idle keeper and restores a trade lookup URL', async (t) => {
  const f = setup(t, { returnUrl: '/trades/3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f' });
  await f.login.signIn('analyst@example.test', 'test-password');
  assert.equal(f.starts(), 1);
  assert.equal(f.login.pending(), false);
  assert.equal(f.navigations[0], '/trades/3f2c9a1e-5b7d-4c8e-9f01-2a3b4c5d6e7f');
});
test('unsafe, retired and missing destinations use the home page', async (t) => {
  for (const returnUrl of [undefined, '//external.test', '/compliance', '/clients/CLIENT-001']) {
    const f = setup(t, { returnUrl });
    await f.login.signIn('a', 'b');
    assert.equal(f.navigations[0], '/insights');
  }
});
test('wrong-role sign-in revokes the session and displays the role requirement', async (t) => {
  const f = setup(t, { role: 'TRADER' });
  await f.login.signIn('a', 'b');
  assert.equal(f.logouts(), 1);
  assert.equal(f.starts(), 0);
  assert.deepEqual(f.navigations, []);
  assert.match(f.login.message(), /analyst or operations account/);
});
test('operations staff sign in to Insights like analysts (TS-03.5)', async (t) => {
  const f = setup(t, { role: 'OPERATIONS' });
  await f.login.signIn('a', 'b');
  assert.equal(f.logouts(), 0);
  assert.equal(f.starts(), 1);
  assert.equal(f.navigations[0], '/insights');
});
test('login failures show fixed messages and always release the pending state', async (t) => {
  for (const error of [
    new AuthApiError('Invalid email or password.'),
    new Error('private server data'),
  ]) {
    const f = setup(t, {
      login: async () => {
        throw error;
      },
    });
    await f.login.signIn('a', 'b');
    assert.equal(f.login.pending(), false);
    assert.doesNotMatch(f.login.message(), /private server data/);
    assert.equal(f.starts(), 0);
  }
});
test('a second submission during sign-in does not send another request', async (t) => {
  let resolve,
    calls = 0;
  const f = setup(t, {
    login: () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
  });
  const first = f.login.signIn('a', 'b');
  await f.login.signIn('a', 'b');
  assert.equal(calls, 1);
  resolve({});
  await first;
  assert.equal(f.starts(), 1);
});
