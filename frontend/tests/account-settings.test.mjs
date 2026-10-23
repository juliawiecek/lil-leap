import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, render, input } from './dom-helper.mjs';
const { AccountSettings } = await import('../src/app/account-settings.ts');
const { AuthService } = await import('../src/app/auth.service.ts');
const { ProfileStore } = await import('../src/app/profile-store.ts');
const { AuthApiError } = await import('../src/app/auth-api.ts');

const profile = { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', address: '1 Old Street, Chicago, IL, 60601', email: 'ada@example.com', phone: '312-555-0100' };
const STRONG = 'Brand-new-pass1!';

/** Renders the settings rows with a fake auth client that records each call. */
async function setup(t, overrides = {}) {
  const calls = [];
  const auth = {
    email: 'ada@example.com',
    updateProfile: async (changes) => (calls.push(['updateProfile', changes]), { ...profile, ...changes }),
    changeEmail: async (email, password) => void calls.push(['changeEmail', email, password]),
    changePassword: async (current, next) => void calls.push(['changePassword', current, next]),
    ...overrides,
  };
  const fixture = await render(t, AccountSettings, {}, [{ provide: AuthService, useValue: auth }]);
  const store = fixture.debugElement.injector.get(ProfileStore);
  store.profile.set({ ...profile });
  fixture.detectChanges();
  return { fixture, calls, store };
}

const text = (fixture) => fixture.nativeElement.textContent.replace(/\s+/g, ' ');
const submit = async (fixture) => {
  fixture.nativeElement.querySelector('form.edit').dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 4; i++) await Promise.resolve();
  fixture.detectChanges();
};
const changeButtons = (fixture) => [...fixture.nativeElement.querySelectorAll('button.change')];

test('shows phone, address, email and a hidden password, each with a Change button (PS-07)', async (t) => {
  const { fixture } = await setup(t);
  const page = text(fixture);
  for (const shown of ['Phone', '312-555-0100', 'Address', '1 Old Street', 'Email', 'ada@example.com', 'Password']) {
    assert.ok(page.includes(shown), shown);
  }
  assert.equal(changeButtons(fixture).length, 4);
  assert.ok(!page.includes('Current password'), 'no form is open at first');
});

test('saving a new phone number sends only the phone and updates the profile everywhere', async (t) => {
  const { fixture, calls, store } = await setup(t);
  changeButtons(fixture)[0].click(); fixture.detectChanges();
  input(fixture, '#settings-phone', '+1-312-555-0199');
  await submit(fixture);

  assert.deepEqual(calls, [['updateProfile', { phone: '+1-312-555-0199' }]]);
  assert.equal(store.profile().phone, '+1-312-555-0199');
  assert.match(text(fixture), /Phone number saved\./);
  assert.equal(fixture.nativeElement.querySelector('form.edit'), null, 'the form closes after saving');
});

test('a malformed phone number is caught before anything is sent', async (t) => {
  const { fixture, calls } = await setup(t);
  changeButtons(fixture)[0].click(); fixture.detectChanges();
  input(fixture, '#settings-phone', '12-34');
  await submit(fixture);
  assert.deepEqual(calls, []);
  assert.equal(fixture.nativeElement.querySelector('.note[role="alert"]').textContent.trim(), 'Enter a valid phone number with at least 7 digits, up to 20 characters.');
});

test('saving a new address updates the profile', async (t) => {
  const { fixture, calls, store } = await setup(t);
  changeButtons(fixture)[1].click(); fixture.detectChanges();
  input(fixture, '#settings-address', '  2 New Road, Chicago, IL, 60602 ');
  await submit(fixture);
  assert.deepEqual(calls, [['updateProfile', { address: '2 New Road, Chicago, IL, 60602' }]]);
  assert.equal(store.profile().address, '2 New Road, Chicago, IL, 60602');
});

test('changing email needs the current password, then shows the new address', async (t) => {
  const { fixture, calls, store } = await setup(t);
  changeButtons(fixture)[2].click(); fixture.detectChanges();
  input(fixture, '#settings-email', 'Ada.New@Example.com');
  await submit(fixture);
  assert.deepEqual(calls, [], 'no request without the current password');
  assert.match(text(fixture), /Enter your current password to change your email\./);

  input(fixture, '#settings-email-password', 'current-pw');
  await submit(fixture);
  assert.deepEqual(calls, [['changeEmail', 'Ada.New@Example.com', 'current-pw']]);
  assert.equal(store.profile().email, 'ada.new@example.com');
  assert.match(text(fixture), /Email changed to ada\.new@example\.com/);
});

test('a taken email shows the server message and keeps the form open to fix', async (t) => {
  const { fixture } = await setup(t, {
    changeEmail: async () => { throw new AuthApiError('That email address is already used by another account. Try a different one.'); },
  });
  changeButtons(fixture)[2].click(); fixture.detectChanges();
  input(fixture, '#settings-email', 'taken@example.com');
  input(fixture, '#settings-email-password', 'current-pw');
  await submit(fixture);
  assert.match(text(fixture), /already used by another account/);
  assert.ok(fixture.nativeElement.querySelector('#settings-email'), 'form stays open');
});

test('changing password checks the sign-up rules and the confirmation before sending', async (t) => {
  const { fixture, calls } = await setup(t);
  changeButtons(fixture)[3].click(); fixture.detectChanges();
  input(fixture, '#settings-current-password', 'Old-password-1!');
  input(fixture, '#settings-new-password', 'short');
  await submit(fixture);
  assert.match(text(fixture), /meet every requirement/);
  assert.equal(fixture.nativeElement.querySelectorAll('#settings-password-rules li.met').length, 1, 'only "a lowercase letter" is met');

  input(fixture, '#settings-new-password', STRONG);
  input(fixture, '#settings-confirm-password', 'Different-pass1!');
  await submit(fixture);
  assert.match(text(fixture), /do not match/);
  assert.deepEqual(calls, []);

  input(fixture, '#settings-confirm-password', STRONG);
  await submit(fixture);
  assert.deepEqual(calls, [['changePassword', 'Old-password-1!', STRONG]]);
  assert.match(text(fixture), /every other device has been signed out/);
});

test('a wrong current password shows a fixed message and nothing else changes', async (t) => {
  const { fixture, store } = await setup(t, {
    changePassword: async () => { throw new AuthApiError('Your current password is incorrect, or the account is locked.'); },
  });
  changeButtons(fixture)[3].click(); fixture.detectChanges();
  input(fixture, '#settings-current-password', 'wrong');
  input(fixture, '#settings-new-password', STRONG);
  input(fixture, '#settings-confirm-password', STRONG);
  await submit(fixture);
  assert.equal(fixture.nativeElement.querySelector('.note[role="alert"]').textContent.trim(), 'Your current password is incorrect, or the account is locked.');
  assert.deepEqual(store.profile(), profile);
});
