import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportApplicationError, startSecureApplication } from '../src/app/security.ts';

test('HTTP never bootstraps the credential UI; HTTPS does', async () => {
  let bootstraps = 0;
  let notices = 0;
  const bootstrap = async () => { bootstraps++; };
  const notice = () => { notices++; };
  await startSecureApplication('http:', bootstrap, notice);
  assert.equal(bootstraps, 0);
  assert.equal(notices, 1);
  await startSecureApplication('https:', bootstrap, notice);
  assert.equal(bootstraps, 1);
  assert.equal(notices, 1);
});

test('bootstrap and runtime failures never log error objects or credentials', async (t) => {
  const calls = [];
  t.mock.method(console, 'error', (...args) => calls.push(args));
  const error = new Error('password=secret-canary');
  error.headers = { Authorization: 'Bearer token-canary' };
  await startSecureApplication('https:', async () => { throw error; }, () => {});
  reportApplicationError(error);
  reportApplicationError({ get message() { throw new Error('Error object must not be inspected'); } });
  assert.deepEqual(calls, [
    ['Application startup failed.'],
    ['An application error occurred.'],
    ['An application error occurred.'],
  ]);
});
