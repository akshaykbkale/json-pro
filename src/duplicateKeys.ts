import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

const collection = vscode.languages.createDiagnosticCollection('jsonPro.duplicates');
let timer: ReturnType<typeof setTimeout> | undefined;

export function registerDuplicateKeyDetector(context: vscode.ExtensionContext): void {
  context.subscriptions.push(collection);

  const run = (doc: vscode.TextDocument) => {
    if (doc.languageId !== 'json' && doc.languageId !== 'jsonc') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => scan(doc), 400);
  };

  if (vscode.window.activeTextEditor) {
    scan(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => { if (e) run(e.document); }),
    vscode.workspace.onDidChangeTextDocument(e => run(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri))
  );
}

function scan(document: vscode.TextDocument): void {
  if (document.languageId !== 'json' && document.languageId !== 'jsonc') return;

  const text = document.getText();
  if (!text.trim()) { collection.set(document.uri, []); return; }

  const errors: jsoncParser.ParseError[] = [];
  const root = jsoncParser.parseTree(text, errors);
  if (!root) { collection.set(document.uri, []); return; }

  const diags: vscode.Diagnostic[] = [];
  findDuplicates(root, document, diags);
  collection.set(document.uri, diags);
}

function findDuplicates(
  node: jsoncParser.Node,
  doc: vscode.TextDocument,
  diags: vscode.Diagnostic[]
): void {
  if (node.type === 'object' && node.children) {
    const seen = new Map<string, jsoncParser.Node>();

    for (const prop of node.children) {
      const keyNode = prop.children?.[0];
      if (!keyNode) continue;

      const key = jsoncParser.getNodeValue(keyNode) as string;

      if (seen.has(key)) {
        // Mark the duplicate
        const dupStart = doc.positionAt(keyNode.offset);
        const dupEnd   = doc.positionAt(keyNode.offset + keyNode.length);
        const dupDiag  = new vscode.Diagnostic(
          new vscode.Range(dupStart, dupEnd),
          `Duplicate key: "${key}"`,
          vscode.DiagnosticSeverity.Warning
        );
        dupDiag.source = 'JSON Pro';
        diags.push(dupDiag);

        // Also mark the first occurrence if not already marked
        const firstNode = seen.get(key)!;
        const firstStart = doc.positionAt(firstNode.offset);
        const firstEnd   = doc.positionAt(firstNode.offset + firstNode.length);
        const firstDiag  = new vscode.Diagnostic(
          new vscode.Range(firstStart, firstEnd),
          `Duplicate key: "${key}" (first occurrence)`,
          vscode.DiagnosticSeverity.Warning
        );
        firstDiag.source = 'JSON Pro';
        diags.push(firstDiag);

        // Remove so we don't double-mark the first if there's a third occurrence
        seen.delete(key);
      } else {
        seen.set(key, keyNode);
      }

      // Recurse into value
      if (prop.children?.[1]) {
        findDuplicates(prop.children[1], doc, diags);
      }
    }
  } else if (node.type === 'array' && node.children) {
    for (const child of node.children) {
      findDuplicates(child, doc, diags);
    }
  }
}
