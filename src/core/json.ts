import {
  parseTree,
  format,
  applyEdits,
  createScanner,
  SyntaxKind,
  ParseError,
  ParseErrorCode,
} from 'jsonc-parser';

/** Options controlling how lenient parsing/validation is. */
export interface JsonOptions {
  /** Allow line and block comments (JSONC). Default: true for commands, false for strict validation. */
  allowComments?: boolean;
  /** Allow a trailing comma before `}` or `]`. */
  allowTrailingComma?: boolean;
}

/** A parse problem with a precise document offset. */
export interface JsonProblem {
  offset: number;
  length: number;
  message: string;
}

export class JsonParseError extends Error {
  constructor(message: string, public readonly offset: number, public readonly length: number) {
    super(message);
    this.name = 'JsonParseError';
  }
}

const LENIENT: Required<JsonOptions> = { allowComments: true, allowTrailingComma: true };

/**
 * Parse JSON text into a value. Lenient by default (comments and trailing commas
 * are tolerated) so commands work on JSONC files such as `settings.json`.
 * Throws a `JsonParseError` with a human-readable message on failure.
 */
export function parseJsonText(text: string, options: JsonOptions = LENIENT): unknown {
  const problems = validateJsonText(text, options);
  if (problems.length > 0) {
    const p = problems[0];
    throw new JsonParseError(p.message, p.offset, p.length);
  }
  // JSON.parse (unlike jsonc-parser's parse) creates an own "__proto__" property instead of
  // assigning the prototype, so such keys round-trip instead of silently vanishing.
  return JSON.parse(minifyTokens(text));
}

/** Define an own, enumerable property — safe for keys such as "__proto__". */
export function setOwn(target: object, key: string | number, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Validate JSON text and return every problem found (empty array when valid). */
export function validateJsonText(text: string, options: JsonOptions = {}): JsonProblem[] {
  if (text.trim().length === 0) {
    return [{ offset: 0, length: 0, message: 'Document is empty — expected a JSON value' }];
  }
  const errors: ParseError[] = [];
  parseTree(text, errors, {
    allowTrailingComma: options.allowTrailingComma ?? false,
    disallowComments: !(options.allowComments ?? false),
  });
  return dedupe(errors.map(e => describeParseError(e, text)));
}

function dedupe(problems: JsonProblem[]): JsonProblem[] {
  const seen = new Set<string>();
  return problems.filter(p => {
    const key = `${p.offset}:${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Turn a jsonc-parser error into a human-readable problem with a sensible range. */
export function describeParseError(err: ParseError, text: string): JsonProblem {
  const length = Math.max(err.length, 1);
  let offset = Math.min(err.offset, Math.max(text.length - 1, 0));

  // A trailing comma surfaces as "property name / value expected" at the closing bracket.
  if (err.error === ParseErrorCode.PropertyNameExpected || err.error === ParseErrorCode.ValueExpected) {
    const prev = previousSignificantIndex(text, err.offset);
    if (prev !== -1 && text[prev] === ',') {
      return { offset: prev, length: 1, message: 'Trailing comma — remove the last comma before } or ]' };
    }
  }

  switch (err.error) {
    case ParseErrorCode.InvalidSymbol:
      return { offset, length, message: `Unexpected token '${snippet(text, err.offset, length)}' — check for missing quotes or commas` };
    case ParseErrorCode.InvalidNumberFormat:
      return { offset, length, message: 'Invalid number — JSON numbers cannot have leading zeros, a leading +, or a trailing dot' };
    case ParseErrorCode.PropertyNameExpected:
      return { offset, length, message: 'Property name expected — keys must be wrapped in double quotes' };
    case ParseErrorCode.ValueExpected:
      return { offset, length, message: 'Value expected' };
    case ParseErrorCode.ColonExpected:
      return { offset, length, message: 'Missing colon after property name' };
    case ParseErrorCode.CommaExpected:
      return { offset, length, message: 'Missing comma between items' };
    case ParseErrorCode.CloseBraceExpected:
      return { offset, length, message: 'Missing closing brace }' };
    case ParseErrorCode.CloseBracketExpected:
      return { offset, length, message: 'Missing closing bracket ]' };
    case ParseErrorCode.EndOfFileExpected:
      return { offset, length, message: 'Unexpected content after the end of the JSON value' };
    case ParseErrorCode.InvalidCommentToken:
      return { offset, length, message: 'Comments are not allowed in JSON (use a .jsonc file or run Auto-Fix)' };
    case ParseErrorCode.UnexpectedEndOfComment:
      return { offset, length, message: 'Unterminated comment — missing closing */' };
    case ParseErrorCode.UnexpectedEndOfString:
      return { offset, length, message: 'Unterminated string — missing closing double quote' };
    case ParseErrorCode.UnexpectedEndOfNumber:
      return { offset, length, message: 'Incomplete number' };
    case ParseErrorCode.InvalidUnicode:
      return { offset, length, message: 'Invalid unicode escape — expected \\uXXXX' };
    case ParseErrorCode.InvalidEscapeCharacter:
      return { offset, length, message: 'Invalid escape sequence in string' };
    case ParseErrorCode.InvalidCharacter:
      return { offset, length, message: 'Invalid control character in string — escape it (e.g. \\n, \\t)' };
    default:
      return { offset, length, message: 'Invalid JSON' };
  }
}

function previousSignificantIndex(text: string, from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    const c = text[i];
    if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return i;
  }
  return -1;
}

function snippet(text: string, offset: number, length: number): string {
  return text.slice(offset, offset + Math.min(length, 20)).replace(/\s+/g, ' ');
}

/** Indentation: a number of spaces, or a literal tab string. */
export type Indent = number | '\t';

/**
 * Pretty-print JSON text. Comments, key order and number spelling are preserved
 * (e.g. `74.0` stays `74.0`), so this is safe on JSONC files. Throws on invalid input.
 */
export function formatJsonText(text: string, indent: Indent = 2, eol = '\n'): string {
  const problems = validateJsonText(text, LENIENT);
  if (problems.length > 0) throw new JsonParseError(problems[0].message, problems[0].offset, problems[0].length);
  const edits = format(text, undefined, {
    tabSize: indent === '\t' ? 4 : indent,
    insertSpaces: indent !== '\t',
    eol,
  });
  return applyEdits(text, edits).trim();
}

/**
 * Collapse JSON to a single line. Whitespace, comments and trailing commas are dropped;
 * everything else (including number spelling) is preserved verbatim.
 */
export function minifyJsonText(text: string): string {
  const problems = validateJsonText(text, LENIENT);
  if (problems.length > 0) throw new JsonParseError(problems[0].message, problems[0].offset, problems[0].length);
  return minifyTokens(text);
}

/** Re-emit every non-trivia token, skipping comments, whitespace and trailing commas. Assumes valid input. */
function minifyTokens(text: string): string {
  const scanner = createScanner(text, /* ignoreTrivia */ true);
  const out: string[] = [];
  let pendingComma = false;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EOF; kind = scanner.scan()) {
    if (kind === SyntaxKind.CommaToken) { pendingComma = true; continue; }
    const closing = kind === SyntaxKind.CloseBraceToken || kind === SyntaxKind.CloseBracketToken;
    if (pendingComma && !closing) out.push(',');
    pendingComma = false;
    out.push(text.substr(scanner.getTokenOffset(), scanner.getTokenLength()));
  }
  return out.join('');
}

/** Recursively sort object keys (arrays keep their order) and re-serialize. */
export function sortKeysJsonText(text: string, indent: Indent = 2): string {
  const parsed = parseJsonText(text);
  return JSON.stringify(sortValue(parsed), null, indent);
}

export function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) setOwn(sorted, key, sortValue(obj[key]));
    return sorted;
  }
  return value;
}
