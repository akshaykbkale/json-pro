import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryValue, evaluateFilter } from '../../src/core/jsonPath';

const doc = {
  users: [
    { id: 1, name: 'Ann', role: 'admin', score: 98.5, tags: ['a', 'b'] },
    { id: 2, name: 'Bob', role: 'viewer', score: 74, tags: ['c'] },
    { id: 3, name: 'Cy', role: 'viewer', active: true },
  ],
  settings: { theme: 'dark', 'first-name': 'x', nested: { name: 'deep' } },
};

const values = (path: string): unknown[] => {
  const r = queryValue(doc, path);
  assert.equal(r.type, 'success', r.error);
  return r.results!.map(m => m.value);
};

test('dot, bracket and wildcard access', () => {
  assert.deepEqual(values('$.users[*].name'), ['Ann', 'Bob', 'Cy']);
  assert.deepEqual(values('$.users[0].tags[1]'), ['b']);
  assert.deepEqual(values('$.users[-1].id'), [3]);
  assert.deepEqual(values("$.settings['first-name']"), ['x']);
  assert.deepEqual(values('$.settings.first-name'), ['x']);
  assert.deepEqual(values('$.settings.*'), ['dark', 'x', { name: 'deep' }]);
  assert.deepEqual(values('$'), [doc]);
});

test('recursive descent', () => {
  assert.deepEqual(values('$..name'), ['Ann', 'Bob', 'Cy', 'deep']);
  assert.deepEqual(values('$..tags[0]'), ['a', 'c']);
  assert.deepEqual(values('$..[0]'), [doc.users[0], 'a', 'c']);
});

test('slices and unions', () => {
  assert.deepEqual(values('$.users[0:2].id'), [1, 2]);
  assert.deepEqual(values('$.users[::2].id'), [1, 3]);
  assert.deepEqual(values('$.users[0,2].id'), [1, 3]);
  assert.deepEqual(values("$.settings['theme','first-name']"), ['dark', 'x']);
});

test('filters', () => {
  assert.deepEqual(values("$.users[?(@.role == 'viewer')].id"), [2, 3]);
  assert.deepEqual(values('$.users[?(@.score > 80)].name'), ['Ann']);
  assert.deepEqual(values('$.users[?(@.active)].name'), ['Cy']);
  assert.deepEqual(values('$.users[?(@.name =~ /^b/i)].name'), ['Bob']);
  assert.deepEqual(values('$.users[?(@.id != 1)].id'), [2, 3]);
});

test('paths reported for matches', () => {
  const r = queryValue(doc, '$.users[1].tags[*]');
  assert.deepEqual(r.results!.map(m => m.path), ['$.users[1].tags[0]']);
});

test('errors are reported, never thrown, and prototype keys are ignored', () => {
  assert.equal(queryValue(doc, 'users').type, 'error');
  assert.equal(queryValue(doc, '$.users[').type, 'error');
  assert.deepEqual(values('$.constructor'), []);
  assert.deepEqual(values('$.users[?(@.constructor)]'), []);
});

test('evaluateFilter rejects malformed expressions', () => {
  assert.equal(evaluateFilter({ a: 1 }, 'a == 1'), false);
  assert.equal(evaluateFilter({ a: 1 }, '@.a == 1'), true);
  assert.equal(evaluateFilter({ a: '1' }, '@.a == 1'), false);
});
