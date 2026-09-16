import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenValue, unflattenValue, removeEmpty, renameKey, collectKeys, parseDotPath } from '../src/core/transforms';

test('flatten/unflatten round-trips nested data including empty containers', () => {
  const doc = { a: { b: 1, c: [1, { d: 'x' }], e: {}, f: [] }, g: null };
  const flat = flattenValue(doc);
  assert.deepEqual(flat, { 'a.b': 1, 'a.c[0]': 1, 'a.c[1].d': 'x', 'a.e': {}, 'a.f': [], g: null });
  assert.deepEqual(unflattenValue(flat), doc);
});

test('unflatten builds a root array when every key starts with an index', () => {
  assert.deepEqual(unflattenValue({ '[0].a': 1, '[1].a': 2 }), [{ a: 1 }, { a: 2 }]);
  assert.throws(() => unflattenValue([1]), /flat JSON object/);
  assert.throws(() => unflattenValue({ '__proto__.x': 1 }), /Forbidden/);
});

test('parseDotPath understands quoted segments', () => {
  assert.deepEqual(parseDotPath('a["b.c"][2].d'), ['a', 'b.c', 2, 'd']);
});

test('removeEmpty strips nulls, empty strings and empty containers everywhere', () => {
  assert.deepEqual(removeEmpty({ a: null, b: '', c: [], d: {}, e: { f: null }, g: [null, '', [], { h: 1 }], i: 0, j: false }),
    { g: [{ h: 1 }], i: 0, j: false });
  assert.deepEqual(removeEmpty({ a: null }), {});
  assert.deepEqual(removeEmpty([null]), []);
});

test('renameKey renames at every depth and counts renames', () => {
  const { result, count } = renameKey({ id: 1, items: [{ id: 2 }, { x: { id: 3 } }] }, 'id', 'key');
  assert.deepEqual(result, { key: 1, items: [{ key: 2 }, { x: { key: 3 } }] });
  assert.equal(count, 3);
  assert.deepEqual(collectKeys({ a: [{ b: 1 }], c: 2 }), ['a', 'b', 'c']);
});
