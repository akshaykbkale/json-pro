import * as vscode from 'vscode';
import { getOutputChannel } from './outputChannel';

const output = getOutputChannel();

export async function fixJson(editor: vscode.TextEditor): Promise<void> {
  const document = editor.document;
  const text = document.getText();

  if (text.trim().length === 0) {
    return;
  }

  let fixed = text;

  // 1. Strip JS block comments (/* ... */)
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 2. Strip JS line comments (//)
  fixed = fixed.replace(/\/\/[^\n\r]*/g, '');

  // 3. Replace single-quoted strings with double-quoted strings
  // Uses non-backtracking alternation (?: ) to avoid ReDoS
  fixed = fixed.replace(/'((?:[^'\\]|\\.)*)'/g, (_, inner: string) => {
    const escaped = inner.replace(/"/g, '\\"').replace(/\\'/g, "'");
    return `"${escaped}"`;
  });

  // 4. Add double quotes around unquoted keys (e.g. { key: "value" })
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

  // 5. Remove trailing commas before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // 6. Balance missing closing brackets and braces
  fixed = balanceBrackets(fixed);

  // Validate
  try {
    JSON.parse(fixed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    output.appendLine(`[fixer] Still invalid after fixes: ${msg}`);
    vscode.window.setStatusBarMessage(`$(error) JSON Pro: Still invalid after auto-fix — ${msg}`, 5000);
    return;
  }

  // Show diff preview then apply
  await showDiffAndApply(document, text, fixed);
}


function balanceBrackets(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
    } else if (ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
    }
  }

  // Append missing closing brackets/braces in reverse order
  let result = text.trimEnd();
  while (stack.length > 0) {
    result += stack.pop() === '{' ? '}' : ']';
  }
  return result;
}

async function showDiffAndApply(
  document: vscode.TextDocument,
  original: string,
  fixed: string
): Promise<void> {
  const originalUri = vscode.Uri.parse('jsonpro-diff:Original.json');
  const fixedUri = vscode.Uri.parse('jsonpro-diff:Fixed.json');

  const provider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return uri.path === 'Original.json' ? original : fixed;
    }
  })();

  const reg = vscode.workspace.registerTextDocumentContentProvider('jsonpro-diff', provider);

  await vscode.commands.executeCommand(
    'vscode.diff',
    originalUri,
    fixedUri,
    'JSON Pro: Auto-Fix Preview (Original ↔ Fixed)',
    { preview: true, viewColumn: vscode.ViewColumn.Beside }
  );

  const answer = await vscode.window.showInformationMessage(
    'Apply auto-fix to document?',
    { modal: false },
    'Apply',
    'Discard'
  );

  reg.dispose();

  if (answer === 'Apply') {
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, fixed);
    await vscode.workspace.applyEdit(edit);
    vscode.window.setStatusBarMessage('$(check) JSON Pro: Auto-fix applied', 3000);
  }
}

