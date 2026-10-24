import { setOwn } from './json';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

// ── Flatten ───────────────────────────────────────────────────────────────────

/**
 * `{"a":{"b":1},"c":[1,2]}` → `{"a.b":1,"c[0]":1,"c[1]":2}`.
 * Empty objects/arrays are kept as leaf values so the transform round-trips.
 */
export function flattenValue(value: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const visit = (v: unknown, key: string): void => {
    if (Array.isArray(v) && v.length > 0) {
      v.forEach((item, i) => visit(item, `${key}[${i}]`));
    } else if (isPlainObject(v) && Object.keys(v).length > 0) {
      for (const [k, child] of Object.entries(v)) visit(child, key ? `${key}.${k}` : k);
    } else if (key) {
      setOwn(result, key, v);
    }
  };
  visit(value, prefix);
  return result;
}

// ── Unflatten ─────────────────────────────────────────────────────────────────

/** Inverse of `flattenValue`. Throws if the input is not an object. */
export function unflattenValue(flat: unknown): unknown {
  if (!isPlainObject(flat)) throw new Error('Input must be a flat JSON object (not an array)');
  const entries = Object.entries(flat).map(([path, value]) => ({ segments: parseDotPath(path), value }));
  if (entries.length === 0) return {};

  const rootIsArray = entries.every(e => typeof e.segments[0] === 'number');
  const root: Record<string, unknown> | unknown[] = rootIsArray ? [] : {};
  for (const { segments, value } of entries) {
    if (segments.length === 0) continue;
    setNestedValue(root, segments, value);
  }
  return root;
}

export function parseDotPath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const re = /\[(\d+)\]|\["((?:[^"\\]|\\.)*)"\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    let key: string | number;
    if (m[1] !== undefined) key = parseInt(m[1], 10);
    else if (m[2] !== undefined) key = JSON.parse(`"${m[2]}"`) as string;
    else key = m[3];
    segments.push(key);
  }
  return segments;
}

function setNestedValue(target: Record<string, unknown> | unknown[], segments: (string | number)[], value: unknown): void {
  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextIsIndex = typeof segments[i + 1] === 'number';
    const container = current as Record<string | number, unknown>;
    const existing = Object.prototype.hasOwnProperty.call(container, seg) ? container[seg] : undefined;
    if (existing === undefined || existing === null || typeof existing !== 'object') {
      setOwn(container, seg, nextIsIndex ? [] : {});
    }
    current = (container as Record<string | number, unknown>)[seg] as Record<string, unknown> | unknown[];
  }
  setOwn(current, segments[segments.length - 1], value);
}

// ── Remove empty ──────────────────────────────────────────────────────────────

/** Recursively strip `null`, `""`, `[]` and `{}` values (from objects and arrays alike). */
export function removeEmpty(value: unknown): unknown {
  const cleaned = strip(value);
  return cleaned === undefined ? (Array.isArray(value) ? [] : isPlainObject(value) ? {} : null) : cleaned;
}

function strip(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) {
    const arr = value.map(strip).filter(v => v !== undefined);
    return arr.length === 0 ? undefined : arr;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = strip(v);
      if (c !== undefined) setOwn(result, k, c);
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }
  return value;
}

// ── Rename key ────────────────────────────────────────────────────────────────

/** Rename every occurrence of `oldKey` (at any depth) to `newKey`. Returns the number of renames. */
export function renameKey(value: unknown, oldKey: string, newKey: string): { result: unknown; count: number } {
  let count = 0;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v)) {
        if (k === oldKey) count++;
        setOwn(out, k === oldKey ? newKey : k, visit(child));
      }
      return out;
    }
    return v;
  };
  return { result: visit(value), count };
}

/** Collect every distinct key in the document (useful for pickers). */
export function collectKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (isPlainObject(v)) for (const [k, child] of Object.entries(v)) { keys.add(k); visit(child); }
  };
  visit(value);
  return [...keys];
}
