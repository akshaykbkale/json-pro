import * as vscode from 'vscode';

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

export function openMergePanel(context: vscode.ExtensionContext, initialLeft: string): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProMerge',
    'JSON Pro: Merge',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getHtml(nonce);
  // Send initial JSON safely via postMessage — never interpolated into HTML
  panel.webview.postMessage({ command: 'init', json: initialLeft });

  panel.webview.onDidReceiveMessage(
    async (msg: { command: string; left: string; right: string; merged: string }) => {
      if (msg.command === 'merge') {
        const result = computeMerge(msg.left, msg.right);
        panel.webview.postMessage({ command: 'mergeResult', ...result });
      } else if (msg.command === 'applyToEditor') {
        await applyToEditor(msg.merged);
        panel.dispose();
      } else if (msg.command === 'openInTab') {
        const doc = await vscode.workspace.openTextDocument({
          content: msg.merged,
          language: 'json',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      }
    },
    undefined,
    context.subscriptions
  );
}

async function applyToEditor(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('JSON Pro: No active editor to apply to.');
    return;
  }
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, range, text);
  await vscode.workspace.applyEdit(edit);
  vscode.window.setStatusBarMessage('$(check) JSON Pro: Merged JSON applied', 3000);
}

interface MergeResult {
  type: 'success' | 'error';
  merged?: string;
  side?: 'left' | 'right';
  message?: string;
}

function computeMerge(leftText: string, rightText: string): MergeResult {
  let left: unknown, right: unknown;

  try { left = JSON.parse(leftText); }
  catch (e) { return { type: 'error', side: 'left', message: e instanceof Error ? e.message : String(e) }; }

  try { right = JSON.parse(rightText); }
  catch (e) { return { type: 'error', side: 'right', message: e instanceof Error ? e.message : String(e) }; }

  const merged = deepMerge(left, right);
  return { type: 'success', merged: JSON.stringify(merged, null, 2) };
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) && Array.isArray(right)) {
    return [...left, ...right];
  }
  if (
    left !== null && right !== null &&
    typeof left === 'object' && typeof right === 'object' &&
    !Array.isArray(left) && !Array.isArray(right)
  ) {
    const result: Record<string, unknown> = Object.create(null);
    // Copy left keys (skip forbidden)
    for (const [key, val] of Object.entries(left as Record<string, unknown>)) {
      if (!FORBIDDEN_KEYS.has(key)) result[key] = val;
    }
    // Merge right keys (skip forbidden)
    for (const [key, val] of Object.entries(right as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      result[key] = key in result ? deepMerge(result[key], val) : val;
    }
    return result;
  }
  // Right wins for scalars / type mismatches
  return right;
}

function getHtml(nonce: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Merge JSON</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  .toolbar {
    display: flex; align-items: center; gap: 8px; padding: 10px 16px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    flex-shrink: 0;
  }
  .toolbar-title { font-weight: 600; font-size: 0.9em; }
  .spacer { flex: 1; }
  button {
    padding: 5px 14px; cursor: pointer; border: none; border-radius: 3px;
    font-size: 0.84em; white-space: nowrap;
  }
  .btn-primary   { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

  /* ── Layout ── */
  .layout { display: flex; flex: 1; overflow: hidden; }
  .col { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .col + .col { border-left: 1px solid var(--vscode-editorGroup-border, #333); }
  .col-header {
    padding: 6px 12px; font-size: 0.78em; font-weight: 600; opacity: 0.6;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    flex-shrink: 0; display: flex; align-items: center; gap: 8px;
  }
  .col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .col-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  textarea {
    flex: 1; resize: none; padding: 10px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    border: none; outline: none;
  }
  textarea.error { background: rgba(224,82,82,0.06); }
  .error-label { font-size: 0.78em; color: #e05252; padding: 4px 12px; flex-shrink: 0; min-height: 20px; }

  /* ── Result pane ── */
  .result-code {
    flex: 1; overflow: auto; padding: 10px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: var(--vscode-editor-font-size);
    white-space: pre; color: var(--vscode-editor-foreground);
  }
  .result-actions {
    display: flex; gap: 8px; padding: 8px 12px;
    border-top: 1px solid var(--vscode-editorGroup-border, #333);
    flex-shrink: 0;
  }
  .empty-result {
    flex: 1; display: flex; align-items: center; justify-content: center;
    opacity: 0.3; flex-direction: column; gap: 10px; font-size: 0.9em;
  }
</style>
</head>
<body>

<div class="toolbar">
  <span class="toolbar-title">🔀 Merge JSON</span>
  <span class="spacer"></span>
  <button class="btn-primary" onclick="doMerge()">⇒ Merge</button>
</div>

<div class="layout">
  <!-- Left -->
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#569cd6"></span>Left (base)</div>
    <div class="col-body">
      <textarea id="left" placeholder="Paste base JSON here..." spellcheck="false"></textarea>
      <div id="left-error" class="error-label"></div>
    </div>
  </div>

  <!-- Right -->
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#4ec9b0"></span>Right (overrides)</div>
    <div class="col-body">
      <textarea id="right" placeholder="Paste JSON to merge in..." spellcheck="false"></textarea>
      <div id="right-error" class="error-label"></div>
    </div>
  </div>

  <!-- Result -->
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#3fb950"></span>Merged Result</div>
    <div class="col-body" id="result-body">
      <div class="empty-result">
        <div style="font-size:2em">🔀</div>
        <div>Click <strong>Merge</strong> to see the result</div>
        <div style="font-size:0.85em;opacity:0.6">Right values override left for conflicts</div>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let mergedText = '';

  function doMerge() {
    const left  = document.getElementById('left').value;
    const right = document.getElementById('right').value;
    clearErrors();
    vscode.postMessage({ command: 'merge', left, right });
  }

  function clearErrors() {
    ['left','right'].forEach(id => {
      document.getElementById(id).classList.remove('error');
      document.getElementById(id + '-error').textContent = '';
    });
  }

  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.command === 'init') {
      document.getElementById('left').value = msg.json || '';
      return;
    }

    if (msg.command !== 'mergeResult') return;

    if (msg.type === 'error') {
      const el = document.getElementById(msg.side);
      el.classList.add('error');
      document.getElementById(msg.side + '-error').textContent = '⚠ ' + msg.message;
      return;
    }

    mergedText = msg.merged;
    document.getElementById('result-body').innerHTML =
      '<div class="result-code" id="result-code">' + esc(msg.merged) + '</div>' +
      '<div class="result-actions">' +
        '<button class="btn-primary" onclick="applyToEditor()">✓ Apply to Editor</button>' +
        '<button class="btn-secondary" onclick="openInTab()">Open in New Tab</button>' +
        '<button class="btn-secondary" onclick="copyResult()">Copy</button>' +
      '</div>';
  });

  function applyToEditor() {
    vscode.postMessage({ command: 'applyToEditor', merged: mergedText });
  }
  function openInTab() {
    vscode.postMessage({ command: 'openInTab', merged: mergedText });
  }
  function copyResult() {
    navigator.clipboard.writeText(mergedText);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
</script>
</body>
</html>`;
}
