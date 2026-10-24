export interface JsonPathMatch { path: string; value: unknown }

export interface JsonPathResult {
  type: 'success' | 'error';
  results?: JsonPathMatch[];
  error?: string;
}

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** Run a JSONPath query against a JSON document (given as text). Never throws. */
export function runJsonPathQuery(jsonText: string, path: string): JsonPathResult {
  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch (e) {
    return { type: 'error', error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  return queryValue(root, path);
}

/** Run a JSONPath query against an already-parsed value. Never throws. */
export function queryValue(root: unknown, path: string): JsonPathResult {
  const trimmed = path.trim();
  if (!trimmed) return { type: 'success', results: [{ path: '$', value: root }] };
  if (!trimmed.startsWith('$')) return { type: 'error', error: 'Path must start with $' };
  try {
    const results: JsonPathMatch[] = [];
    walk(root, trimmed.slice(1), '$', results);
    return { type: 'success', results };
  } catch (e) {
    return { type: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

function walk(value: unknown, remaining: string, currentPath: string, results: JsonPathMatch[]): void {
  if (remaining === '' || remaining === '.') {
    results.push({ path: currentPath, value });
    return;
  }

  // Recursive descent: ..key, ..*, ..[...]
  if (remaining.startsWith('..')) {
    const rest = remaining.slice(2);
    if (rest.startsWith('[')) {
      walk(value, rest, currentPath, results);
      descend(value, remaining, currentPath, results);
      return;
    }
    const keyMatch = rest.match(/^([a-zA-Z_$*][a-zA-Z0-9_$]*)(.*)/s);
    if (!keyMatch) throw new Error(`Invalid segment after '..': ${rest}`);
    walk(value, `.${keyMatch[1]}${keyMatch[2]}`, currentPath, results);
    descend(value, remaining, currentPath, results);
    return;
  }

  // Dot notation: .key or .*
  if (remaining.startsWith('.')) {
    const rest = remaining.slice(1);
    if (rest.startsWith('*')) {
      walkChildren(value, rest.slice(1), currentPath, results);
      return;
    }
    const keyMatch = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$-]*)(.*)/s);
    if (!keyMatch) throw new Error(`Invalid key after '.': ${rest}`);
    const [, key, after] = keyMatch;
    if (isPlainObject(value) && hasOwn(value, key)) {
      walk(value[key], after, `${currentPath}.${key}`, results);
    }
    return;
  }

  // Bracket notation
  if (remaining.startsWith('[')) {
    const closeIdx = findClosingBracket(remaining);
    if (closeIdx === -1) throw new Error("Unclosed '[' in path");
    const selector = remaining.slice(1, closeIdx).trim();
    const after = remaining.slice(closeIdx + 1);

    if (selector === '*') { walkChildren(value, after, currentPath, results); return; }

    const strMatch = quotedKey(selector);
    if (strMatch !== null) {
      const key = strMatch;
      if (isPlainObject(value) && hasOwn(value, key)) {
        walk(value[key], after, `${currentPath}['${key}']`, results);
      }
      return;
    }

    if (selector.startsWith('?(') && selector.endsWith(')')) {
      const expr = selector.slice(2, -1);
      if (Array.isArray(value)) {
        value.forEach((v, i) => { if (evaluateFilter(v, expr)) walk(v, after, `${currentPath}[${i}]`, results); });
      } else if (isPlainObject(value)) {
        for (const [k, v] of Object.entries(value)) {
          if (evaluateFilter(v, expr)) walk(v, after, `${currentPath}.${k}`, results);
        }
      }
      return;
    }

    if (selector.includes(':')) {
      if (Array.isArray(value)) {
        const parts = selector.split(':').map(s => (s.trim() === '' ? undefined : parseInt(s, 10)));
        const len = value.length;
        const clamp = (v: number): number => (v < 0 ? Math.max(len + v, 0) : Math.min(v, len));
        const step = parts[2] ?? 1;
        if (step <= 0 || Number.isNaN(step)) throw new Error('Slice step must be a positive integer');
        const start = parts[0] !== undefined ? clamp(parts[0]) : 0;
        const end = parts[1] !== undefined ? clamp(parts[1]) : len;
        for (let i = start; i < end; i += step) walk(value[i], after, `${currentPath}[${i}]`, results);
      }
      return;
    }

    if (selector.includes(',')) {
      const parts = selector.split(',').map(s => s.trim());
      for (const part of parts) {
        const inner = quotedKey(part);
        if (inner !== null) {
          if (isPlainObject(value) && hasOwn(value, inner)) walk(value[inner], after, `${currentPath}['${inner}']`, results);
        } else if (/^-?\d+$/.test(part) && Array.isArray(value)) {
          const idx = parseInt(part, 10);
          const real = idx < 0 ? value.length + idx : idx;
          if (real >= 0 && real < value.length) walk(value[real], after, `${currentPath}[${real}]`, results);
        }
      }
      return;
    }

    if (/^-?\d+$/.test(selector)) {
      const idx = parseInt(selector, 10);
      if (Array.isArray(value)) {
        const real = idx < 0 ? value.length + idx : idx;
        if (real >= 0 && real < value.length) walk(value[real], after, `${currentPath}[${real}]`, results);
      } else if (isPlainObject(value) && hasOwn(value, selector)) {
        walk(value[selector], after, `${currentPath}['${selector}']`, results);
      }
      return;
    }

    throw new Error(`Unsupported selector: [${selector}]`);
  }

  throw new Error(`Unexpected token in path: ${remaining.slice(0, 10)}`);
}

/** `'key'` or `"key"` → `key`; anything else → null. */
function quotedKey(s: string): string | null {
  const m = s.match(/^'([^']*)'$/s) ?? s.match(/^"([^"]*)"$/s);
  return m ? m[1] : null;
}

/** Find the `]` matching the `[` at index 0, ignoring brackets inside quotes. */
function findClosingBracket(s: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function walkChildren(value: unknown, after: string, currentPath: string, results: JsonPathMatch[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, after, `${currentPath}[${i}]`, results));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walk(v, after, `${currentPath}.${k}`, results);
  }
}

function descend(value: unknown, path: string, currentPath: string, results: JsonPathMatch[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, path, `${currentPath}[${i}]`, results));
  } else if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) walk(v, path, `${currentPath}.${k}`, results);
  }
}

const FILTER_RE = /^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:(===?|!==?|>=?|<=?|=~)\s*("(?:[^"\\]|\\.){0,200}"|'(?:[^'\\]|\\.){0,200}'|\/[^/]{1,100}\/[gimsuy]*|true|false|null|-?\d+(?:\.\d+)?))?$/;

/** Evaluate a filter such as `@.price > 10`, `@.name == 'x'`, `@.active` (truthy) or `@.name =~ /^a/`. */
export function evaluateFilter(value: unknown, expr: string): boolean {
  if (expr.length > 300) return false;
  const m = expr.trim().match(FILTER_RE);
  if (!m) return false;
  const [, key, op, rawVal] = m;
  if (!isPlainObject(value)) return false;
  if (!hasOwn(value, key)) return false;
  const actual = value[key];

  if (op === undefined) return Boolean(actual);

  if (op === '=~') {
    const rm = rawVal.match(/^\/(.*)\/([gimsuy]*)$/);
    if (!rm || typeof actual !== 'string') return false;
    try { return new RegExp(rm[1], rm[2]).test(actual); } catch { return false; }
  }

  let expected: unknown;
  if ((rawVal.startsWith("'") && rawVal.endsWith("'")) || (rawVal.startsWith('"') && rawVal.endsWith('"'))) {
    expected = rawVal.slice(1, -1).replace(/\\(['"\\])/g, '$1');
  } else if (rawVal === 'true') expected = true;
  else if (rawVal === 'false') expected = false;
  else if (rawVal === 'null') expected = null;
  else expected = Number(rawVal);

  switch (op) {
    case '=': case '==': case '===': return actual === expected;
    case '!=': case '!==': return actual !== expected;
    case '>':  return typeof actual === typeof expected && (actual as number) > (expected as number);
    case '<':  return typeof actual === typeof expected && (actual as number) < (expected as number);
    case '>=': return typeof actual === typeof expected && (actual as number) >= (expected as number);
    case '<=': return typeof actual === typeof expected && (actual as number) <= (expected as number);
  }
  return false;
}
