import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

export function registerBreadcrumb(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  item.command = 'jsonPro.copyPath';
  item.tooltip = 'Current JSON path — click to copy';
  context.subscriptions.push(item);

  const update = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { item.hide(); return; }

    const { languageId } = editor.document;
    if (languageId !== 'json' && languageId !== 'jsonc') { item.hide(); return; }

    const text = editor.document.getText();
    if (!text.trim()) { item.hide(); return; }

    const offset = editor.document.offsetAt(editor.selection.active);
    try {
      const loc = jsoncParser.getLocation(text, offset);
      if (loc.path.length === 0) {
        item.text = '$(json) $';
      } else {
        item.text = `$(json) ${buildPath(loc.path)}`;
      }
      item.show();
    } catch {
      item.hide();
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(update),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument(update)
  );

  update();
}

function buildPath(path: jsoncParser.JSONPath): string {
  let result = '';
  for (const seg of path) {
    if (typeof seg === 'number') {
      result += `[${seg}]`;
    } else {
      result += result === '' ? seg : `.${seg}`;
    }
  }
  return result || '$';
}
