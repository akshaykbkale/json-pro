/**
 * Best-effort repair of almost-JSON (JS object literals, JSON5-ish input, Python dumps,
 * hand-edited files). Works as a single-pass scanner so that string contents are never
 * touched — `"http://example.com"` and `"it's"` survive intact.
 *
 * Repairs performed:
 *  - strips `//`, `/* *\/` and `#` comments
 *  - converts single-quoted strings to double-quoted (re-escaping as needed)
 *  - quotes unquoted object keys (`{ key: 1 }` → `{ "key": 1 }`)
 *  - removes trailing commas and duplicate commas
 *  - inserts missing commas between items and missing colons after keys
 *  - normalises `True/False/None/undefined/NaN` and other bare words
 *  - fixes numbers such as `+1`, `.5`, `5.`
 *  - escapes raw tab/control characters inside strings; closes strings left open at end of line
 *  - drops stray closing brackets and appends any missing closing brackets
 *
 * The result is not guaranteed to be valid — callers must validate it.
 */
export function fixJsonText(input: string): string {
  const text = input.replace(/^\uFEFF/, '');
  const n = text.length;
  const out: string[] = [];

  type Expect = 'key' | 'colon' | 'value' | 'next';
  interface Ctx { type: 'object' | 'array'; expect: Expect }
  const stack: Ctx[] = [];
  const top = (): Ctx | undefined => stack[stack.length - 1];

  const isWs = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c);
  const isIdentChar = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);
  const isDigit = (c: string): boolean => c >= '0' && c <= '9';

  /** Index of the next character that is not whitespace or a comment. */
  function nextSignificant(j: number): number {
    while (j < n) {
      const c = text[j];
      if (isWs(c)) { j++; continue; }
      if (c === '#' || (c === '/' && text[j + 1] === '/')) {
        while (j < n && text[j] !== '\n') j++;
        continue;
      }
      if (c === '/' && text[j + 1] === '*') {
        const end = text.indexOf('*/', j + 2);
        j = end === -1 ? n : end + 2;
        continue;
      }
      break;
    }
    return j;
  }

  /** Called before emitting a token that begins a key or a value. Inserts missing `,` / `:`. */
  function beforeToken(): void {
    const t = top();
    if (!t) return;
    if (t.expect === 'next') {
      out.push(',');
      t.expect = t.type === 'object' ? 'key' : 'value';
    } else if (t.expect === 'colon') {
      out.push(':');
      t.expect = 'value';
    }
  }
  const inKeyPosition = (): boolean => { const t = top(); return !!t && t.type === 'object' && t.expect === 'key'; };
  function afterToken(wasKey: boolean): void {
    const t = top();
    if (t) t.expect = wasKey ? 'colon' : 'next';
  }

  /** Read a string starting at `i` (which holds the opening quote). Returns the JSON string and end index. */
  function readString(i: number, quote: string): [string, number] {
    let j = i + 1;
    let s = '"';
    while (j < n) {
      const ch = text[j];
      if (ch === '\\') {
        const nx = text[j + 1];
        if (nx === undefined) { j++; break; }
        if (nx === "'") s += "'";
        else if (nx === '"') s += '\\"';
        else if (nx === '\n') { /* line continuation → drop */ }
        else if (/[\\/bfnrtu]/.test(nx)) s += '\\' + nx;
        else s += nx; // invalid escape such as \x → keep the character
        j += 2;
        continue;
      }
      if (ch === quote) { j++; break; }
      if (ch === '\n' || ch === '\r') break; // unterminated string → close it here
      if (ch === '"') s += '\\"';
      else if (ch === '\t') s += '\\t';
      else if (ch < ' ') s += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      else s += ch;
      j++;
    }
    return [s + '"', j];
  }

  function normalizeNumber(raw: string): string {
    let num = raw.replace(/^\+/, '');
    if (/^-?\./.test(num)) num = num.replace('.', '0.');
    if (/\.$/.test(num)) num = num.slice(0, -1);
    num = num.replace(/\.(?=[eE])/, '');
    num = num.replace(/^(-?)0+(?=\d)/, '$1');
    return num;
  }

  let i = 0;
  while (i < n) {
    const c = text[i];

    if (isWs(c)) { out.push(c); i++; continue; }

    // Comments
    if (c === '#' || (c === '/' && text[i + 1] === '/')) {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // Strings (double or single quoted)
    if (c === '"' || c === "'") {
      beforeToken();
      const wasKey = inKeyPosition();
      const [str, end] = readString(i, c);
      out.push(str);
      afterToken(wasKey);
      i = end;
      continue;
    }

    // Containers
    if (c === '{' || c === '[') {
      beforeToken();
      out.push(c);
      stack.push(c === '{' ? { type: 'object', expect: 'key' } : { type: 'array', expect: 'value' });
      i++;
      continue;
    }
    if (c === '}' || c === ']') {
      const t = stack.pop();
      if (t) {
        out.push(t.type === 'object' ? '}' : ']'); // repairs mismatched closers too
        afterToken(false);
      }
      i++; // stray closer with nothing open → dropped
      continue;
    }

    if (c === ',') {
      const j = nextSignificant(i + 1);
      const nc = text[j];
      const t = top();
      const trailing = j >= n || nc === '}' || nc === ']';
      if (!trailing && t && t.expect === 'next') {
        out.push(',');
        t.expect = t.type === 'object' ? 'key' : 'value';
      }
      i++; // trailing, duplicate or stray comma → dropped
      continue;
    }

    if (c === ':') {
      const t = top();
      if (t && t.expect === 'colon') { out.push(':'); t.expect = 'value'; }
      i++;
      continue;
    }

    // Numbers
    if (isDigit(c) || c === '-' || c === '+' || (c === '.' && isDigit(text[i + 1] ?? ''))) {
      let j = i + 1;
      while (j < n && /[0-9eE+\-.]/.test(text[j])) j++;
      const raw = text.slice(i, j);
      if (!/\d/.test(raw)) { i = j; continue; } // a lone '-' or '+' → dropped
      beforeToken();
      const wasKey = inKeyPosition();
      const num = normalizeNumber(raw);
      out.push(wasKey ? JSON.stringify(num) : num);
      afterToken(wasKey);
      i = j;
      continue;
    }

    // Bare words: unquoted keys, literals, Python/JS constants
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(text[j])) j++;
      const word = text.slice(i, j);
      beforeToken();
      const wasKey = inKeyPosition();
      if (wasKey) {
        out.push(JSON.stringify(word));
      } else {
        const lower = word.toLowerCase();
        if (lower === 'true' || lower === 'false') out.push(lower);
        else if (lower === 'null' || lower === 'none' || lower === 'undefined' || lower === 'nan' || lower === 'nil') out.push('null');
        else if (lower === 'infinity') out.push('null');
        else out.push(JSON.stringify(word));
      }
      afterToken(wasKey);
      i = j;
      continue;
    }

    // Anything else is noise → dropped
    i++;
  }

  let result = out.join('');
  if (stack.length > 0) {
    result = result.trimEnd();
    while (stack.length > 0) {
      const t = stack.pop()!;
      result += t.type === 'object' ? '}' : ']';
    }
  }
  return result;
}
