import * as vscode from 'vscode';
import { getOutputChannel } from './outputChannel';

const output = getOutputChannel();

export async function searchJson(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const text = document.getText();

  if (text.trim().length === 0) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    vscode.window.setStatusBarMessage('$(error) JSON Pro: Invalid JSON — cannot search', 4000);
    return;
  }

  const flat = flattenJson(parsed);
  if (Object.keys(flat).length === 0) {
    vscode.window.setStatusBarMessage('$(info) JSON Pro: Nothing to search', 3000);
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: 'Search JSON keys and values',
    placeHolder: 'e.g. name or John',
  });

  if (query === undefined || query.trim() === '') {
    return;
  }

  const q = query.toLowerCase();
  const matches = Object.entries(flat).filter(([key, value]) => {
    return (
      key.toLowerCase().includes(q) ||
      (typeof value === 'string' && value.toLowerCase().includes(q)) ||
      String(value).toLowerCase().includes(q)
    );
  });

  if (matches.length === 0) {
    vscode.window.setStatusBarMessage(`$(search) JSON Pro: No matches for "${query}"`, 3000);
    return;
  }

  const items: vscode.QuickPickItem[] = matches.map(([key, value]) => ({
    label: key,
    description: String(value),
  }));

  const selected = await vscode.window.showQuickPick(items, {
    matchOnDescription: true,
    placeHolder: `${matches.length} match(es) — select to navigate`,
  });

  if (!selected) {
    return;
  }

  // Find the key in the document text
  const keyToFind = selected.label;
  const offset = findKeyOffset(text, keyToFind);

  if (offset === -1) {
    output.appendLine(`[search] Could not locate key "${keyToFind}" in document`);
    return;
  }

  const pos = document.positionAt(offset);
  const range = new vscode.Range(pos, pos);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function flattenJson(
  value: unknown,
  prefix = '',
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    if (prefix) result[prefix] = value;
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      flattenJson(item, prefix ? `${prefix}[${i}]` : `[${i}]`, result);
    });
    return result;
  }
  const obj = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    flattenJson(v, prefix ? `${prefix}.${k}` : k, result);
  }
  return result;
}

function findKeyOffset(text: string, dotPath: string): number {
  // Extract the leaf key (last segment) to search in raw text
  const segments = dotPath.split(/\.|\[(\d+)\]/).filter(Boolean);
  const leafKey = segments[segments.length - 1];

  // Search for "leafKey": in the text
  const keyPattern = new RegExp(`"${escapeRegex(leafKey)}"\\s*:`, 'g');
  const match = keyPattern.exec(text);
  return match ? match.index : -1;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
