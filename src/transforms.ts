import * as vscode from 'vscode';

function getIndent(): string | number {
  const cfg = vscode.workspace.getConfiguration('jsonPro');
  return cfg.get<boolean>('useTabs') ? '\t' : (cfg.get<number>('indentSize') ?? 2);
}

async function applyToEditor(editor: vscode.TextEditor, newText: string): Promise<void> {
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, fullRange, newText);
  await vscode.workspace.applyEdit(edit);
}

// ── Flatten ───────────────────────────────────────────────────────────────────

export async function flattenJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const parsed: unknown = JSON.parse(text);
  const flat = flattenValue(parsed, '');
  await applyToEditor(editor, JSON.stringify(flat, null, getIndent()));
  vscode.window.setStatusBarMessage('$(check) JSON Pro: Flattened', 3000);
}

function flattenValue(value: unknown, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      const key = prefix ? `${prefix}[${i}]` : `[${i}]`;
      if (v !== null && typeof v === 'object') {
        Object.assign(result, flattenValue(v, key));
      } else {
        result[key] = v;
      }
    });
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') {
        Object.assign(result, flattenValue(v, key));
      } else {
        result[key] = v;
      }
    }
  } else if (prefix) {
    result[prefix] = value;
  }

  return result;
}

// ── Unflatten ─────────────────────────────────────────────────────────────────

export async function unflattenJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Input must be a flat JSON object (not an array)');
  }
  const flat = parsed as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    setNestedValue(result, parseDotPath(path), value);
  }
  await applyToEditor(editor, JSON.stringify(result, null, getIndent()));
  vscode.window.setStatusBarMessage('$(check) JSON Pro: Unflattened', 3000);
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function parseDotPath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const re = /([^.[]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) {
      if (FORBIDDEN_KEYS.has(m[1])) {
        throw new Error(`Forbidden key in path: "${m[1]}"`);
      }
      segments.push(m[1]);
    } else {
      segments.push(parseInt(m[2], 10));
    }
  }
  return segments;
}

function setNestedValue(
  obj: Record<string, unknown>,
  segments: (string | number)[],
  value: unknown
): void {
  let current: Record<string, unknown> | unknown[] = obj;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    const nextIsIndex = typeof nextSeg === 'number';

    if (typeof seg === 'number') {
      const arr = current as unknown[];
      if (arr[seg] === undefined || arr[seg] === null) {
        arr[seg] = nextIsIndex ? [] : {};
      }
      current = arr[seg] as Record<string, unknown> | unknown[];
    } else {
      const o = current as Record<string, unknown>;
      if (o[seg] === undefined || o[seg] === null) {
        o[seg] = nextIsIndex ? [] : {};
      }
      current = o[seg] as Record<string, unknown> | unknown[];
    }
  }

  const last = segments[segments.length - 1];
  if (typeof last === 'number') {
    (current as unknown[])[last] = value;
  } else {
    (current as Record<string, unknown>)[last] = value;
  }
}

// ── Remove Empty ──────────────────────────────────────────────────────────────

export async function removeEmptyJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const parsed: unknown = JSON.parse(text);
  const cleaned = removeEmpty(parsed);
  await applyToEditor(editor, JSON.stringify(cleaned, null, getIndent()));
  vscode.window.setStatusBarMessage('$(check) JSON Pro: Removed nulls & empty values', 3000);
}

function removeEmpty(value: unknown): unknown {
  if (value === null || value === undefined || value === '') return undefined;

  if (Array.isArray(value)) {
    const arr = value.map(removeEmpty).filter(v => v !== undefined);
    return arr;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = removeEmpty(v);
      if (cleaned === undefined) continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (typeof cleaned === 'object' && cleaned !== null && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      result[k] = cleaned;
    }
    return result;
  }

  return value;
}

// ── Rename Key ────────────────────────────────────────────────────────────────

export async function renameKeyJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;

  // Try to determine key at cursor using jsonc-parser
  let suggestedKey = '';
  try {
    const jsoncParser = await import('jsonc-parser');
    const offset = editor.document.offsetAt(editor.selection.active);
    const loc = jsoncParser.getLocation(text, offset);
    const last = loc.path[loc.path.length - 1];
    if (typeof last === 'string') suggestedKey = last;
  } catch { /* ignore */ }

  const oldKey = await vscode.window.showInputBox({
    prompt: 'Key to rename (renames all occurrences)',
    value: suggestedKey,
    placeHolder: 'e.g. firstName',
  });
  if (!oldKey) return;

  const newKey = await vscode.window.showInputBox({
    prompt: `Rename "${oldKey}" to:`,
    placeHolder: 'e.g. first_name',
  });
  if (!newKey) return;

  const parsed: unknown = JSON.parse(text);
  const result = renameKeyRecursive(parsed, oldKey, newKey);
  await applyToEditor(editor, JSON.stringify(result, null, getIndent()));
  vscode.window.setStatusBarMessage(`$(check) JSON Pro: Renamed "${oldKey}" → "${newKey}"`, 3000);
}

function renameKeyRecursive(value: unknown, oldKey: string, newKey: string): unknown {
  if (Array.isArray(value)) {
    return value.map(v => renameKeyRecursive(v, oldKey, newKey));
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k === oldKey ? newKey : k] = renameKeyRecursive(v, oldKey, newKey);
    }
    return result;
  }
  return value;
}
