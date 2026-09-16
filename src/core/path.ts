/** A JSON path as produced by jsonc-parser: object keys and array indices. */
export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Render a path in dot notation, e.g. `users[0].address.city`.
 * Keys that are not plain identifiers are bracket-quoted: `data["first name"]`.
 */
export function buildDotPath(segments: readonly PathSegment[]): string {
  let result = '';
  for (const seg of segments) {
    if (typeof seg === 'number') {
      result += `[${seg}]`;
    } else if (IDENTIFIER.test(seg)) {
      result += result === '' ? seg : `.${seg}`;
    } else {
      result += `[${JSON.stringify(seg)}]`;
    }
  }
  return result;
}

/** Render a path in JSONPath notation, e.g. `$.users[0].name`. */
export function buildJsonPath(segments: readonly PathSegment[]): string {
  const dot = buildDotPath(segments);
  if (dot === '') return '$';
  return dot.startsWith('[') ? `$${dot}` : `$.${dot}`;
}
