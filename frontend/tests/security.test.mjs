import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportApplicationError, startApplication } from '../src/app/security.ts';

test('application bootstraps without a protocol requirement', async () => {
  let bootstraps = 0;
  await startApplication(async () => { bootstraps++; });
  assert.equal(bootstraps, 1);
});

test('bootstrap and runtime failures never log error objects or credentials', async (t) => {
  const calls = [];
  t.mock.method(console, 'error', (...args) => calls.push(args));
  const error = new Error('password=secret-canary');
  error.headers = { Authorization: 'Bearer token-canary' };
  await startApplication(async () => { throw error; });
  reportApplicationError(error);
  reportApplicationError({ get message() { throw new Error('Error object must not be inspected'); } });
  assert.deepEqual(calls, [
    ['Application startup failed.'],
    ['An application error occurred.'],
    ['An application error occurred.'],
  ]);
});
