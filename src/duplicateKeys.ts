import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { DocumentDebouncer, isJsonDocument, isLargeDocument } from './editorUtils';

const collection = vscode.languages.createDiagnosticCollection('jsonPro.duplicates');

export function registerDuplicateKeyDetector(context: vscode.ExtensionContext): void {
  const debouncer = new DocumentDebouncer(400);
  context.subscriptions.push(collection, debouncer);

  const enabled = (): boolean => vscode.workspace.getConfiguration('jsonPro').get<boolean>('enableDiagnostics', true);
  const scanAll = (): void => {
    if (!enabled()) { collection.clear(); return; }
    for (const doc of vscode.workspace.textDocuments) scan(doc);
  };

  scanAll();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => { if (enabled()) scan(doc); }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (!isJsonDocument(e.document) || !enabled()) return;
      debouncer.schedule(e.document, () => scan(e.document));
    }),
    vscode.workspace.onDidCloseTextDocument(doc => { debouncer.cancel(doc); collection.delete(doc.uri); }),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('jsonPro.enableDiagnostics')) scanAll(); })
  );
}

function scan(document: vscode.TextDocument): void {
  if (!isJsonDocument(document)) return;
  if (isLargeDocument(document)) { collection.set(document.uri, []); return; }

  const text = document.getText();
  if (!text.trim()) { collection.set(document.uri, []); return; }

  const root = jsoncParser.parseTree(text, [], { allowTrailingComma: true });
  if (!root) { collection.set(document.uri, []); return; }

  const diags: vscode.Diagnostic[] = [];
  findDuplicates(root, document, diags);
  collection.set(document.uri, diags);
}

function findDuplicates(node: jsoncParser.Node, doc: vscode.TextDocument, diags: vscode.Diagnostic[]): void {
  if (node.type === 'object' && node.children) {
    const seen = new Map<string, jsoncParser.Node[]>();
    for (const prop of node.children) {
      const keyNode = prop.children?.[0];
      if (!keyNode) continue;
      const key = String(jsoncParser.getNodeValue(keyNode));
      const list = seen.get(key);
      if (list) list.push(keyNode); else seen.set(key, [keyNode]);
      if (prop.children?.[1]) findDuplicates(prop.children[1], doc, diags);
    }
    for (const [key, nodes] of seen) {
      if (nodes.length < 2) continue;
      nodes.forEach((keyNode, i) => {
        const range = new vscode.Range(doc.positionAt(keyNode.offset), doc.positionAt(keyNode.offset + keyNode.length));
        const diag = new vscode.Diagnostic(
          range,
          `Duplicate key "${key}" (${i + 1} of ${nodes.length}) — only the last value will be used`,
          vscode.DiagnosticSeverity.Warning
        );
        diag.source = 'JSON Pro';
        diags.push(diag);
      });
    }
  } else if (node.type === 'array' && node.children) {
    for (const child of node.children) findDuplicates(child, doc, diags);
  }
}
