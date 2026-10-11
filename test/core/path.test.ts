import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDotPath, buildJsonPath } from '../../src/core/path';

test('buildDotPath renders identifiers, indices and quoted keys', () => {
  assert.equal(buildDotPath(['users', 0, 'address', 'city']), 'users[0].address.city');
  assert.equal(buildDotPath([0, 'a']), '[0].a');
  assert.equal(buildDotPath(['first name', 'x.y']), '["first name"]["x.y"]');
  assert.equal(buildDotPath([]), '');
});

test('buildJsonPath prefixes with $', () => {
  assert.equal(buildJsonPath(['users', 0]), '$.users[0]');
  assert.equal(buildJsonPath([0]), '$[0]');
  assert.equal(buildJsonPath([]), '$');
});
