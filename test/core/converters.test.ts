import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonToTypeScript, jsonToYaml, escapeJsonString, unescapeJsonString, singularize, needsYamlQuoting } from '../../src/core/converters';

test('TypeScript: nested interfaces, array element naming, optional and union props', () => {
  const ts = jsonToTypeScript({
    users: [
      { id: 1, name: 'a', address: { city: 'x' } },
      { id: 2, name: null, address: { city: 'y', zip: '1' } },
    ],
    'odd-key': true,
    empty: [],
  });
  assert.equal(ts, [
    'export interface Root {',
    '  users: User[];',
    '  "odd-key": boolean;',
    '  empty: unknown[];',
    '}',
    '',
    'export interface User {',
    '  id: number;',
    '  name: string | null;',
    '  address: Address;',
    '}',
    '',
    'export interface Address {',
    '  city: string;',
    '  zip?: string;',
    '}',
    '',
  ].join('\n'));
});

test('TypeScript: root arrays and scalars produce a type alias', () => {
  assert.equal(jsonToTypeScript([1, 'a']), 'export type Root = (number | string)[];\n');
  assert.equal(jsonToTypeScript([{ a: 1 }]), 'export type Root = RootItem[];\n\nexport interface RootItem {\n  a: number;\n}\n');
});

test('singularize', () => {
  assert.equal(singularize('users'), 'User');
  assert.equal(singularize('addresses'), 'Address');
  assert.equal(singularize('categories'), 'Category');
  assert.equal(singularize('data'), 'DataItem');
  assert.equal(singularize('boxes'), 'Box');
});

test('YAML: objects, arrays, quoting and block scalars', () => {
  const yaml = jsonToYaml({
    name: 'JSON Pro', version: '2.1.0', active: true, nothing: null, count: 3,
    tags: ['a', 'yes', 'b: c'], nested: { list: [{ x: 1 }, { y: [1, 2] }] },
    text: 'line1\nline2', trailing: 'a\n', empty: {}, emptyList: [], 'key: colon': 1,
  });
  assert.equal(yaml, [
    'name: JSON Pro',
    'version: "2.1.0"',
    'active: true',
    'nothing: null',
    'count: 3',
    'tags:',
    '  - a',
    '  - "yes"',
    '  - "b: c"',
    'nested:',
    '  list:',
    '    - x: 1',
    '    - y:',
    '        - 1',
    '        - 2',
    'text: |-',
    '  line1',
    '  line2',
    'trailing: |',
    '  a',
    'empty: {}',
    'emptyList: []',
    '"key: colon": 1',
    '',
  ].join('\n'));
  assert.equal(needsYamlQuoting('~'), true);
  assert.equal(needsYamlQuoting('<<'), true);
  assert.equal(needsYamlQuoting('plain text'), false);
});

test('escape / unescape', () => {
  assert.equal(escapeJsonString('a "b"\n'), '"a \\"b\\"\\n"');
  assert.equal(unescapeJsonString(' "a \\"b\\"\\n" '), 'a "b"\n');
  assert.throws(() => unescapeJsonString('{"a":1}'), /string value/);
  assert.throws(() => unescapeJsonString('"a" 1'), SyntaxError);
});
