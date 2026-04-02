import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

const output = vscode.window.createOutputChannel('JSON Pro');

export async function copyPath(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const text = document.getText();

  if (text.trim().length === 0) {
    return;
  }

  const offset = document.offsetAt(editor.selection.active);
  const location = jsoncParser.getLocation(text, offset);

  if (location.path.length === 0) {
    vscode.window.setStatusBarMessage('$(info) JSON Pro: Cursor is not inside a JSON value', 3000);
    return;
  }

  const path = buildDotPath(location.path);
  await vscode.env.clipboard.writeText(path);
  output.appendLine(`[pathFinder] Copied path: ${path}`);
  vscode.window.setStatusBarMessage(`$(clippy) JSON Pro: Copied: ${path}`, 4000);
}

function buildDotPath(segments: jsoncParser.JSONPath): string {
  let result = '';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      result += `[${segment}]`;
    } else {
      result += result === '' ? segment : `.${segment}`;
    }
  }
  return result;
}
