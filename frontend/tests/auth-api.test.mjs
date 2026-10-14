import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toTraderRegistration } from '../src/app/registration-payload.ts';

test('toTraderRegistration converts yes/no answers to booleans and drops blank fields', () => {
  const request = toTraderRegistration(
    { first_name: ' Ada ', apartment: '', accredited_investor: 'false', broker_affiliation: 'true', broker_firm_name: 'true' },
    ' ada@example.com ',
    'pw',
  );
  assert.deepEqual(request, {
    user_role: 'TRADER',
    email: 'ada@example.com',
    password: 'pw',
    first_name: 'Ada',
    accredited_investor: false,
    broker_affiliation: true,
    broker_firm_name: 'true',
  });
});
