import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../../src/core/stats';

test('computeStats counts keys, values, types and depth', () => {
  const text = '{"a":[1,"two",null],"b":{"c":true,"d":{"e":"x"}}}';
  const s = computeStats(text);
  assert.equal(s.totalKeys, 5);
  assert.equal(s.totalValues, 5);
  assert.equal(s.maxDepth, 3);
  assert.deepEqual(s.types, { object: 3, array: 1, string: 2, number: 1, boolean: 1, null: 1 });
  assert.deepEqual(s.largestArrays, [{ path: '$.a', size: 3 }]);
  assert.equal(s.deepestPaths[0].path, '$.b.d.e');
  assert.equal(s.fileSize, text.length);
  assert.equal(s.minifiedSize, text.length);
});

test('computeStats survives very deep nesting', () => {
  const depth = 3000;
  const deep = '['.repeat(depth) + ']'.repeat(depth);
  assert.equal(computeStats(deep).maxDepth, depth - 1);
});

test('computeStats path helpers', () => {
  const s = computeStats('{"list":[{"name":"abcdefghijklmnopqrstuvwxyz"}]}');
  assert.equal(s.longestStrings[0].path, '$.list[0].name');
});
