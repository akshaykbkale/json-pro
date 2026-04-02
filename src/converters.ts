import * as vscode from 'vscode';

function getIndent(): string | number {
  const cfg = vscode.workspace.getConfiguration('jsonPro');
  return cfg.get<boolean>('useTabs') ? '\t' : (cfg.get<number>('indentSize') ?? 2);
}

// ── TypeScript Interface Generator ───────────────────────────────────────────

export function jsonToTypeScript(text: string): string {
  const parsed: unknown = JSON.parse(text);
  const interfaces = new Map<string, string>();
  inferType('Root', parsed, interfaces);

  // Root first, then alphabetical
  const parts: string[] = [];
  const root = interfaces.get('Root');
  if (root) parts.push(root);
  for (const [name, body] of interfaces) {
    if (name !== 'Root') parts.push(body);
  }
  return parts.join('\n\n');
}

function inferType(
  name: string,
  value: unknown,
  interfaces: Map<string, string>
): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const elementTypes = [...new Set(
      value.map(v => inferType(toPascalCase(name) + 'Item', v, interfaces))
    )];
    const elementType = elementTypes.length === 1
      ? elementTypes[0]
      : `(${elementTypes.join(' | ')})`;
    return `${elementType}[]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const interfaceName = toPascalCase(name);

    if (!interfaces.has(interfaceName)) {
      interfaces.set(interfaceName, ''); // reserve to prevent infinite recursion

      const lines: string[] = [`export interface ${interfaceName} {`];
      for (const [key, val] of Object.entries(obj)) {
        const safeProp = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
        const propType = inferType(toPascalCase(key), val, interfaces);
        lines.push(`  ${safeProp}: ${propType};`);
      }
      lines.push('}');
      interfaces.set(interfaceName, lines.join('\n'));
    }
    return interfaceName;
  }

  return 'unknown';
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (_, c: string) => c.toUpperCase());
}

// ── JSON → YAML ───────────────────────────────────────────────────────────────

export function jsonToYaml(text: string): string {
  const parsed: unknown = JSON.parse(text);
  const result = serializeYaml(parsed, 0);
  // Root-level objects/arrays don't get a leading newline
  return result.startsWith('\n') ? result.slice(1) : result;
}

function serializeYaml(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth);

  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') return String(value);

  if (typeof value === 'string') {
    if (value.includes('\n')) {
      const lines = value.split('\n').map(l => `${pad}  ${l}`).join('\n');
      return `|\n${lines}`;
    }
    return needsYamlQuoting(value) ? JSON.stringify(value) : value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '\n' + value.map(item => {
      const s = serializeYaml(item, depth + 1);
      const inline = s.startsWith('\n') ? s : ` ${s}`;
      return `${pad}- ${inline.trimStart()}`;
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
      if (typeof val === 'object' && val !== null) {
        return `${pad}${yamlKey}:${s.startsWith('\n') ? s : '\n' + s}`;
      }
      return `${pad}${yamlKey}: ${s}`;
    }).join('\n');
  }

  return String(value);
}

function needsYamlQuoting(s: string): boolean {
  if (s === '') return true;
  if (/^(true|false|null|yes|no|on|off)$/i.test(s)) return true;
  if (/^[\d+\-.]/.test(s)) return true;
  if (/[:#\[\]{}|>&*!,?@`'"\\]/.test(s)) return true;
  if (/^\s|\s$/.test(s)) return true;
  return false;
}

// ── Escape / Unescape ─────────────────────────────────────────────────────────

export function escapeJsonString(text: string): string {
  return JSON.stringify(text);
}

export function unescapeJsonString(text: string): string {
  const t = text.trim();
  if (!t.startsWith('"')) {
    throw new Error('Content must be a JSON string value (starts with ")');
  }
  const unescaped = JSON.parse(t);
  if (typeof unescaped !== 'string') {
    throw new Error('Parsed value is not a string');
  }
  return unescaped;
}

// ── Open result in new editor tab ─────────────────────────────────────────────

export async function openInNewTab(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
