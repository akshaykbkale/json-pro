import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

const output = vscode.window.createOutputChannel('JSON Pro');

export class JsonTreeProvider implements vscode.TreeDataProvider<JsonTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<JsonTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private rootNodes: JsonTreeItem[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.refresh();
  }

  refresh(): void {
    this.rootNodes = this.buildTree();
    this._onDidChangeTreeData.fire();
  }

  scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.refresh(), 500);
  }

  getTreeItem(element: JsonTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: JsonTreeItem): JsonTreeItem[] {
    if (!element) {
      return this.rootNodes;
    }
    return element.children;
  }

  private buildTree(): JsonTreeItem[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return [];

    const doc = editor.document;
    if (doc.languageId !== 'json' && doc.languageId !== 'jsonc') return [];

    const text = doc.getText();
    if (text.trim().length === 0) return [];

    const errors: jsoncParser.ParseError[] = [];
    const root = jsoncParser.parseTree(text, errors);

    if (!root || errors.length > 0) {
      output.appendLine(`[treeProvider] Parse errors: ${errors.length}`);
      return [];
    }

    return buildItems(root, doc, text);
  }
}

function buildItems(
  node: jsoncParser.Node,
  doc: vscode.TextDocument,
  text: string
): JsonTreeItem[] {
  if (node.type === 'object' && node.children) {
    return node.children.map((prop) => {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];
      const key = keyNode ? String(jsoncParser.getNodeValue(keyNode)) : '?';
      return buildItem(key, valueNode, doc, text);
    });
  }
  if (node.type === 'array' && node.children) {
    return node.children.map((child, i) => buildItem(String(i), child, doc, text));
  }
  return [];
}

function buildItem(
  key: string,
  node: jsoncParser.Node | undefined,
  doc: vscode.TextDocument,
  text: string
): JsonTreeItem {
  if (!node) {
    return new JsonTreeItem(key, 'null', [], doc, node);
  }

  if (node.type === 'object') {
    const children = buildItems(node, doc, text);
    return new JsonTreeItem(key, '{}', children, doc, node);
  }

  if (node.type === 'array') {
    const children = buildItems(node, doc, text);
    return new JsonTreeItem(key, `[${node.children?.length ?? 0}]`, children, doc, node);
  }

  const value = jsoncParser.getNodeValue(node);
  const preview = typeof value === 'string' ? `"${value}"` : String(value);
  return new JsonTreeItem(key, preview, [], doc, node);
}

export class JsonTreeItem extends vscode.TreeItem {
  children: JsonTreeItem[];

  constructor(
    key: string,
    preview: string,
    children: JsonTreeItem[],
    private doc: vscode.TextDocument,
    private node: jsoncParser.Node | undefined
  ) {
    super(
      key,
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.children = children;
    this.description = preview;
    this.tooltip = `${key}: ${preview}`;

    if (node) {
      this.command = {
        command: 'jsonPro.revealNode',
        title: 'Reveal in Editor',
        arguments: [doc, node],
      };
    }
  }
}

export function revealNode(doc: vscode.TextDocument, node: jsoncParser.Node): void {
  const editor = vscode.window.visibleTextEditors.find((e) => e.document === doc);
  if (!editor) return;

  const start = doc.positionAt(node.offset);
  const end = doc.positionAt(node.offset + node.length);
  const range = new vscode.Range(start, end);
  editor.selection = new vscode.Selection(start, start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}
