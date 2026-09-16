import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixJsonText } from '../src/core/fixer';

const fix = (s: string): unknown => JSON.parse(fixJsonText(s));

test('leaves valid JSON untouched', () => {
  const valid = '{\n  "a": [1, 2, {"b": null}],\n  "c": "x"\n}\n';
  assert.equal(fixJsonText(valid), valid);
});

test('strips comments outside strings only', () => {
  assert.deepEqual(fix('{ // c\n "url": "http://example.com", /* block */ "b": 1 }'), { url: 'http://example.com', b: 1 });
  assert.deepEqual(fix('{ "a": "/* not a comment */", "b": "# nope" }'), { a: '/* not a comment */', b: '# nope' });
});

test('converts single quotes and preserves apostrophes inside double-quoted strings', () => {
  assert.deepEqual(fix(`{'a': 'it\\'s', "b": "don't", 'c': 'say "hi"'}`), { a: "it's", b: "don't", c: 'say "hi"' });
});

test('quotes unquoted keys, including inside nested objects, but not words inside strings', () => {
  assert.deepEqual(fix('{a: 1, nested: {b_c: "x, y: z"}, $d: true}'), { a: 1, nested: { b_c: 'x, y: z' }, $d: true });
});

test('removes trailing and duplicate commas, inserts missing commas and colons', () => {
  assert.deepEqual(fix('{"a": 1,, "b": [1, 2,],}'), { a: 1, b: [1, 2] });
  assert.deepEqual(fix('{"a": 1 "b": 2}'), { a: 1, b: 2 });
  assert.deepEqual(fix('[1 2 3]'), [1, 2, 3]);
  assert.deepEqual(fix('{"a" 1}'), { a: 1 });
  assert.deepEqual(fix('{"a": 1, // trailing comment before close\n}'), { a: 1 });
});

test('balances brackets and repairs mismatched closers', () => {
  assert.deepEqual(fix('{"a": [1, 2, {"b": 3'), { a: [1, 2, { b: 3 }] });
  assert.deepEqual(fix('[1, 2}'), [1, 2]);
  assert.deepEqual(fix('{"a": 1}}'), { a: 1 });
});

test('normalises Python/JS literals and odd numbers', () => {
  assert.deepEqual(fix("{'a': True, 'b': False, 'c': None, 'd': undefined, 'e': NaN}"), { a: true, b: false, c: null, d: null, e: null });
  assert.deepEqual(fix('{"a": +1, "b": .5, "c": 5., "d": 007, "e": -0.5e3}'), { a: 1, b: 0.5, c: 5, d: 7, e: -500 });
});

test('escapes tabs and closes strings left open at end of line', () => {
  assert.deepEqual(fix('{"a": "x\ty"}'), { a: 'x\ty' });
  assert.deepEqual(fix('{"a": "unterminated\n, "b": 2}'), { a: 'unterminated', b: 2 });
});

test('strips a byte-order mark and bare-word values become strings', () => {
  assert.deepEqual(fix('﻿{"a": hello}'), { a: 'hello' });
});
