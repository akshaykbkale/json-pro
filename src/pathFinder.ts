import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { buildDotPath, buildJsonPath } from './core/path';
import { getOutputChannel } from './outputChannel';

/** Copy the path of the value under the cursor to the clipboard. */
export async function copyPath(editor: vscode.TextEditor, style: 'dot' | 'jsonpath' = 'dot'): Promise<void> {
  const document = editor.document;
  const text = document.getText();
  if (text.trim().length === 0) return;

  const offset = document.offsetAt(editor.selection.active);
  const location = jsoncParser.getLocation(text, offset);
  if (location.path.length === 0) {
    vscode.window.setStatusBarMessage('$(info) JSON Pro: Cursor is not inside a JSON value', 3000);
    return;
  }

  const path = style === 'jsonpath' ? buildJsonPath(location.path) : buildDotPath(location.path);
  await vscode.env.clipboard.writeText(path);
  getOutputChannel().appendLine(`[pathFinder] Copied path: ${path}`);
  vscode.window.setStatusBarMessage(`$(clippy) JSON Pro: Copied ${path}`, 4000);
}
