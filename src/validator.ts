import * as vscode from 'vscode';
import { validateJsonText } from './core/json';
import { DocumentDebouncer, isJsonDocument, validationOptionsFor } from './editorUtils';

const diagnostics = vscode.languages.createDiagnosticCollection('jsonPro');

export function registerValidator(context: vscode.ExtensionContext): void {
  const debouncer = new DocumentDebouncer(300);
  context.subscriptions.push(diagnostics, debouncer);

  const enabled = (): boolean => vscode.workspace.getConfiguration('jsonPro').get<boolean>('enableDiagnostics', true);
  const validateAll = (): void => {
    if (!enabled()) { diagnostics.clear(); return; }
    for (const doc of vscode.workspace.textDocuments) validateDocument(doc);
  };

  validateAll();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => { if (enabled()) validateDocument(doc); }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!isJsonDocument(event.document) || !enabled()) return;
      debouncer.schedule(event.document, () => validateDocument(event.document));
    }),
    vscode.workspace.onDidCloseTextDocument(doc => { debouncer.cancel(doc); diagnostics.delete(doc.uri); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('jsonPro.enableDiagnostics')) validateAll(); })
  );
}

function validateDocument(document: vscode.TextDocument): void {
  if (!isJsonDocument(document)) return;

  const text = document.getText();
  if (text.trim().length === 0) {
    diagnostics.set(document.uri, []);
    return;
  }

  const problems = validateJsonText(text, validationOptionsFor(document));
  diagnostics.set(document.uri, problems.map(p => {
    const start = document.positionAt(p.offset);
    const end = document.positionAt(p.offset + p.length);
    const diag = new vscode.Diagnostic(new vscode.Range(start, end), p.message, vscode.DiagnosticSeverity.Error);
    diag.source = 'JSON Pro';
    return diag;
  }));
}
