import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { buildDotPath } from './core/path';
import { isJsonDocument, isLargeDocument } from './editorUtils';

export function registerBreadcrumb(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem('jsonPro.breadcrumb', vscode.StatusBarAlignment.Left, 90);
  item.name = 'JSON Pro: Current path';
  item.command = 'jsonPro.copyPath';
  item.tooltip = 'Current JSON path — click to copy';
  context.subscriptions.push(item);

  const update = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonDocument(editor.document) || isLargeDocument(editor.document)) { item.hide(); return; }

    const text = editor.document.getText();
    if (!text.trim()) { item.hide(); return; }

    try {
      const loc = jsoncParser.getLocation(text, editor.document.offsetAt(editor.selection.active));
      item.text = `$(json) ${buildDotPath(loc.path) || '$'}`;
      item.show();
    } catch {
      item.hide();
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => { if (e.textEditor === vscode.window.activeTextEditor) update(); }),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument(e => { if (e.document === vscode.window.activeTextEditor?.document) update(); })
  );
  update();
}
