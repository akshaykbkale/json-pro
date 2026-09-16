import * as vscode from 'vscode';
import type * as jsoncParser from 'jsonc-parser';

import { formatJsonText, minifyJsonText, sortKeysJsonText, parseJsonText } from './core/json';
import { jsonToTypeScript, jsonToYaml, escapeJsonString, unescapeJsonString } from './core/converters';
import { fixJson, fixOnSaveEdits, registerFixPreviewProvider } from './fixer';
import { registerValidator } from './validator';
import { openDiffPanel } from './diffProvider';
import { searchJson } from './searchProvider';
import { copyPath } from './pathFinder';
import { JsonTreeProvider, revealNode } from './treeProvider';
import { openInNewTab } from './converters';
import { flattenJson, unflattenJson, removeEmptyJson, renameKeyJson } from './transforms';
import { openJsonPathPanel } from './jsonPathPanel';
import { openStatsPanel } from './statsPanel';
import { openMergePanel } from './mergePanel';
import { registerHoverProvider } from './hoverProvider';
import { registerBreadcrumb } from './breadcrumb';
import { registerDuplicateKeyDetector } from './duplicateKeys';
import { openWelcomePanel, showWelcomeOnFirstInstall } from './welcomePanel';
import { getEol, getIndent, isJsonDocument, replaceDocumentText, reportError, statusMessage } from './editorUtils';
import { getOutputChannel } from './outputChannel';

const output = getOutputChannel();

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(output);
  output.appendLine(`JSON Pro ${context.extension.packageJSON.version} activated`);

  registerFixPreviewProvider(context);
  showWelcomeOnFirstInstall(context);
  reg(context, 'jsonPro.welcome', () => openWelcomePanel(context));

  // ── Core providers ──────────────────────────────────────────────────────────
  registerValidator(context);
  registerHoverProvider(context);
  registerBreadcrumb(context);
  registerDuplicateKeyDetector(context);

  // ── Context key so menus / views only show for JSON editors ────────────────
  const updateContext = (editor: vscode.TextEditor | undefined): void => {
    void vscode.commands.executeCommand('setContext', 'jsonPro.isJsonEditor', !!editor && isJsonDocument(editor.document));
  };
  updateContext(vscode.window.activeTextEditor);

  // ── Tree view ───────────────────────────────────────────────────────────────
  const treeProvider = new JsonTreeProvider();
  const treeView = vscode.window.createTreeView('jsonProTree', { treeDataProvider: treeProvider, showCollapseAll: true });
  context.subscriptions.push(treeView, treeProvider);
  context.subscriptions.push(treeProvider.onDidChangeTreeData(() => { treeView.message = treeProvider.message; }));

  const revealTree = (editor: vscode.TextEditor | undefined): void => {
    if (!editor || !isJsonDocument(editor.document) || treeView.visible) return;
    if (!vscode.workspace.getConfiguration('jsonPro').get<boolean>('showTreeOnOpen', true)) return;
    const first = treeProvider.roots[0];
    if (first) treeView.reveal(first, { focus: false, select: false, expand: false }).then(undefined, () => { /* view hidden */ });
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      updateContext(editor);
      treeProvider.refresh();
      revealTree(editor);
    }),
    vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document === vscode.window.activeTextEditor?.document) treeProvider.scheduleRefresh();
    })
  );
  revealTree(vscode.window.activeTextEditor);

  // ── Auto-fix on save ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(event => {
      const doc = event.document;
      if (!isJsonDocument(doc)) return;
      if (!vscode.workspace.getConfiguration('jsonPro', doc).get<boolean>('autoFixOnSave', false)) return;
      const edits = fixOnSaveEdits(doc);
      if (edits.length === 0) return;
      event.waitUntil(Promise.resolve(edits));
      vscode.window.setStatusBarMessage('$(wrench) JSON Pro: Auto-fix applied on save', 4000);
    })
  );

  // ── Internal: reveal tree node ──────────────────────────────────────────────
  reg(context, 'jsonPro.revealNode', (doc: vscode.TextDocument, node: jsoncParser.Node) => revealNode(doc, node));

  // ── Whole-document rewrites ─────────────────────────────────────────────────
  const rewrite = (id: string, transform: (text: string, editor: vscode.TextEditor) => string, done: string): void => {
    reg(context, id, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText();
      if (!text.trim()) return;
      try {
        const changed = await replaceDocumentText(editor.document, transform(text, editor));
        statusMessage(changed ? done : 'Already up to date');
      } catch (e) {
        reportError(id, e, editor);
      }
    });
  };

  rewrite('jsonPro.format', (t, ed) => formatJsonText(t, getIndent(ed.document), getEol(ed.document)), 'Formatted');
  rewrite('jsonPro.minify', t => minifyJsonText(t), 'Minified');
  rewrite('jsonPro.sortKeys', (t, ed) => sortKeysJsonText(t, getIndent(ed.document)), 'Keys sorted');

  // ── Editor-based commands ───────────────────────────────────────────────────
  const withEditor = (id: string, run: (editor: vscode.TextEditor) => Promise<void> | void): void => {
    reg(context, id, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showInformationMessage('JSON Pro: Open a JSON file first.');
        return;
      }
      try { await run(editor); }
      catch (e) { reportError(id, e, editor); }
    });
  };

  withEditor('jsonPro.fix', fixJson);
  withEditor('jsonPro.search', searchJson);
  withEditor('jsonPro.copyPath', ed => copyPath(ed, 'dot'));
  withEditor('jsonPro.copyJsonPath', ed => copyPath(ed, 'jsonpath'));
  withEditor('jsonPro.flatten', flattenJson);
  withEditor('jsonPro.unflatten', unflattenJson);
  withEditor('jsonPro.removeEmpty', removeEmptyJson);
  withEditor('jsonPro.renameKey', renameKeyJson);
  withEditor('jsonPro.stats', openStatsPanel);

  // ── Conversions (open result beside the editor) ────────────────────────────
  const convert = (id: string, run: (text: string) => string, language: string): void => {
    withEditor(id, async editor => {
      const text = editor.document.getText();
      if (!text.trim()) return;
      await openInNewTab(run(text), language);
    });
  };

  convert('jsonPro.toTypeScript', t => jsonToTypeScript(parseJsonText(t)), 'typescript');
  convert('jsonPro.toYAML', t => jsonToYaml(parseJsonText(t)), 'yaml');
  convert('jsonPro.escapeJson', escapeJsonString, 'json');
  convert('jsonPro.unescapeJson', unescapeJsonString, 'json');

  // ── Panels (work without an editor too) ────────────────────────────────────
  reg(context, 'jsonPro.diff', () => openDiffPanel(context, vscode.window.activeTextEditor));
  reg(context, 'jsonPro.jsonPath', () => openJsonPathPanel(context, vscode.window.activeTextEditor));
  reg(context, 'jsonPro.merge', () => openMergePanel(context, vscode.window.activeTextEditor));
}

export function deactivate(): void {
  output.appendLine('JSON Pro deactivated');
}

function reg(
  context: vscode.ExtensionContext,
  id: string,
  handler: (...args: never[]) => unknown
): void {
  context.subscriptions.push(vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown));
}
