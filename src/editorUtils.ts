import * as vscode from 'vscode';
import { Indent, JsonParseError, JsonOptions } from './core/json';
import { getOutputChannel } from './outputChannel';

export function isJsonDocument(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'json' || doc.languageId === 'jsonc';
}

/** Validation strictness for a document: `.jsonc` files may contain comments and trailing commas. */
export function validationOptionsFor(doc: vscode.TextDocument): Required<JsonOptions> {
  const lenient = doc.languageId === 'jsonc';
  return { allowComments: lenient, allowTrailingComma: lenient };
}

/**
 * Live features (diagnostics, tree view, breadcrumb) are skipped for documents above
 * `jsonPro.largeFileThresholdKB` so very large files never make the editor stutter.
 * Explicit commands still work on any size.
 */
export function isLargeDocument(doc: vscode.TextDocument): boolean {
  const kb = vscode.workspace.getConfiguration('jsonPro', doc).get<number>('largeFileThresholdKB', 4096);
  if (!kb || kb <= 0) return false;
  return doc.getText().length > kb * 1024;
}

export function getIndent(doc?: vscode.TextDocument): Indent {
  const cfg = vscode.workspace.getConfiguration('jsonPro', doc);
  if (cfg.get<boolean>('useTabs')) return '\t';
  const size = cfg.get<number>('indentSize') ?? 2;
  return Number.isInteger(size) && size > 0 ? size : 2;
}

export function getEol(doc: vscode.TextDocument): string {
  return doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
}

export function fullRange(doc: vscode.TextDocument): vscode.Range {
  return new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
}

/** Replace the whole content of a document. Returns false when nothing changed. */
export async function replaceDocumentText(doc: vscode.TextDocument, newText: string): Promise<boolean> {
  if (doc.getText() === newText) return false;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, fullRange(doc), newText);
  return vscode.workspace.applyEdit(edit);
}

/** Resolve a document by URI, opening it if it is no longer loaded. */
export async function resolveDocument(uri: vscode.Uri | undefined): Promise<vscode.TextDocument | undefined> {
  if (!uri) return undefined;
  const open = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
  if (open) return open;
  try { return await vscode.workspace.openTextDocument(uri); } catch { return undefined; }
}

export function statusMessage(text: string, timeoutMs = 3000): void {
  vscode.window.setStatusBarMessage(`$(check) JSON Pro: ${text}`, timeoutMs);
}

/**
 * Report a failed command. Parse errors move the cursor to the problem and offer Auto-Fix;
 * everything else is logged to the output channel and shown as an error notification.
 */
export function reportError(command: string, err: unknown, editor?: vscode.TextEditor): void {
  const msg = err instanceof Error ? err.message : String(err);
  getOutputChannel().appendLine(`[${command}] ${msg}`);

  if (err instanceof JsonParseError && editor) {
    const pos = editor.document.positionAt(err.offset);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    void vscode.window.showErrorMessage(`JSON Pro: ${msg} (line ${pos.line + 1})`, 'Run Auto-Fix').then(choice => {
      if (choice === 'Run Auto-Fix') void vscode.commands.executeCommand('jsonPro.fix');
    });
    return;
  }
  void vscode.window.showErrorMessage(`JSON Pro: ${msg}`);
}

/** Per-document debouncer so edits in one file never cancel pending work for another. */
export class DocumentDebouncer implements vscode.Disposable {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly delayMs: number) {}

  schedule(doc: vscode.TextDocument, fn: () => void): void {
    const key = doc.uri.toString();
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(key, setTimeout(() => { this.timers.delete(key); fn(); }, this.delayMs));
  }

  cancel(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.timers.get(key);
    if (existing) { clearTimeout(existing); this.timers.delete(key); }
  }

  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

/** Let the user pick a JSON file from disk and return its contents. */
export async function pickJsonFile(): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { JSON: ['json', 'jsonc'], 'All files': ['*'] },
    openLabel: 'Load',
  });
  if (!picked || picked.length === 0) return undefined;
  const bytes = await vscode.workspace.fs.readFile(picked[0]);
  return Buffer.from(bytes).toString('utf8');
}

export function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}
