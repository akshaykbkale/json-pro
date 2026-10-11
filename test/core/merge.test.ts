import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, computeMerge } from '../../src/core/merge';

test('right overrides scalars, objects merge recursively, arrays concat by default', () => {
  assert.deepEqual(deepMerge({ a: 1, b: { c: 1, d: 2 }, e: [1] }, { a: 2, b: { c: 3 }, e: [2] }), { a: 2, b: { c: 3, d: 2 }, e: [1, 2] });
  assert.deepEqual(deepMerge({ e: [1] }, { e: [2] }, 'replace'), { e: [2] });
});

test('prototype-polluting keys are dropped', () => {
  const merged = deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}')) as Record<string, unknown>;
  assert.deepEqual(Object.keys(merged), ['ok']);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('computeMerge reports the invalid side', () => {
  assert.equal(computeMerge('{', '{}').side, 'left');
  assert.equal(computeMerge('{}', 'nope').side, 'right');
  assert.equal(computeMerge('{"a":1}', '{"b":2}', 'concat', 0).merged, '{"a":1,"b":2}');
});
