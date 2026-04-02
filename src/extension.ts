import * as vscode from 'vscode';

// Core features
import { formatJson, minifyJson, sortKeysJson } from './formatter';
import { fixJson } from './fixer';
import { registerValidator } from './validator';
import { openDiffPanel } from './diffProvider';
import { searchJson } from './searchProvider';
import { copyPath } from './pathFinder';
import { JsonTreeProvider, revealNode } from './treeProvider';

// New features
import { jsonToTypeScript, jsonToYaml, escapeJsonString, unescapeJsonString, openInNewTab } from './converters';
import { flattenJson, unflattenJson, removeEmptyJson, renameKeyJson } from './transforms';
import { openJsonPathPanel } from './jsonPathPanel';
import { openStatsPanel } from './statsPanel';
import { openMergePanel } from './mergePanel';
import { registerHoverProvider } from './hoverProvider';
import { registerBreadcrumb } from './breadcrumb';
import { registerDuplicateKeyDetector } from './duplicateKeys';
import { openWelcomePanel, showWelcomeOnFirstInstall } from './welcomePanel';

import type * as jsoncParser from 'jsonc-parser';
import { getOutputChannel } from './outputChannel';

const output = getOutputChannel();

export function activate(context: vscode.ExtensionContext): void {
  output.appendLine('JSON Pro activated');

  // ── Welcome panel ────────────────────────────────────────────────────────────
  showWelcomeOnFirstInstall(context);
  reg(context, 'jsonPro.welcome', () => openWelcomePanel(context));

  // ── Core providers ──────────────────────────────────────────────────────────
  registerValidator(context);
  registerHoverProvider(context);
  registerBreadcrumb(context);
  registerDuplicateKeyDetector(context);

  // ── Tree view ───────────────────────────────────────────────────────────────
  const treeProvider = new JsonTreeProvider(context);
  const treeView = vscode.window.createTreeView('jsonProTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => treeProvider.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => treeProvider.scheduleRefresh())
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!editor) return;
      const { languageId } = editor.document;
      if (languageId !== 'json' && languageId !== 'jsonc') return;
      const showTree = vscode.workspace.getConfiguration('jsonPro').get<boolean>('showTreeOnOpen', true);
      if (showTree) vscode.commands.executeCommand('jsonProTree.focus');
    })
  );

  // ── Auto-fix on save ─────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument(async event => {
      const autoFix = vscode.workspace.getConfiguration('jsonPro').get<boolean>('autoFixOnSave', false);
      if (!autoFix) return;
      const { languageId } = event.document;
      // Only run on explicit json/jsonc files — never silently mutate other file types
      if (languageId !== 'json' && languageId !== 'jsonc') return;
      const editor = vscode.window.activeTextEditor;
      if (editor?.document === event.document) {
        const before = event.document.getText();
        await fixJson(editor);
        const after = editor.document.getText();
        if (after !== before) {
          vscode.window.setStatusBarMessage('$(wrench) JSON Pro: Auto-fix applied on save', 4000);
          output.appendLine(`[autoFixOnSave] Modified ${event.document.uri.fsPath}`);
        }
      }
    })
  );

  // ── Internal: reveal tree node ──────────────────────────────────────────────
  reg(context, 'jsonPro.revealNode', (doc: vscode.TextDocument, node: jsoncParser.Node) => {
    revealNode(doc, node);
  });

  // ── Format ──────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.format', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      await applyEdit(editor, formatJson(text));
      vscode.window.setStatusBarMessage('$(check) JSON Pro: Formatted', 3000);
    } catch (e) {
      statusError('format', e);
    }
  });

  // ── Minify ──────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.minify', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      await applyEdit(editor, minifyJson(text));
      vscode.window.setStatusBarMessage('$(check) JSON Pro: Minified', 3000);
    } catch (e) {
      statusError('minify', e);
    }
  });

  // ── Sort keys ───────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.sortKeys', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      await applyEdit(editor, sortKeysJson(text));
      vscode.window.setStatusBarMessage('$(check) JSON Pro: Keys sorted', 3000);
    } catch (e) {
      statusError('sortKeys', e);
    }
  });

  // ── Auto-fix ────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.fix', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await fixJson(editor); }
    catch (e) { statusError('fix', e); }
  });

  // ── Diff ────────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.diff', () => {
    try { openDiffPanel(context); }
    catch (e) { output.appendLine(`[diff] ${e}`); }
  });

  // ── Search ──────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.search', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await searchJson(editor); }
    catch (e) { statusError('search', e); }
  });

  // ── Copy path ───────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.copyPath', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await copyPath(editor); }
    catch (e) { statusError('copyPath', e); }
  });

  // ── TypeScript interfaces ───────────────────────────────────────────────────
  reg(context, 'jsonPro.toTypeScript', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      const ts = jsonToTypeScript(text);
      await openInNewTab(ts, 'typescript');
    } catch (e) {
      statusError('toTypeScript', e);
    }
  });

  // ── Flatten ─────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.flatten', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await flattenJson(editor); }
    catch (e) { statusError('flatten', e); }
  });

  // ── Unflatten ───────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.unflatten', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await unflattenJson(editor); }
    catch (e) { statusError('unflatten', e); }
  });

  // ── JSONPath query ──────────────────────────────────────────────────────────
  reg(context, 'jsonPro.jsonPath', () => {
    const editor = vscode.window.activeTextEditor;
    const json = editor?.document.getText() ?? '{}';
    openJsonPathPanel(context, json);
  });

  // ── Merge ───────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.merge', () => {
    const editor = vscode.window.activeTextEditor;
    const json = editor?.document.getText() ?? '{}';
    openMergePanel(context, json);
  });

  // ── Remove nulls & empty ────────────────────────────────────────────────────
  reg(context, 'jsonPro.removeEmpty', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await removeEmptyJson(editor); }
    catch (e) { statusError('removeEmpty', e); }
  });


  // ── Convert to YAML ─────────────────────────────────────────────────────────
  reg(context, 'jsonPro.toYAML', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      const yaml = jsonToYaml(text);
      await openInNewTab(yaml, 'yaml');
    } catch (e) {
      statusError('toYAML', e);
    }
  });

  // ── Escape JSON string ──────────────────────────────────────────────────────
  reg(context, 'jsonPro.escapeJson', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      const escaped = escapeJsonString(text);
      await openInNewTab(escaped, 'json');
    } catch (e) {
      statusError('escapeJson', e);
    }
  });

  // ── Unescape JSON string ────────────────────────────────────────────────────
  reg(context, 'jsonPro.unescapeJson', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    try {
      const unescaped = unescapeJsonString(text);
      await openInNewTab(unescaped, 'json');
    } catch (e) {
      statusError('unescapeJson', e);
    }
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.stats', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = editor.document.getText();
    if (!text.trim()) return;
    openStatsPanel(context, text);
  });

  // ── Rename key ──────────────────────────────────────────────────────────────
  reg(context, 'jsonPro.renameKey', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    try { await renameKeyJson(editor); }
    catch (e) { statusError('renameKey', e); }
  });
}

export function deactivate(): void {
  output.appendLine('JSON Pro deactivated');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reg(
  context: vscode.ExtensionContext,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => unknown
): void {
  context.subscriptions.push(vscode.commands.registerCommand(id, handler));
}

async function applyEdit(editor: vscode.TextEditor, newText: string): Promise<void> {
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, fullRange, newText);
  await vscode.workspace.applyEdit(edit);
}

function statusError(cmd: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  output.appendLine(`[${cmd}] Error: ${msg}`);
  vscode.window.setStatusBarMessage(`$(error) JSON Pro: ${msg}`, 5000);
}
