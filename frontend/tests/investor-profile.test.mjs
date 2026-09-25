import assert from 'node:assert/strict';
import { test } from 'node:test';
import { component } from './component-helper.mjs';
const { InvestorProfile } = await import('../src/app/investor-profile.ts');

test('employment details appear only for employed and self-employed applicants', t => {
  const profile = component(t, InvestorProfile);
  const employer = profile.sections.flatMap(s => s.fields).find(f => f.id === 'employer_name');
  for (const status of ['EMPLOYED', 'SELF_EMPLOYED', 'RETIRED', 'STUDENT', 'UNEMPLOYED']) {
    profile.values.set({ employment_status: status });
    assert.equal(profile.visible(employer), ['EMPLOYED', 'SELF_EMPLOYED'].includes(status));
  }
});

test('review masks SSNs, displays option labels, and handles missing answers', t => {
  const profile = component(t, InvestorProfile);
  const fields = profile.sections.flatMap(s => s.fields);
  profile.values.set({ ssn: '123-45-6789', employment_status: 'SELF_EMPLOYED', first_name: ' Ada ' });
  const masked = profile.display(fields.find(f => f.id === 'ssn'));
  assert.ok(masked.length > 0); assert.doesNotMatch(masked, /\d/);
  assert.equal(profile.display(fields.find(f => f.id === 'employment_status')), 'Self-employed');
  assert.equal(profile.display(fields.find(f => f.id === 'first_name')), 'Ada');
  assert.equal(profile.display(fields.find(f => f.id === 'last_name')), 'Not provided');
});

test('submission omits hidden stale details and fields outside the questionnaire', t => {
  const profile = component(t, InvestorProfile);
  profile.values.set({ employment_status: 'RETIRED', employer_name: 'Old employer', occupation: 'Old job', first_name: 'Ada', admin: 'true' });
  const submitted = [];
  profile.completed.subscribe(answers => submitted.push(answers));
  profile.finish();
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].first_name, 'Ada');
  assert.equal(submitted[0].employment_status, 'RETIRED');
  for (const key of ['employer_name', 'occupation', 'admin']) assert.ok(!(key in submitted[0]));
  profile.values.update(values => ({ ...values, employment_status: 'EMPLOYED' }));
  profile.finish();
  assert.equal(submitted[1].employer_name, 'Old employer');
  assert.equal(submitted[1].occupation, 'Old job');
});
