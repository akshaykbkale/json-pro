import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { isJsonDocument, isLargeDocument } from './editorUtils';

const PREVIEW_MAX = 60;

export class JsonTreeProvider implements vscode.TreeDataProvider<JsonTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JsonTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private rootNodes: JsonTreeItem[] = [];
  /** Set when no tree can be shown for the current document (shown as the view message). */
  message: string | undefined;

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.rootNodes = this.buildRoots();
    this._onDidChangeTreeData.fire();
  }

  scheduleRefresh(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.refresh(), 500);
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this._onDidChangeTreeData.dispose();
  }

  getTreeItem(element: JsonTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: JsonTreeItem): JsonTreeItem[] {
    return element ? element.children : this.rootNodes;
  }

  getParent(element: JsonTreeItem): JsonTreeItem | undefined {
    return element.parent;
  }

  get roots(): JsonTreeItem[] {
    return this.rootNodes;
  }

  private buildRoots(): JsonTreeItem[] {
    this.message = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonDocument(editor.document)) return [];

    const doc = editor.document;
    if (isLargeDocument(doc)) {
      this.message = 'File is too large for the tree view (see jsonPro.largeFileThresholdKB)';
      return [];
    }
    const text = doc.getText();
    if (text.trim().length === 0) return [];

    const errors: jsoncParser.ParseError[] = [];
    const root = jsoncParser.parseTree(text, errors, { allowTrailingComma: true });
    if (!root || errors.length > 0) {
      this.message = 'Document has syntax errors — tree unavailable';
      return [];
    }
    return buildChildren(root, doc, undefined);
  }
}

/** Build the direct children of an object/array node. Grandchildren are built lazily on expand. */
function buildChildren(node: jsoncParser.Node, doc: vscode.TextDocument, parent: JsonTreeItem | undefined): JsonTreeItem[] {
  if (node.type === 'object' && node.children) {
    return node.children.map(prop => {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];
      const key = keyNode ? String(jsoncParser.getNodeValue(keyNode)) : '?';
      return new JsonTreeItem(key, valueNode ?? keyNode, doc, parent);
    });
  }
  if (node.type === 'array' && node.children) {
    return node.children.map((child, i) => new JsonTreeItem(String(i), child, doc, parent));
  }
  return [];
}

function previewFor(node: jsoncParser.Node | undefined): string {
  if (!node) return 'null';
  const count = node.children?.length ?? 0;
  if (node.type === 'object') return `{${count}}`;
  if (node.type === 'array') return `[${count}]`;
  const value = jsoncParser.getNodeValue(node);
  const raw = typeof value === 'string' ? value : String(value);
  const clipped = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw;
  return typeof value === 'string' ? `"${clipped}"` : clipped;
}

export class JsonTreeItem extends vscode.TreeItem {
  private _children: JsonTreeItem[] | undefined;

  constructor(
    key: string,
    private readonly node: jsoncParser.Node | undefined,
    private readonly doc: vscode.TextDocument,
    readonly parent: JsonTreeItem | undefined
  ) {
    super(key, hasChildren(node) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    const preview = previewFor(node);
    this.description = preview;
    this.tooltip = `${key}: ${preview}`;
    this.iconPath = iconFor(node);
    if (node) {
      this.command = { command: 'jsonPro.revealNode', title: 'Reveal in Editor', arguments: [doc, node] };
    }
  }

  get children(): JsonTreeItem[] {
    if (!this._children) {
      this._children = this.node ? buildChildren(this.node, this.doc, this) : [];
    }
    return this._children;
  }
}

function hasChildren(node: jsoncParser.Node | undefined): boolean {
  return !!node && (node.type === 'object' || node.type === 'array') && (node.children?.length ?? 0) > 0;
}

function iconFor(node: jsoncParser.Node | undefined): vscode.ThemeIcon {
  switch (node?.type) {
    case 'object': return new vscode.ThemeIcon('symbol-object');
    case 'array': return new vscode.ThemeIcon('symbol-array');
    case 'string': return new vscode.ThemeIcon('symbol-string');
    case 'number': return new vscode.ThemeIcon('symbol-number');
    case 'boolean': return new vscode.ThemeIcon('symbol-boolean');
    default: return new vscode.ThemeIcon('symbol-null');
  }
}

export async function revealNode(doc: vscode.TextDocument, node: jsoncParser.Node): Promise<void> {
  let editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
  if (!editor) {
    try { editor = await vscode.window.showTextDocument(doc, { preserveFocus: false }); } catch { return; }
  }
  const start = doc.positionAt(node.offset);
  const end = doc.positionAt(node.offset + node.length);
  editor.selection = new vscode.Selection(start, start);
  editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
}
