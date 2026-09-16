import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { isJsonDocument } from './editorUtils';

const PREVIEW_MAX = 60;

export class JsonTreeProvider implements vscode.TreeDataProvider<JsonTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JsonTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private rootNodes: JsonTreeItem[] = [];
  /** Set when the current document could not be parsed (shown as the view message). */
  message: string | undefined;

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.rootNodes = this.buildTree();
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

  private buildTree(): JsonTreeItem[] {
    this.message = undefined;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isJsonDocument(editor.document)) return [];

    const doc = editor.document;
    const text = doc.getText();
    if (text.trim().length === 0) return [];

    const errors: jsoncParser.ParseError[] = [];
    const root = jsoncParser.parseTree(text, errors, { allowTrailingComma: true });
    if (!root || errors.length > 0) {
      this.message = 'Document has syntax errors — tree unavailable';
      return [];
    }
    return buildItems(root, doc, undefined);
  }
}

function buildItems(node: jsoncParser.Node, doc: vscode.TextDocument, parent: JsonTreeItem | undefined): JsonTreeItem[] {
  if (node.type === 'object' && node.children) {
    return node.children.map(prop => {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];
      const key = keyNode ? String(jsoncParser.getNodeValue(keyNode)) : '?';
      return buildItem(key, valueNode ?? keyNode, doc, parent);
    });
  }
  if (node.type === 'array' && node.children) {
    return node.children.map((child, i) => buildItem(String(i), child, doc, parent));
  }
  return [];
}

function buildItem(key: string, node: jsoncParser.Node | undefined, doc: vscode.TextDocument, parent: JsonTreeItem | undefined): JsonTreeItem {
  if (!node) return new JsonTreeItem(key, 'null', false, doc, undefined, parent);

  if (node.type === 'object') {
    const count = node.children?.length ?? 0;
    const item = new JsonTreeItem(key, `{${count}}`, count > 0, doc, node, parent);
    item.children = buildItems(node, doc, item);
    return item;
  }
  if (node.type === 'array') {
    const count = node.children?.length ?? 0;
    const item = new JsonTreeItem(key, `[${count}]`, count > 0, doc, node, parent);
    item.children = buildItems(node, doc, item);
    return item;
  }

  const value = jsoncParser.getNodeValue(node);
  const raw = typeof value === 'string' ? value : String(value);
  const clipped = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw;
  return new JsonTreeItem(key, typeof value === 'string' ? `"${clipped}"` : clipped, false, doc, node, parent);
}

export class JsonTreeItem extends vscode.TreeItem {
  children: JsonTreeItem[] = [];

  constructor(
    key: string,
    preview: string,
    hasChildren: boolean,
    doc: vscode.TextDocument,
    node: jsoncParser.Node | undefined,
    readonly parent: JsonTreeItem | undefined
  ) {
    super(key, hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.description = preview;
    this.tooltip = `${key}: ${preview}`;
    this.iconPath = iconFor(node);
    if (node) {
      this.command = { command: 'jsonPro.revealNode', title: 'Reveal in Editor', arguments: [doc, node] };
    }
  }
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
