import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, input, browser, animateFrame } from './dom-helper.mjs';
import { Router, ActivatedRoute, convertToParamMap } from '@angular/router';
const { App } = await import('../src/app/app.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { AuthApiError } = await import('../src/app/auth-api.ts');

/** `route` opens the page on a route (e.g. reset-password) with query params; router navigations are recorded. */
async function setup(t, overrides = {}, route = {}) {
  const auth = { login: t.mock.fn(async () => ({})), register: t.mock.fn(async () => {}),
    logout: t.mock.fn(async () => {}), traderLevel: 'ADVANCED', accessTokenExpiresAt: null, ...overrides };
  const snapshot = { queryParamMap: convertToParamMap(route.query ?? {}), routeConfig: route.path ? { path: route.path } : undefined };
  const router = { url: '/login', navigateByUrl: t.mock.fn(async () => true), navigate: t.mock.fn(async () => true) };
  const fixture = await render(t, App, {}, [{ provide: AuthService, useValue: auth }, { provide: ActivatedRoute, useValue: { snapshot } }, { provide: Router, useValue: router }]);
  const app = fixture.componentInstance;
  t.after(() => app.session.stop());
  return { fixture, app, auth, router };
}
function submit(fixture) {
  fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
}
async function settle(fixture) {
  await new Promise(resolve => setImmediate(resolve));
  fixture.detectChanges();
}
function signup(fixture, app, password = 'StrongPassword1!') {
  app.setAuthMode('signup'); fixture.detectChanges();
  input(fixture, '#full-name', ' Ada Lovelace ');
  input(fixture, '#email', 'ada@example.com');
  input(fixture, '#password', password);
  input(fixture, '#verify-password', password);
}

test('signup validates password rules, confirmation, and name before opening the profile', async t => {
  const { fixture, app, auth } = await setup(t);
  signup(fixture, app, 'weak'); submit(fixture);
  assert.equal(app.profileOpen(), false);
  // A long password that satisfies native length validation but lacks other rules.
  input(fixture, '#password', 'abcdefghijklmnop'); input(fixture, '#verify-password', 'abcdefghijklmnop');
  submit(fixture); assert.match(app.formStatus(), /password requirements/);
  input(fixture, '#password', 'StrongPassword1!'); submit(fixture);
  assert.match(app.formStatus(), /Passwords do not match/);
  input(fixture, '#verify-password', 'StrongPassword1!'); input(fixture, '#full-name', '   ');
  submit(fixture); assert.match(app.formStatus(), /full name/);
  input(fixture, '#full-name', ' Ada Lovelace '); submit(fixture);
  assert.equal(app.profileOpen(), true); assert.equal(app.applicantName(), 'Ada Lovelace');
  assert.equal(app.applicantEmail(), 'ada@example.com');
  assert.ok(fixture.nativeElement.querySelector('app-investor-profile'));
  assert.equal(auth.register.mock.callCount(), 0);
  app.returnToSignup(); fixture.detectChanges();
  assert.equal(app.profileOpen(), false); assert.equal(app.authMode(), 'signup');
});

test('sign-in submits credentials once, uses server tier, clears secrets, and signs out', async t => {
  let finishLogin;
  const login = t.mock.fn(() => new Promise(resolve => { finishLogin = resolve; }));
  const { fixture, app, auth } = await setup(t, { login });
  input(fixture, '#email', 'ada@example.com'); input(fixture, '#password', 'StrongPassword1!');
  submit(fixture); submit(fixture);
  assert.equal(login.mock.callCount(), 1); assert.equal(app.signingIn(), true);
  assert.deepEqual(login.mock.calls[0].arguments, ['ada@example.com', 'StrongPassword1!']);
  finishLogin({}); await settle(fixture);
  assert.equal(app.dashboardOpen(), true); assert.equal(app.traderLevel(), 'ADVANCED');
  assert.equal(app.newAccount(), false); assert.equal(app.passwordDraft(), '');
  assert.equal(fixture.nativeElement.querySelector('#password').value, '');
  assert.equal(app.signingIn(), false);
  const activity = t.mock.method(app.session, 'recordActivity', () => {});
  document.dispatchEvent(new Event('pointerdown')); assert.equal(activity.mock.callCount(), 1);
  app.signOut(); fixture.detectChanges();
  assert.equal(auth.logout.mock.callCount(), 1); assert.equal(app.dashboardOpen(), false);
  assert.equal(app.authMode(), 'signin'); assert.equal(app.session.running, false);
});

for (const error of [new AuthApiError('Invalid email or password.'), new Error('secret server detail')]) {
  test(`sign-in displays a safe message for ${error.name} and allows retry`, async t => {
    const { fixture, app } = await setup(t, { login: async () => { throw error; } });
    input(fixture, '#email', 'ada@example.com'); input(fixture, '#password', 'password');
    submit(fixture); await settle(fixture);
    assert.equal(app.dashboardOpen(), false); assert.equal(app.signingIn(), false);
    assert.equal(app.formStatus(), error instanceof AuthApiError ? error.userMessage : 'Something went wrong. Please try again.');
    assert.doesNotMatch(fixture.nativeElement.textContent, /secret server detail/);
  });
}

test('successful registration sends profile answers then signs in to a fresh novice account', async t => {
  const { fixture, app, auth } = await setup(t, { traderLevel: null });
  signup(fixture, app); submit(fixture);
  await app.completeRegistration({ first_name: 'Ada', accredited_investor: 'false' }); fixture.detectChanges();
  assert.deepEqual(auth.register.mock.calls[0].arguments[0], {
    user_role: 'TRADER', email: 'ada@example.com', password: 'StrongPassword1!', first_name: 'Ada', accredited_investor: false,
  });
  assert.equal(auth.login.mock.callCount(), 1);
  assert.equal(app.traderLevel(), 'NOVICE'); assert.equal(app.newAccount(), true);
  assert.equal(app.profileOpen(), false); assert.equal(app.registering(), false);
});

test('registration errors keep the profile open and duplicate submissions are ignored', async t => {
  let rejectRegistration;
  const register = t.mock.fn(() => new Promise((_, reject) => { rejectRegistration = reject; }));
  const { fixture, app, auth } = await setup(t, { register });
  signup(fixture, app); submit(fixture);
  const pending = app.completeRegistration({}); await app.completeRegistration({});
  assert.equal(register.mock.callCount(), 1);
  rejectRegistration(new AuthApiError('Please review your information.')); await pending;
  assert.equal(app.registering(), false); assert.equal(app.profileOpen(), true);
  assert.equal(app.registrationError(), 'Please review your information.');
  assert.equal(auth.login.mock.callCount(), 0);
});

test('password visibility, recovery, and bfcache return check the idle deadline', async t => {
  const { fixture, app } = await setup(t);
  app.togglePassword(); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('#password').type, 'text');
  app.togglePassword(); fixture.detectChanges();
  assert.equal(fixture.nativeElement.querySelector('#password').type, 'password');
  const event = new Event('click', { cancelable: true }); app.showPasswordRecovery(event);
  assert.equal(event.defaultPrevented, true); assert.equal(app.authMode(), 'forgot');
  const check = t.mock.method(app.session.keeper, 'check', async () => {});
  app.onPageShow({ persisted: false }); assert.equal(check.mock.callCount(), 0);
  app.onPageShow({ persisted: true }); assert.equal(check.mock.callCount(), 1);
});

test('canvas startup draws candles, responds to resize, reveals auth, and cleans body classes', async t => {
  const calls = [];
  const context = Object.fromEntries(['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fillRect'].map(name =>
    [name, (...args) => calls.push([name, ...args])]));
  t.mock.method(browser.HTMLCanvasElement.prototype, 'getContext', () => context);
  t.mock.method(browser, 'matchMedia', () => ({ matches: true }));
  const { fixture, app } = await setup(t);
  animateFrame(performance.now() + 32);
  await new Promise(resolve => setTimeout(resolve, 5)); fixture.detectChanges();
  assert.equal(app.pageReady(), true); assert.ok(document.body.classList.contains('auth-phase'));
  assert.ok(calls.some(([name]) => name === 'fillRect'));
  assert.ok(calls.every(call => call.slice(1).every(Number.isFinite)));
  assert.ok(app.volumeBars().length >= 34 && app.volumeBars().length <= 72);
  app.onResize(); assert.ok(calls.filter(([name]) => name === 'setTransform').length >= 2);
  fixture.destroy();
  assert.equal(document.body.classList.contains('auth-phase'), false);
});

function shown(fixture, selector) {
  return !fixture.nativeElement.querySelector(selector).closest('.field-group').hidden;
}

test('forgot password asks only for the email and always shows the same confirmation', async t => {
  const requestPasswordReset = t.mock.fn(async () => undefined);
  const { fixture, app } = await setup(t, { requestPasswordReset });
  app.showPasswordRecovery(new Event('click', { cancelable: true })); fixture.detectChanges();

  assert.equal(app.authTitle(), 'Reset your password');
  assert.equal(shown(fixture, '#email'), true);
  assert.equal(shown(fixture, '#password'), false);
  assert.equal(fixture.nativeElement.querySelector('.auth-tabs'), null);

  input(fixture, '#email', ' ada@example.com '); submit(fixture); submit(fixture);
  await settle(fixture);
  assert.equal(requestPasswordReset.mock.callCount(), 1);
  assert.deepEqual(requestPasswordReset.mock.calls[0].arguments, ['ada@example.com']);
  assert.match(app.formStatus(), /If an account exists for that email, we have sent a link/);

  app.backToSignIn(); fixture.detectChanges();
  assert.equal(app.authMode(), 'signin');
  assert.ok(fixture.nativeElement.querySelector('.auth-tabs'));
});

test('a failed reset request shows a safe message', async t => {
  const requestPasswordReset = t.mock.fn(async () => { throw new AuthApiError('We could not reach NextTrade.'); });
  const { fixture, app } = await setup(t, { requestPasswordReset });
  app.setAuthMode('forgot'); fixture.detectChanges();

  input(fixture, '#email', 'ada@example.com'); submit(fixture); await settle(fixture);

  assert.equal(app.formStatus(), 'We could not reach NextTrade.');
  assert.equal(app.signingIn(), false);
});

test('an emailed reset link opens the new-password screen and drops the token from the address bar', async t => {
  const resetPassword = t.mock.fn(async () => undefined);
  const { fixture, app, router } = await setup(t, { resetPassword }, { path: 'reset-password', query: { token: 'link-value' } });

  assert.equal(app.authMode(), 'reset');
  assert.equal(app.authTitle(), 'Choose a new password');
  assert.deepEqual(router.navigate.mock.calls[0].arguments, [['/', 'reset-password'], { replaceUrl: true }]);
  assert.equal(shown(fixture, '#email'), false);
  assert.ok(fixture.nativeElement.querySelector('#verify-password'));

  // Long enough for native validation, but missing the other sign-up rules.
  input(fixture, '#password', 'abcdefghijklmnop'); input(fixture, '#verify-password', 'abcdefghijklmnop'); submit(fixture);
  assert.match(app.formStatus(), /password requirements/);
  input(fixture, '#password', 'NewPassword1!'); input(fixture, '#verify-password', 'Different1!'); submit(fixture);
  assert.match(app.formStatus(), /Passwords do not match/);
  assert.equal(resetPassword.mock.callCount(), 0);

  input(fixture, '#verify-password', 'NewPassword1!'); submit(fixture); await settle(fixture);
  assert.deepEqual(resetPassword.mock.calls[0].arguments, ['link-value', 'NewPassword1!']);
  assert.equal(app.authMode(), 'signin');
  assert.equal(fixture.nativeElement.querySelector('#password').value, '');
  assert.match(app.formStatus(), /Your password has been changed/);
  assert.equal(router.navigateByUrl.mock.callCount(), 0);
});

test('an expired or used reset link explains how to get a new one', async t => {
  const resetPassword = t.mock.fn(async () => {
    throw new AuthApiError('This reset link is invalid, expired or already used. Please request a new one.');
  });
  const { fixture, app } = await setup(t, { resetPassword }, { path: 'reset-password', query: { token: 'stale' } });

  input(fixture, '#password', 'NewPassword1!'); input(fixture, '#verify-password', 'NewPassword1!');
  submit(fixture); await settle(fixture);

  assert.equal(app.authMode(), 'reset');
  assert.match(app.formStatus(), /request a new one/);
});

test('back to sign in from a reset link goes to the login page', async t => {
  const { app, router } = await setup(t, {}, { path: 'reset-password', query: { token: 'link-value' } });

  app.backToSignIn();

  assert.equal(app.authMode(), 'signin');
  assert.deepEqual(router.navigateByUrl.mock.calls[0].arguments, ['/login', { replaceUrl: true }]);
});

test('without a token the reset page just shows sign in', async t => {
  const { app, router } = await setup(t, {}, { path: 'reset-password' });

  assert.equal(app.authMode(), 'signin');
  assert.equal(app.submitLabel(), 'Continue securely');
  assert.equal(router.navigate.mock.callCount(), 0);
});

test('a token on any other route is ignored', async t => {
  const { app } = await setup(t, {}, { path: 'login', query: { token: 'link-value' } });

  assert.equal(app.authMode(), 'signin');
});
