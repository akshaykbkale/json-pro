export interface MergeResult {
  type: 'success' | 'error';
  merged?: string;
  side?: 'left' | 'right';
  message?: string;
}

export type ArrayStrategy = 'concat' | 'replace';

import { parseJsonText, setOwn } from './json';

/** Parse both sides and deep-merge them. Right wins on scalar conflicts. */
export function computeMerge(leftText: string, rightText: string, arrays: ArrayStrategy = 'concat', indent: number | string = 2): MergeResult {
  let left: unknown;
  let right: unknown;
  try { left = parseJsonText(leftText); }
  catch (e) { return { type: 'error', side: 'left', message: e instanceof Error ? e.message : String(e) }; }
  try { right = parseJsonText(rightText); }
  catch (e) { return { type: 'error', side: 'right', message: e instanceof Error ? e.message : String(e) }; }
  return { type: 'success', merged: JSON.stringify(deepMerge(left, right, arrays), null, indent) };
}

export function deepMerge(left: unknown, right: unknown, arrays: ArrayStrategy = 'concat'): unknown {
  if (Array.isArray(left) && Array.isArray(right)) {
    return arrays === 'concat' ? [...left, ...right] : right;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(left)) setOwn(result, key, val);
    for (const [key, val] of Object.entries(right)) {
      setOwn(result, key, Object.prototype.hasOwnProperty.call(result, key) ? deepMerge(result[key], val, arrays) : val);
    }
    return result;
  }
  return right;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
