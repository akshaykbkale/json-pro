import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { parseJsonText } from './core/json';
import { flattenValue, unflattenValue, removeEmpty, renameKey, collectKeys } from './core/transforms';
import { getIndent, replaceDocumentText, statusMessage } from './editorUtils';

export async function flattenJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const flat = flattenValue(parseJsonText(text));
  await replaceDocumentText(editor.document, JSON.stringify(flat, null, getIndent(editor.document)));
  statusMessage('Flattened');
}

export async function unflattenJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const nested = unflattenValue(parseJsonText(text));
  await replaceDocumentText(editor.document, JSON.stringify(nested, null, getIndent(editor.document)));
  statusMessage('Unflattened');
}

export async function removeEmptyJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const cleaned = removeEmpty(parseJsonText(text));
  await replaceDocumentText(editor.document, JSON.stringify(cleaned, null, getIndent(editor.document)));
  statusMessage('Removed nulls & empty values');
}

export async function renameKeyJson(editor: vscode.TextEditor): Promise<void> {
  const text = editor.document.getText();
  if (!text.trim()) return;
  const parsed = parseJsonText(text);

  // Key under the cursor, if any, is offered first
  let cursorKey: string | undefined;
  try {
    const loc = jsoncParser.getLocation(text, editor.document.offsetAt(editor.selection.active));
    const last = loc.path[loc.path.length - 1];
    if (typeof last === 'string') cursorKey = last;
  } catch { /* ignore */ }

  const keys = collectKeys(parsed);
  if (keys.length === 0) {
    vscode.window.setStatusBarMessage('$(info) JSON Pro: No keys to rename', 3000);
    return;
  }
  const items: vscode.QuickPickItem[] = keys
    .sort((a, b) => (a === cursorKey ? -1 : b === cursorKey ? 1 : a.localeCompare(b)))
    .map(k => ({ label: k, description: k === cursorKey ? 'key at cursor' : undefined }));

  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Key to rename (all occurrences at any depth)' });
  if (!picked) return;
  const oldKey = picked.label;

  const newKey = await vscode.window.showInputBox({
    prompt: `Rename "${oldKey}" to:`,
    value: oldKey,
    valueSelection: [0, oldKey.length],
    validateInput: v => (v.trim().length === 0 ? 'Key cannot be empty' : v === oldKey ? 'Choose a different name' : undefined),
  });
  if (!newKey) return;

  const { result, count } = renameKey(parsed, oldKey, newKey);
  await replaceDocumentText(editor.document, JSON.stringify(result, null, getIndent(editor.document)));
  statusMessage(`Renamed "${oldKey}" → "${newKey}" (${count} occurrence${count === 1 ? '' : 's'})`);
}
