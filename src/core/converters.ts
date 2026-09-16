// ── TypeScript interface generator ───────────────────────────────────────────

interface PropInfo { types: Set<string>; count: number }
interface Shape { props: Map<string, PropInfo>; order: string[]; count: number }

/**
 * Infer `export interface` declarations from a JSON value.
 * Objects that share a name are merged: properties missing from some occurrences
 * become optional and conflicting value types become unions.
 */
export function jsonToTypeScript(value: unknown, rootName = 'Root'): string {
  const shapes = new Map<string, Shape>();
  const rootType = inferType(rootName, value, shapes);

  const parts: string[] = [];
  if (!shapes.has(toPascalCase(rootName))) {
    parts.push(`export type ${toPascalCase(rootName)} = ${rootType};`);
  }
  for (const [name, shape] of shapes) {
    const lines = [`export interface ${name} {`];
    for (const key of shape.order) {
      const info = shape.props.get(key)!;
      const optional = info.count < shape.count ? '?' : '';
      lines.push(`  ${safePropertyName(key)}${optional}: ${unionOf(info.types)};`);
    }
    lines.push('}');
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n') + '\n';
}

function inferType(name: string, value: unknown, shapes: Map<string, Shape>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const itemName = singularize(name);
    const elementTypes = new Set(value.map(v => inferType(itemName, v, shapes)));
    const union = unionOf(elementTypes);
    return elementTypes.size === 1 && !union.includes(' ') ? `${union}[]` : `(${union})[]`;
  }

  if (typeof value === 'object') {
    const interfaceName = toPascalCase(name) || 'Item';
    let shape = shapes.get(interfaceName);
    if (!shape) {
      shape = { props: new Map(), order: [], count: 0 };
      shapes.set(interfaceName, shape);
    }
    shape.count++;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      let info = shape.props.get(key);
      if (!info) {
        info = { types: new Set(), count: 0 };
        shape.props.set(key, info);
        shape.order.push(key);
      }
      info.count++;
      info.types.add(inferType(key, val, shapes));
    }
    return interfaceName;
  }
  return 'unknown';
}

function unionOf(types: Set<string>): string {
  const list = [...types];
  if (list.length === 0) return 'unknown';
  // `unknown[]` adds nothing next to a typed array
  const filtered = list.length > 1 ? list.filter(t => t !== 'unknown[]') : list;
  const ordered = [...filtered.filter(t => t !== 'null'), ...filtered.filter(t => t === 'null')];
  return ordered.join(' | ');
}

function safePropertyName(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

export function toPascalCase(str: string): string {
  const cleaned = str.replace(/[^A-Za-z0-9_$ -]/g, ' ');
  const pascal = cleaned
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return /^[0-9]/.test(pascal) ? `_${pascal}` : pascal;
}

/** Naive English singularisation used to name array element interfaces (`users` → `User`). */
export function singularize(name: string): string {
  const pascal = toPascalCase(name);
  if (/[^s]ies$/i.test(pascal)) return pascal.slice(0, -3) + 'y';
  if (/(ss|us|is)es$/i.test(pascal)) return pascal.slice(0, -2);
  if (/(sh|ch|x|z)es$/i.test(pascal)) return pascal.slice(0, -2);
  if (/[^s]s$/i.test(pascal) && pascal.length > 2) return pascal.slice(0, -1);
  return pascal + 'Item';
}

// ── JSON → YAML ───────────────────────────────────────────────────────────────

export function jsonToYaml(value: unknown): string {
  const result = serializeYaml(value, 0);
  return (result.startsWith('\n') ? result.slice(1) : result) + '\n';
}

function serializeYaml(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth);

  if (value === null || value === undefined) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';

  if (typeof value === 'string') {
    if (value.includes('\n') && !/[\r\t]/.test(value) && !/^\s|[ \t]$/m.test(value)) {
      const chomp = value.endsWith('\n') ? '' : '-';
      const body = value.replace(/\n$/, '');
      const lines = body.split('\n').map(l => (l === '' ? '' : `${pad}${l}`)).join('\n');
      return `|${chomp}\n${lines}`;
    }
    return needsYamlQuoting(value) ? JSON.stringify(value) : value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map(item => {
      const s = serializeYaml(item, depth + 1);
      return `${pad}- ${s.startsWith('\n') ? s.slice(1).trimStart() : s}`;
    }).join('\n');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return '\n' + keys.map(key => {
      const yamlKey = needsYamlQuoting(key) ? JSON.stringify(key) : key;
      const val = obj[key];
      const s = serializeYaml(val, depth + 1);
      if (s.startsWith('\n')) return `${pad}${yamlKey}:${s}`;
      return `${pad}${yamlKey}: ${s}`;
    }).join('\n');
  }

  return String(value);
}

export function needsYamlQuoting(s: string): boolean {
  if (s === '') return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[\d+\-.]/.test(s)) return true;
  if (/^(0x|0o|0b)/i.test(s)) return true;
  if (/[:#[\]{}|>&*!,?@`'"\\%]/.test(s)) return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/[\x00-\x1f\x7f]/.test(s)) return true;
  return false;
}

// ── Escape / Unescape ─────────────────────────────────────────────────────────

/** Wrap raw text as a JSON string literal. */
export function escapeJsonString(text: string): string {
  return JSON.stringify(text);
}

/** Parse a JSON string literal back to raw text. */
export function unescapeJsonString(text: string): string {
  const t = text.trim();
  if (!t.startsWith('"')) {
    throw new Error('Content must be a JSON string value (starting with a double quote)');
  }
  const unescaped: unknown = JSON.parse(t);
  if (typeof unescaped !== 'string') throw new Error('Parsed value is not a string');
  return unescaped;
}
