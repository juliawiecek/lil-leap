import './component-helper.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
const { SessionCoordinator } = await import('../src/app-session.service.ts');
const { SessionTimeoutWarning, countdownClock, countdownWords } = await import(
  '../src/session-timeout-warning.ts'
);
const angularApi = await import('../src/angular.ts');
const browser = new Window({ url: 'http://localhost/' });
globalThis.window = browser;
globalThis.document = browser.document;
globalThis.Node = browser.Node;
globalThis.HTMLElement = browser.HTMLElement;
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

const MINUTE = 60 * 1000;

/** A signed-in coordinator with a fake auth client and router, plus the warning rendered for it. */
async function signedIn(t, announce = () => {}) {
  const navigations = [];
  const calls = { activity: 0, logouts: 0, refreshes: 0 };
  let invalidate;
  const router = {
    url: '/orders',
    // Like Angular's router, the URL only changes once the navigation has finished.
    navigate: async (commands, options) => {
      navigations.push(options);
      await Promise.resolve();
      router.url = '/login';
    },
  };
  const auth = {
    accessToken: 'token',
    userRole: 'TRADER',
    lastActivityAt: Date.now(),
    accessTokenExpiresAt: Date.now() + 15 * MINUTE,
    onInvalidated: (callback) => {
      invalidate = callback;
      return () => {
        invalidate = null;
      };
    },
    restoreSession: async () => true,
    refresh: async () => {
      calls.refreshes++;
    },
    recordActivity: () => {
      calls.activity++;
    },
    logout: async () => {
      calls.logouts++;
      auth.accessToken = null;
      invalidate?.();
    },
  };
  const session = new SessionCoordinator(auth, router, 'TRADER', (url) => url);
  await session.initialize();
  TestBed.configureTestingModule({ providers: [{ provide: angularApi.SESSION_WARNING_ANNOUNCE, useValue: announce }] });
  const fixture = TestBed.createComponent(SessionTimeoutWarning);
  fixture.componentRef.setInput('session', session);
  fixture.detectChanges();
  t.after(() => {
    fixture.destroy();
    session.destroy();
    TestBed.resetTestingModule();
  });
  const dialog = fixture.nativeElement.querySelector('dialog');
  /** Pretend the last input was `secondsAgo` seconds ago, then run one keeper check. */
  const idleFor = async (secondsAgo) => {
    session.keeper.start(Date.now() - secondsAgo * 1000);
    await session.keeper.check();
    fixture.detectChanges();
  };
  return { session, fixture, dialog, idleFor, navigations, calls, router };
}

test('the warning is exported from the Angular entry point', () => {
  assert.equal(angularApi.SessionTimeoutWarning, SessionTimeoutWarning);
});

test('the countdown reads as a clock on screen and as words for screen readers', () => {
  assert.equal(countdownClock(60), '1:00');
  assert.equal(countdownClock(42), '0:42');
  assert.equal(countdownClock(5), '0:05');
  assert.equal(countdownWords(60), '1 minute');
  assert.equal(countdownWords(42), '42 seconds');
  assert.equal(countdownWords(1), '1 second');
  assert.equal(countdownWords(61), '1 minute 1 second');
  assert.equal(countdownWords(125), '2 minutes 5 seconds');
});

test('stays hidden while the user is active', async (t) => {
  const { dialog, idleFor } = await signedIn(t);
  assert.equal(dialog.open, false);
  await idleFor(8 * 60);
  assert.equal(dialog.open, false);
});

test('opens as an announced modal a minute before sign-out, focused on "Stay signed in"', async (t) => {
  const { dialog, idleFor, session } = await signedIn(t);

  await idleFor(10 * 60 - 42);

  assert.equal(dialog.open, true);
  assert.equal(dialog.getAttribute('role'), 'alertdialog');
  const title = dialog.querySelector('#' + dialog.getAttribute('aria-labelledby'));
  const message = dialog.querySelector('#' + dialog.getAttribute('aria-describedby'));
  assert.equal(title.textContent.trim(), 'Still there?');
  const text = message.textContent.replace(/\s+/g, ' ').trim();
  assert.match(text, /^For your security, you'll be signed out in 0:4[12]/);
  assert.match(text, /4[12] seconds because there's been no activity\.$/);
  assert.equal(message.querySelector('.session-warning-time').getAttribute('aria-hidden'), 'true');
  const [stay, leave] = dialog.querySelectorAll('button');
  assert.equal(stay.textContent.trim(), 'Stay signed in');
  assert.equal(leave.textContent.trim(), 'Sign out');
  assert.equal(stay.type, 'button');
  assert.equal(document.activeElement, stay);
  assert.ok(session.warningSecondsLeft() <= 42);
});

test('the countdown on screen follows the keeper', async (t) => {
  const { dialog, idleFor, fixture, session } = await signedIn(t);
  await idleFor(10 * 60 - 30);
  session.warningSecondsLeft.set(29);
  fixture.detectChanges();
  assert.equal(dialog.querySelector('.session-warning-time').textContent, '0:29');
  assert.equal(dialog.querySelector('.session-warning-sr').textContent, '29 seconds');
});

test('"Stay signed in" closes the warning and counts as activity', async (t) => {
  const { dialog, idleFor, fixture, session, calls, navigations } = await signedIn(t);
  await idleFor(10 * 60 - 20);
  const before = calls.activity;

  dialog.querySelector('.session-warning-stay').click();
  fixture.detectChanges();

  assert.equal(dialog.open, false);
  assert.equal(session.warningSecondsLeft(), null);
  assert.equal(calls.activity, before + 1);
  assert.equal(session.running, true);
  assert.deepEqual(navigations, []);
});

test('Escape keeps the session too, rather than hiding a running countdown', async (t) => {
  const { dialog, idleFor, fixture, session } = await signedIn(t);
  await idleFor(10 * 60 - 20);
  const cancel = new browser.Event('cancel', { cancelable: true });

  dialog.dispatchEvent(cancel);
  fixture.detectChanges();

  assert.equal(cancel.defaultPrevented, true);
  assert.equal(session.warningSecondsLeft(), null);
  assert.equal(dialog.open, false);
});

test('"Sign out" ends the session like the usual sign-out, with no inactivity message', async (t) => {
  const { dialog, idleFor, fixture, session, calls, navigations } = await signedIn(t);
  await idleFor(10 * 60 - 20);

  dialog.querySelector('.session-warning-leave').click();
  await Promise.resolve();
  fixture.detectChanges();

  assert.equal(calls.logouts, 1);
  assert.equal(session.running, false);
  assert.equal(dialog.open, false);
  assert.equal(navigations.length, 1);
  assert.deepEqual(navigations[0].queryParams, { returnUrl: '/orders' });
});

test('no answer signs out once and tells the sign-in page why', async (t) => {
  const { dialog, idleFor, fixture, calls, navigations } = await signedIn(t);
  await idleFor(10 * 60 - 1);
  assert.equal(dialog.open, true);

  await idleFor(10 * 60);
  await Promise.resolve();
  fixture.detectChanges();

  assert.equal(dialog.open, false);
  assert.equal(calls.logouts, 1);
  assert.equal(navigations.length, 1, 'the logout does not start a second, unexplained redirect');
  assert.deepEqual(navigations[0].queryParams, { returnUrl: '/orders', reason: 'inactive' });
});

test('announces once on opening, with an assertive region, rather than every countdown tick', async t => {
  const spoken = [];
  const { dialog, idleFor, fixture, session } = await signedIn(t, text => spoken.push(text));
  await idleFor(10 * 60 - 30);
  assert.match(spoken[0], /Still there.*Stay signed in/);
  assert.equal(dialog.querySelector('[role="alert"]').getAttribute('aria-live'), 'assertive');
  session.warningSecondsLeft.set(29); fixture.detectChanges();
  assert.equal(spoken.length, 1);
});
