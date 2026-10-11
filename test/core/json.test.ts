import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonText, validateJsonText, formatJsonText, minifyJsonText, sortKeysJsonText, JsonParseError } from '../../src/core/json';

test('parseJsonText tolerates comments and trailing commas by default', () => {
  assert.deepEqual(parseJsonText('{ "a": 1, /* c */ "b": [1, 2,], } // end'), { a: 1, b: [1, 2] });
});

test('parseJsonText keeps a "__proto__" key as plain data', () => {
  const v = parseJsonText('{"__proto__": {"x": 1}, "b": 2}') as Record<string, unknown>;
  assert.deepEqual(Object.keys(v), ['__proto__', 'b']);
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
  assert.equal(sortKeysJsonText('{"b": 2, "__proto__": {"x": 1}}', 0), '{"__proto__":{"x":1},"b":2}');
});

test('parseJsonText throws a JsonParseError with offset on invalid input', () => {
  assert.throws(() => parseJsonText('{"a": }'), (e: unknown) => e instanceof JsonParseError && e.offset === 6);
});

test('validateJsonText: strict mode flags comments, jsonc mode does not', () => {
  const text = '{ "a": 1 // hi\n}';
  assert.equal(validateJsonText(text).length, 1);
  assert.match(validateJsonText(text)[0].message, /Comments are not allowed/);
  assert.equal(validateJsonText(text, { allowComments: true }).length, 0);
});

test('validateJsonText reports a trailing comma on the comma itself', () => {
  const problems = validateJsonText('{"a": 1,}');
  assert.equal(problems.length, 1);
  assert.equal(problems[0].offset, 7);
  assert.match(problems[0].message, /Trailing comma/);
});

test('validateJsonText reports missing comma, unterminated string and empty document', () => {
  assert.match(validateJsonText('{"a": 1 "b": 2}')[0].message, /Missing comma/);
  assert.match(validateJsonText('{"a": "x}')[0].message, /Unterminated string/);
  assert.match(validateJsonText('   ')[0].message, /empty/);
  assert.equal(validateJsonText('{"a": [1, {"b": null}]}').length, 0);
});

test('formatJsonText matches JSON.stringify layout and preserves comments and number spelling', () => {
  assert.equal(formatJsonText('{"a":[1,2],"b":{}}'), JSON.stringify({ a: [1, 2], b: {} }, null, 2));
  assert.equal(formatJsonText('{"a":[1,2],"b":{}}', 4), JSON.stringify({ a: [1, 2], b: {} }, null, 4));
  assert.equal(formatJsonText('{"a":[1,2]}', '\t'), JSON.stringify({ a: [1, 2] }, null, '\t'));
  const out = formatJsonText('{"d":74.0, // note\n"e":1}');
  assert.equal(out, '{\n  "d": 74.0, // note\n  "e": 1\n}');
  assert.throws(() => formatJsonText('{"a":'), JsonParseError);
});

test('minifyJsonText drops whitespace, comments and trailing commas but keeps values verbatim', () => {
  assert.equal(minifyJsonText('{\n  "a": [1, 2.50, ],  // c\n  "b": "x y" ,\n}'), '{"a":[1,2.50],"b":"x y"}');
  assert.equal(minifyJsonText('[ ]'), '[]');
});

test('sortKeysJsonText sorts recursively and keeps array order', () => {
  assert.equal(sortKeysJsonText('{"b":{"z":1,"a":2},"a":[{"y":1,"x":2}]}', 0),
    JSON.stringify({ a: [{ x: 2, y: 1 }], b: { a: 2, z: 1 } }));
});
