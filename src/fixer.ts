import * as vscode from 'vscode';
import { fixJsonText } from './core/fixer';
import { validateJsonText } from './core/json';
import { fullRange, replaceDocumentText, statusMessage, validationOptionsFor } from './editorUtils';
import { getOutputChannel } from './outputChannel';

const PREVIEW_SCHEME = 'jsonpro-fix';
const previewContents = new Map<string, string>();

export function registerFixPreviewProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
      provideTextDocumentContent: uri => previewContents.get(uri.toString()) ?? '',
    })
  );
}

export type FixOutcome =
  | { kind: 'clean' }
  | { kind: 'unfixable'; message: string }
  | { kind: 'fixed'; text: string };

/** Compute a fix for a document without touching it. */
export function computeFix(doc: vscode.TextDocument): FixOutcome {
  const text = doc.getText();
  if (text.trim().length === 0) return { kind: 'clean' };

  const alreadyValid = validateJsonText(text, validationOptionsFor(doc)).length === 0;
  const fixed = fixJsonText(text);
  if (fixed === text) {
    return alreadyValid ? { kind: 'clean' } : { kind: 'unfixable', message: describeRemaining(fixed) };
  }
  const remaining = validateJsonText(fixed, { allowComments: false, allowTrailingComma: false });
  if (remaining.length > 0) return { kind: 'unfixable', message: describeRemaining(fixed) };
  if (alreadyValid && doc.languageId === 'jsonc') {
    // Valid JSONC: the only "fix" would be stripping comments the user wants to keep.
    return { kind: 'clean' };
  }
  return { kind: 'fixed', text: fixed };
}

function describeRemaining(fixed: string): string {
  const problems = validateJsonText(fixed, { allowComments: false, allowTrailingComma: false });
  return problems.length > 0 ? `Still invalid after auto-fix — ${problems[0].message}` : 'Nothing to fix';
}

/** Interactive Auto-Fix: preview in a diff editor, then apply on confirmation. */
export async function fixJson(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const outcome = computeFix(document);

  if (outcome.kind === 'clean') {
    statusMessage('Document is already valid — nothing to fix');
    return;
  }
  if (outcome.kind === 'unfixable') {
    getOutputChannel().appendLine(`[fixer] ${outcome.message}`);
    void vscode.window.showWarningMessage(`JSON Pro: ${outcome.message}`);
    return;
  }

  const stamp = Date.now();
  const originalUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:/${stamp}/Original.json`);
  const fixedUri = vscode.Uri.parse(`${PREVIEW_SCHEME}:/${stamp}/Fixed.json`);
  previewContents.set(originalUri.toString(), document.getText());
  previewContents.set(fixedUri.toString(), outcome.text);

  try {
    await vscode.commands.executeCommand(
      'vscode.diff', originalUri, fixedUri,
      'JSON Pro: Auto-Fix Preview (Original ↔ Fixed)',
      { preview: true, viewColumn: vscode.ViewColumn.Beside }
    );

    const answer = await vscode.window.showInformationMessage(
      'JSON Pro: Apply auto-fix to the document?', 'Apply', 'Discard'
    );
    await closePreviewTabs(originalUri, fixedUri);

    if (answer === 'Apply') {
      await replaceDocumentText(document, outcome.text);
      statusMessage('Auto-fix applied');
    }
  } finally {
    previewContents.delete(originalUri.toString());
    previewContents.delete(fixedUri.toString());
  }
}

/** Fix-on-save: returns the edits to apply, or an empty list when nothing needs fixing. */
export function fixOnSaveEdits(doc: vscode.TextDocument): vscode.TextEdit[] {
  const outcome = computeFix(doc);
  if (outcome.kind !== 'fixed') return [];
  getOutputChannel().appendLine(`[autoFixOnSave] Fixed ${doc.uri.fsPath}`);
  return [vscode.TextEdit.replace(fullRange(doc), outcome.text)];
}

async function closePreviewTabs(...uris: vscode.Uri[]): Promise<void> {
  const wanted = new Set(uris.map(u => u.toString()));
  const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs).filter(tab => {
    const input = tab.input;
    if (input instanceof vscode.TabInputTextDiff) {
      return wanted.has(input.original.toString()) || wanted.has(input.modified.toString());
    }
    return false;
  });
  if (tabs.length > 0) {
    try { await vscode.window.tabGroups.close(tabs); } catch { /* tab already closed */ }
  }
}
