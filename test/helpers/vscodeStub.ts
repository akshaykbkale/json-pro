/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A small in-memory simulation of the parts of the `vscode` API that JSON Pro uses.
 * Installed as the `vscode` module by ./installStub so the real extension code can be
 * activated and driven end-to-end under `node --test`, without an Electron host.
 */

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
  translate(lineDelta = 0, charDelta = 0): Position { return new Position(this.line + lineDelta, this.character + charDelta); }
  isEqual(o: Position): boolean { return o.line === this.line && o.character === this.character; }
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    if (typeof a === 'number') { this.start = new Position(a, b as number); this.end = new Position(c!, d!); }
    else { this.start = a; this.end = b as Position; }
  }
}

export class Selection extends Range {
  constructor(anchor: Position, active: Position) { super(anchor, active); }
  get anchor(): Position { return this.start; }
  get active(): Position { return this.end; }
}

export class Uri {
  private constructor(public readonly scheme: string, public readonly path: string) {}
  static parse(s: string): Uri { const i = s.indexOf(':'); return new Uri(s.slice(0, i), s.slice(i + 1)); }
  static file(p: string): Uri { return new Uri('file', p); }
  static joinPath(base: Uri, ...parts: string[]): Uri { return new Uri(base.scheme, [base.path, ...parts].join('/')); }
  get fsPath(): string { return this.path; }
  toString(): string { return `${this.scheme}:${this.path}`; }
}

export enum EndOfLine { LF = 1, CRLF = 2 }
export enum StatusBarAlignment { Left = 1, Right = 2 }
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }
export enum ViewColumn { Active = -1, Beside = -2, One = 1, Two = 2 }
export enum DiagnosticSeverity { Error = 0, Warning = 1, Information = 2, Hint = 3 }
export enum TextEditorRevealType { Default = 0, InCenter = 1, InCenterIfOutsideViewport = 2 }
export enum TextDocumentSaveReason { Manual = 1, AfterDelay = 2, FocusOut = 3 }

export class Disposable { constructor(private fn: () => void = () => {}) {} dispose(): void { this.fn(); } }

export class EventEmitter<T> {
  private listeners: Array<(e: T) => unknown> = [];
  readonly event = (listener: (e: T) => unknown): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => { this.listeners = this.listeners.filter(l => l !== listener); });
  };
  fire(e: T): void { for (const l of [...this.listeners]) l(e); }
  dispose(): void { this.listeners = []; }
}

export class TreeItem {
  description?: string; tooltip?: string; iconPath?: unknown; command?: unknown;
  constructor(public label: string, public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {}
}
export class ThemeIcon { constructor(public readonly id: string) {} }
export class MarkdownString { isTrusted = false; constructor(public value = '') {} }
export class Hover { constructor(public contents: MarkdownString, public range?: Range) {} }
export class Diagnostic { source?: string; constructor(public range: Range, public message: string, public severity = DiagnosticSeverity.Error) {} }
export class TextEdit { constructor(public range: Range, public newText: string) {} static replace(range: Range, newText: string): TextEdit { return new TextEdit(range, newText); } }
export class TabInputTextDiff { constructor(public original: Uri, public modified: Uri) {} }

export class WorkspaceEdit {
  edits: Array<{ uri: Uri; range: Range; newText: string }> = [];
  replace(uri: Uri, range: Range, newText: string): void { this.edits.push({ uri, range, newText }); }
}

let untitledCounter = 0;

export class TextDocument {
  version = 1;
  eol = EndOfLine.LF;
  private lineStarts: number[] = [];
  constructor(public readonly uri: Uri, public languageId: string, private text: string) { this.index(); }
  private index(): void {
    this.lineStarts = [0];
    for (let i = 0; i < this.text.length; i++) if (this.text[i] === '\n') this.lineStarts.push(i + 1);
  }
  setText(text: string): void { this.text = text; this.version++; this.index(); }
  getText(range?: Range): string {
    if (!range) return this.text;
    return this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end));
  }
  get lineCount(): number { return this.lineStarts.length; }
  positionAt(offset: number): Position {
    offset = Math.max(0, Math.min(offset, this.text.length));
    let line = 0;
    while (line + 1 < this.lineStarts.length && this.lineStarts[line + 1] <= offset) line++;
    return new Position(line, offset - this.lineStarts[line]);
  }
  offsetAt(pos: Position): number {
    const line = Math.min(pos.line, this.lineStarts.length - 1);
    return Math.min(this.lineStarts[line] + pos.character, this.text.length);
  }
  lineAt(line: number): { text: string; lineNumber: number } {
    const start = this.lineStarts[line];
    const end = line + 1 < this.lineStarts.length ? this.lineStarts[line + 1] - 1 : this.text.length;
    return { text: this.text.slice(start, end), lineNumber: line };
  }
  getWordRangeAtPosition(pos: Position, regex: RegExp): Range | undefined {
    const text = this.lineAt(pos.line).text;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index <= pos.character && pos.character <= m.index + m[0].length) {
        return new Range(pos.line, m.index, pos.line, m.index + m[0].length);
      }
      if (m[0].length === 0) re.lastIndex++;
    }
    return undefined;
  }
}

export class TextEditor {
  selection: Selection;
  revealed: Range[] = [];
  constructor(public readonly document: TextDocument, public viewColumn = ViewColumn.One) {
    this.selection = new Selection(new Position(0, 0), new Position(0, 0));
  }
  revealRange(range: Range): void { this.revealed.push(range); }
}

export interface FakePanel {
  viewType: string; title: string; html: string; disposed: boolean;
  posted: any[]; receive(msg: any): Promise<void>; dispose(): void;
  webview: { html: string; postMessage(m: any): Thenable<boolean>; onDidReceiveMessage(l: (m: any) => unknown): Disposable };
  onDidDispose(l: () => void): Disposable;
}

export interface FakeStatusBarItem { id: string; text: string; tooltip?: string; command?: string; name?: string; visible: boolean; show(): void; hide(): void; dispose(): void }
export interface FakeTreeView { visible: boolean; message: string | undefined; reveals: Array<{ element: any; options: any }>; reveal(e: any, o: any): Thenable<void>; dispose(): void }

/** Mutable test state. Reset with `reset()` between tests. */
export const state = {
  documents: [] as TextDocument[],
  config: {} as Record<string, unknown>,
  commands: new Map<string, (...args: any[]) => unknown>(),
  executed: [] as Array<{ id: string; args: any[] }>,
  contextKeys: {} as Record<string, unknown>,
  statusMessages: [] as string[],
  infoMessages: [] as string[],
  errorMessages: [] as string[],
  warningMessages: [] as string[],
  outputLines: [] as string[],
  clipboard: '',
  panels: [] as FakePanel[],
  statusBarItems: [] as FakeStatusBarItem[],
  treeViews: [] as FakeTreeView[],
  diagnostics: new Map<string, Map<string, Diagnostic[]>>(),
  hoverProviders: [] as any[],
  contentProviders: new Map<string, any>(),
  openedUntitled: [] as Array<{ content: string; language: string }>,
  shownDocuments: [] as TextDocument[],
  /** Scripted answers for UI prompts. Each entry is consumed once. */
  answers: { info: [] as any[], quickPick: [] as any[], inputBox: [] as any[], openDialog: [] as any[] },
};

const events = {
  activeEditor: new EventEmitter<TextEditor | undefined>(),
  selection: new EventEmitter<{ textEditor: TextEditor }>(),
  openDoc: new EventEmitter<TextDocument>(),
  changeDoc: new EventEmitter<{ document: TextDocument; contentChanges: any[] }>(),
  closeDoc: new EventEmitter<TextDocument>(),
  willSave: new EventEmitter<{ document: TextDocument; reason: TextDocumentSaveReason; waitUntil(t: Thenable<TextEdit[]>): void }>(),
  config: new EventEmitter<{ affectsConfiguration(s: string): boolean }>(),
};

function next<T>(queue: T[], fallback: T): T { return queue.length ? queue.shift()! : fallback; }

export const vscode: any = {
  Position, Range, Selection, Uri, EndOfLine, StatusBarAlignment, TreeItemCollapsibleState, ViewColumn, DiagnosticSeverity,
  TextEditorRevealType, TextDocumentSaveReason, Disposable, EventEmitter, TreeItem, ThemeIcon, MarkdownString, Hover, Diagnostic, TextEdit, TabInputTextDiff, WorkspaceEdit,
  window: {
    activeTextEditor: undefined as TextEditor | undefined,
    visibleTextEditors: [] as TextEditor[],
    tabGroups: { all: [] as any[], close: async () => true },
    onDidChangeActiveTextEditor: events.activeEditor.event,
    onDidChangeTextEditorSelection: events.selection.event,
    createOutputChannel: () => ({ appendLine: (l: string) => { state.outputLines.push(l); }, dispose() {} }),
    createStatusBarItem: (id: string) => {
      const item: FakeStatusBarItem = { id, text: '', visible: false, show() { item.visible = true; }, hide() { item.visible = false; }, dispose() {} };
      state.statusBarItems.push(item);
      return item;
    },
    createTreeView: () => {
      const view: FakeTreeView = { visible: false, message: undefined, reveals: [], reveal: async (element, options) => { view.reveals.push({ element, options }); }, dispose() {} };
      state.treeViews.push(view);
      return view;
    },
    createWebviewPanel: (viewType: string, title: string) => {
      const receivers: Array<(m: any) => unknown> = [];
      const disposers: Array<() => void> = [];
      const panel: FakePanel = {
        viewType, title, html: '', disposed: false, posted: [],
        webview: {
          get html() { return panel.html; }, set html(v: string) { panel.html = v; },
          postMessage: async (m: any) => { panel.posted.push(m); return true; },
          onDidReceiveMessage: (l) => { receivers.push(l); return new Disposable(() => { receivers.splice(receivers.indexOf(l), 1); }); },
        },
        receive: async (msg) => { for (const r of [...receivers]) await r(msg); },
        onDidDispose: (l) => { disposers.push(l); return new Disposable(); },
        dispose() { panel.disposed = true; disposers.forEach(d => d()); },
      };
      state.panels.push(panel);
      return panel;
    },
    setStatusBarMessage: (text: string) => { state.statusMessages.push(text); return new Disposable(); },
    showInformationMessage: async (msg: string, ...items: any[]) => {
      state.infoMessages.push(msg);
      const want = next(state.answers.info, undefined as any);
      return typeof want === 'function' ? want(msg, items) : want;
    },
    showErrorMessage: async (msg: string) => { state.errorMessages.push(msg); return undefined; },
    showWarningMessage: async (msg: string) => { state.warningMessages.push(msg); return undefined; },
    showQuickPick: async (items: any[]) => {
      const want = next(state.answers.quickPick, undefined);
      if (want === undefined) return undefined;
      return typeof want === 'function' ? want(items) : items.find(i => i.label === want);
    },
    showInputBox: async (opts: any) => {
      const value = next(state.answers.inputBox, undefined);
      if (value !== undefined && opts?.validateInput) { const err = opts.validateInput(value); if (err) throw new Error(`validateInput rejected "${value}": ${err}`); }
      return value;
    },
    showOpenDialog: async () => next(state.answers.openDialog, undefined),
    showTextDocument: async (doc: TextDocument) => {
      state.shownDocuments.push(doc);
      let editor = vscode.window.visibleTextEditors.find((e: TextEditor) => e.document === doc);
      if (!editor) { editor = new TextEditor(doc); vscode.window.visibleTextEditors.push(editor); }
      return editor;
    },
  },
  workspace: {
    get textDocuments() { return state.documents; },
    onDidOpenTextDocument: events.openDoc.event,
    onDidChangeTextDocument: events.changeDoc.event,
    onDidCloseTextDocument: events.closeDoc.event,
    onWillSaveTextDocument: events.willSave.event,
    onDidChangeConfiguration: events.config.event,
    getConfiguration: (section: string) => ({
      get: (key: string, fallback?: unknown) => { const v = state.config[`${section}.${key}`]; return v === undefined ? fallback : v; },
    }),
    applyEdit: async (edit: WorkspaceEdit) => {
      for (const e of edit.edits) {
        const doc = state.documents.find(d => d.uri.toString() === e.uri.toString());
        if (!doc) return false;
        const before = doc.getText();
        doc.setText(before.slice(0, doc.offsetAt(e.range.start)) + e.newText + before.slice(doc.offsetAt(e.range.end)));
        events.changeDoc.fire({ document: doc, contentChanges: [] });
      }
      return true;
    },
    openTextDocument: async (arg: any) => {
      if (arg instanceof Uri) {
        const doc = state.documents.find(d => d.uri.toString() === arg.toString());
        if (!doc) throw new Error(`cannot open ${arg}`);
        return doc;
      }
      state.openedUntitled.push({ content: arg.content, language: arg.language });
      return openDocument(arg.content, arg.language, { activate: false });
    },
    registerTextDocumentContentProvider: (scheme: string, provider: any) => { state.contentProviders.set(scheme, provider); return new Disposable(); },
    asRelativePath: (uri: Uri) => uri.path.replace(/^\//, ''),
    fs: { readFile: async (uri: Uri) => Buffer.from(state.documents.find(d => d.uri.toString() === uri.toString())?.getText() ?? '') },
  },
  languages: {
    createDiagnosticCollection: (name: string) => {
      const store = new Map<string, Diagnostic[]>();
      state.diagnostics.set(name, store);
      return { set: (uri: Uri, d: Diagnostic[]) => store.set(uri.toString(), d), delete: (uri: Uri) => store.delete(uri.toString()), clear: () => store.clear(), dispose() {} };
    },
    registerHoverProvider: (_sel: unknown, provider: any) => { state.hoverProviders.push(provider); return new Disposable(); },
  },
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => unknown) => { state.commands.set(id, handler); return new Disposable(() => state.commands.delete(id)); },
    executeCommand: async (id: string, ...args: any[]) => {
      state.executed.push({ id, args });
      if (id === 'setContext') { state.contextKeys[args[0]] = args[1]; return; }
      const handler = state.commands.get(id);
      return handler ? handler(...args) : undefined;
    },
  },
  env: { clipboard: { writeText: async (t: string) => { state.clipboard = t; } } },
};

// ── Test helpers ─────────────────────────────────────────────────────────────

export function openDocument(text: string, languageId = 'json', opts: { activate?: boolean; name?: string } = {}): TextDocument {
  const name = opts.name ?? `untitled-${++untitledCounter}.${languageId}`;
  const doc = new TextDocument(Uri.file(`/${name}`), languageId, text);
  state.documents.push(doc);
  events.openDoc.fire(doc);
  if (opts.activate !== false) activate(doc);
  return doc;
}

export function activate(doc: TextDocument | undefined): TextEditor | undefined {
  const editor = doc ? new TextEditor(doc) : undefined;
  vscode.window.activeTextEditor = editor;
  vscode.window.visibleTextEditors = editor ? [editor] : [];
  events.activeEditor.fire(editor);
  return editor;
}

export function typeText(doc: TextDocument, text: string): void {
  doc.setText(text);
  events.changeDoc.fire({ document: doc, contentChanges: [] });
}

export function moveCursor(editor: TextEditor, offset: number): void {
  const pos = editor.document.positionAt(offset);
  editor.selection = new Selection(pos, pos);
  events.selection.fire({ textEditor: editor });
}

export function closeDocument(doc: TextDocument): void {
  state.documents = state.documents.filter(d => d !== doc);
  events.closeDoc.fire(doc);
}

/** Simulate a save; returns the edits handlers asked to apply via waitUntil. */
export async function save(doc: TextDocument, reason = TextDocumentSaveReason.Manual): Promise<TextEdit[]> {
  const pending: Array<Thenable<TextEdit[]>> = [];
  events.willSave.fire({ document: doc, reason, waitUntil: t => pending.push(t) });
  return (await Promise.all(pending)).flat();
}

export function setConfig(key: string, value: unknown): void {
  state.config[key] = value;
  events.config.fire({ affectsConfiguration: (s: string) => key.startsWith(s) });
}

export function diagnosticsFor(collection: string, doc: TextDocument): Diagnostic[] {
  return state.diagnostics.get(collection)?.get(doc.uri.toString()) ?? [];
}

export const lastPanel = (): FakePanel => state.panels[state.panels.length - 1];
export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

export function reset(): void {
  state.documents = [];
  state.config = {};
  state.executed = [];
  state.statusMessages = []; state.infoMessages = []; state.errorMessages = []; state.warningMessages = [];
  state.clipboard = '';
  state.panels = [];
  state.openedUntitled = []; state.shownDocuments = [];
  state.answers = { info: [], quickPick: [], inputBox: [], openDialog: [] };
  vscode.window.activeTextEditor = undefined;
  vscode.window.visibleTextEditors = [];
  for (const store of state.diagnostics.values()) store.clear();
}
