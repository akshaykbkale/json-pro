import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { parseJsonText } from './core/json';
import { buildDotPath, PathSegment } from './core/path';
import { reportError } from './editorUtils';

const MAX_ITEMS = 20_000;

interface SearchItem extends vscode.QuickPickItem { segments: PathSegment[] }

/** Fuzzy-search keys and values in a QuickPick; selecting a match jumps to it. */
export async function searchJson(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const text = document.getText();
  if (text.trim().length === 0) return;

  let parsed: unknown;
  try { parsed = parseJsonText(text); }
  catch (e) { reportError('search', e, editor); return; }

  const items: SearchItem[] = [];
  collect(parsed, [], items);
  if (items.length === 0) {
    vscode.window.setStatusBarMessage('$(info) JSON Pro: Nothing to search', 3000);
    return;
  }

  const truncated = items.length > MAX_ITEMS;
  const selected = await vscode.window.showQuickPick(truncated ? items.slice(0, MAX_ITEMS) : items, {
    matchOnDescription: true,
    placeHolder: truncated
      ? `Type to search keys and values (showing first ${MAX_ITEMS.toLocaleString()} of ${items.length.toLocaleString()} entries)`
      : `Type to search ${items.length.toLocaleString()} keys and values`,
  });
  if (!selected) return;

  const root = jsoncParser.parseTree(text, [], { allowTrailingComma: true });
  const node = root ? jsoncParser.findNodeAtLocation(root, selected.segments) : undefined;
  if (!node) return;

  const target = node.parent?.type === 'property' ? node.parent : node;
  const pos = document.positionAt(target.offset);
  const end = document.positionAt(node.offset + node.length);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, end), vscode.TextEditorRevealType.InCenter);
}

function collect(value: unknown, segments: PathSegment[], items: SearchItem[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, [...segments, i], items));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) collect(v, [...segments, k], items);
  } else if (segments.length > 0) {
    const preview = typeof value === 'string' ? value : JSON.stringify(value);
    items.push({
      label: buildDotPath(segments),
      description: preview.length > 120 ? preview.slice(0, 120) + '…' : preview,
      segments,
    });
  }
}
