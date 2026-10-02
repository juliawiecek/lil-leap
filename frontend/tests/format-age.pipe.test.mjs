import assert from 'node:assert/strict';
import { test } from 'node:test';
import './component-helper.mjs';
const { FormatAgePipe } = await import('../src/app/format-age.pipe.ts');

const pipe = new FormatAgePipe();

test('missing or negative ages read as unknown', () => {
  assert.equal(pipe.transform(null), 'unknown');
  assert.equal(pipe.transform(0), 'unknown');
  assert.equal(pipe.transform(-5000), 'unknown');
});

test('ages under a second read as just now', () => {
  assert.equal(pipe.transform(500), 'just now');
});

test('each unit is singular for one and plural otherwise', () => {
  assert.equal(pipe.transform(1000), '1 second ago');
  assert.equal(pipe.transform(5000), '5 seconds ago');
  assert.equal(pipe.transform(60_000), '1 minute ago');
  assert.equal(pipe.transform(125_000), '2 minutes ago');
  assert.equal(pipe.transform(3_600_000), '1 hour ago');
  assert.equal(pipe.transform(7_200_000), '2 hours ago');
  assert.equal(pipe.transform(86_400_000), '1 day ago');
  assert.equal(pipe.transform(3 * 86_400_000), '3 days ago');
});
