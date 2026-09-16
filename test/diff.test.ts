import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeJsonDiff, lineDiff } from '../src/core/diff';

test('identical documents produce only equal lines', () => {
  const r = computeJsonDiff('{"a":1}', '{ "a": 1 }');
  assert.equal(r.type, 'success');
  if (r.type !== 'success') return;
  assert.deepEqual(r.summary, { added: 0, removed: 0, changed: 0, same: 3 });
});

test('changed value with same key is reported as changed with real line numbers', () => {
  const r = computeJsonDiff('{"a":1,"b":2,"c":3}', '{"a":1,"b":20,"c":3,"d":4}');
  assert.equal(r.type, 'success');
  if (r.type !== 'success') return;
  assert.deepEqual(r.summary, { added: 1, removed: 0, changed: 2, same: 3 });
  const changed = r.lines.find(l => l.type === 'changed')!;
  assert.equal(changed.leftNum, 3);
  assert.equal(changed.rightNum, 3);
  const added = r.lines.find(l => l.type === 'added')!;
  assert.equal(added.rightNum, 5);
  assert.equal(added.leftNum, null);
});

test('invalid input reports the offending side', () => {
  const l = computeJsonDiff('{', '{}');
  const r = computeJsonDiff('{}', '[');
  assert.equal(l.type === 'error' && l.side, 'left');
  assert.equal(r.type === 'error' && r.side, 'right');
});

test('lineDiff handles pure insertions, deletions and empty inputs', () => {
  assert.deepEqual(lineDiff([], ['a'])!.map(l => l.type), ['added']);
  assert.deepEqual(lineDiff(['a'], [])!.map(l => l.type), ['removed']);
  assert.deepEqual(lineDiff([], [])!, []);
  assert.deepEqual(lineDiff(['a', 'b', 'c'], ['a', 'x', 'c'])!.map(l => l.type), ['equal', 'removed', 'added', 'equal']);
});

test('large mostly-identical documents diff quickly thanks to prefix/suffix trimming', () => {
  const left = Array.from({ length: 200_000 }, (_, i) => `line ${i}`);
  const right = [...left];
  right[100_000] = 'changed';
  const start = Date.now();
  const r = lineDiff(left, right)!;
  assert.ok(Date.now() - start < 2000);
  assert.equal(r.filter(l => l.type !== 'equal').length, 2);
});
