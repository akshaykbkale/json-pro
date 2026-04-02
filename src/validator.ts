import * as vscode from 'vscode';
import { getOutputChannel } from './outputChannel';

const output = getOutputChannel();
const diagnostics = vscode.languages.createDiagnosticCollection('jsonPro');

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function registerValidator(context: vscode.ExtensionContext): void {
  context.subscriptions.push(diagnostics);

  // Validate on open
  if (vscode.window.activeTextEditor) {
    validateDocument(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        validateDocument(editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        validateDocument(event.document);
      }, 300);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
    })
  );
}

function isJsonDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'json' || document.languageId === 'jsonc';
}

function validateDocument(document: vscode.TextDocument): void {
  if (!isJsonDocument(document)) {
    return;
  }

  const text = document.getText();
  if (text.trim().length === 0) {
    diagnostics.set(document.uri, []);
    return;
  }

  try {
    JSON.parse(text);
    diagnostics.set(document.uri, []);
  } catch (err) {
    const diag = buildDiagnostic(document, text, err);
    diagnostics.set(document.uri, [diag]);
    output.appendLine(`[validator] ${document.uri.fsPath}: ${diag.message}`);
  }
}

function buildDiagnostic(
  document: vscode.TextDocument,
  text: string,
  err: unknown
): vscode.Diagnostic {
  const raw = err instanceof Error ? err.message : String(err);
  const message = humanizeError(raw);

  // Try to extract position from error message (e.g. "at position 42")
  const posMatch = raw.match(/position (\d+)/);
  let range: vscode.Range;

  if (posMatch) {
    const offset = parseInt(posMatch[1], 10);
    const pos = document.positionAt(Math.min(offset, text.length - 1));
    range = new vscode.Range(pos, pos.translate(0, 1));
  } else {
    // Fallback: mark the first line
    range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
  }

  return new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
}

function humanizeError(raw: string): string {
  if (/trailing comma/i.test(raw) || /Unexpected token ,/i.test(raw)) {
    return 'Trailing comma — remove the last comma before } or ]';
  }
  if (/Unexpected end of JSON/i.test(raw) || /Unexpected end of input/i.test(raw)) {
    return 'Missing closing bracket or brace';
  }
  if (/Unexpected token/i.test(raw)) {
    const token = raw.match(/Unexpected token (.+)/)?.[1] ?? '';
    return `Unexpected token${token ? ': ' + token : ''} — check for missing quotes or commas`;
  }
  if (/Unterminated string/i.test(raw)) {
    return 'Unterminated string — missing closing double quote';
  }
  return raw;
}
