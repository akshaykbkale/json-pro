import * as vscode from 'vscode';
import { computeMerge, ArrayStrategy } from './core/merge';
import { generateNonce, getIndent, isJsonDocument, pickJsonFile, replaceDocumentText, resolveDocument, statusMessage } from './editorUtils';

/** Open the merge panel with the given editor's document as the left side and apply target. */
export function openMergePanel(context: vscode.ExtensionContext, editor: vscode.TextEditor | undefined): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProMerge',
    'JSON Pro: Merge',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const source = editor && isJsonDocument(editor.document) ? editor.document : undefined;
  const sourceUri = source?.uri;
  const sourceName = sourceUri ? vscode.workspace.asRelativePath(sourceUri) : undefined;
  const indent = getIndent(source);

  panel.webview.html = getHtml(nonce, sourceName);
  void panel.webview.postMessage({ command: 'init', json: source?.getText() ?? '' });

  const sub = panel.webview.onDidReceiveMessage(
    async (msg: { command: string; left?: string; right?: string; merged?: string; arrays?: ArrayStrategy }) => {
      if (msg.command === 'merge') {
        const result = computeMerge(msg.left ?? '', msg.right ?? '', msg.arrays ?? 'concat', indent);
        void panel.webview.postMessage({ command: 'mergeResult', ...result });
      } else if (msg.command === 'applyToEditor') {
        const doc = await resolveDocument(sourceUri);
        if (!doc) {
          void vscode.window.showWarningMessage('JSON Pro: The original document is no longer available — opening the result in a new tab instead.');
          await openInTab(msg.merged ?? '');
          return;
        }
        await replaceDocumentText(doc, msg.merged ?? '');
        statusMessage('Merged JSON applied');
        await vscode.window.showTextDocument(doc, { preview: false });
        panel.dispose();
      } else if (msg.command === 'openInTab') {
        await openInTab(msg.merged ?? '');
      } else if (msg.command === 'copy') {
        await vscode.env.clipboard.writeText(msg.merged ?? '');
      } else if (msg.command === 'pickFile') {
        const text = await pickJsonFile();
        if (text !== undefined) void panel.webview.postMessage({ command: 'setRight', json: text });
      }
    }
  );
  panel.onDidDispose(() => sub.dispose(), undefined, context.subscriptions);
}

async function openInTab(content: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language: 'json' });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}

function getHtml(nonce: string, sourceName: string | undefined): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Merge JSON</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--vscode-editorGroupHeader-tabsBackground);
             border-bottom: 1px solid var(--vscode-editorGroup-border, #333); flex-shrink: 0; flex-wrap: wrap; }
  .toolbar-title { font-weight: 600; font-size: 0.9em; }
  .spacer { flex: 1; }
  label { font-size: 0.82em; opacity: 0.8; display: flex; align-items: center; gap: 6px; }
  select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground);
           border: 1px solid var(--vscode-dropdown-border, #555); border-radius: 3px; padding: 3px 6px; font-size: 0.84em; }
  button { padding: 5px 14px; cursor: pointer; border: none; border-radius: 3px; font-size: 0.84em; white-space: nowrap; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .btn-small { padding: 2px 8px; font-size: 0.78em; margin-left: auto; }
  .layout { display: flex; flex: 1; overflow: hidden; }
  .col { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .col + .col { border-left: 1px solid var(--vscode-editorGroup-border, #333); }
  .col-header { padding: 6px 12px; font-size: 0.78em; font-weight: 600; opacity: 0.8; background: var(--vscode-editorGroupHeader-tabsBackground);
                border-bottom: 1px solid var(--vscode-editorGroup-border, #333); flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
  .col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .col-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  textarea { flex: 1; resize: none; padding: 10px 12px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
             background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); border: none; outline: none; }
  textarea.error { background: rgba(224,82,82,0.06); }
  .error-label { font-size: 0.78em; color: var(--vscode-errorForeground, #e05252); padding: 4px 12px; flex-shrink: 0; min-height: 20px; }
  .result-code { flex: 1; overflow: auto; padding: 10px 12px; font-family: var(--vscode-editor-font-family);
                 font-size: var(--vscode-editor-font-size); white-space: pre; color: var(--vscode-editor-foreground); }
  .result-actions { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--vscode-editorGroup-border, #333); flex-shrink: 0; flex-wrap: wrap; }
  .empty-result { flex: 1; display: flex; align-items: center; justify-content: center; opacity: 0.4; flex-direction: column; gap: 10px; font-size: 0.9em; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-title">🔀 Merge JSON</span>
  <span class="spacer"></span>
  <label>Arrays
    <select id="arrays">
      <option value="concat">concatenate</option>
      <option value="replace">right replaces left</option>
    </select>
  </label>
  <button class="btn-primary" id="mergeBtn">⇒ Merge</button>
</div>
<div class="layout">
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#569cd6"></span>Left (base)${sourceName ? ` — ${escapeHtml(sourceName)}` : ''}</div>
    <div class="col-body">
      <textarea id="left" placeholder="Paste base JSON here..." spellcheck="false"></textarea>
      <div id="left-error" class="error-label"></div>
    </div>
  </div>
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#4ec9b0"></span>Right (overrides)
      <button class="btn-secondary btn-small" id="pickRight">Load file…</button></div>
    <div class="col-body">
      <textarea id="right" placeholder="Paste JSON to merge in..." spellcheck="false"></textarea>
      <div id="right-error" class="error-label"></div>
    </div>
  </div>
  <div class="col">
    <div class="col-header"><span class="col-dot" style="background:#3fb950"></span>Merged Result</div>
    <div class="col-body">
      <div class="empty-result" id="empty">
        <div style="font-size:2em">🔀</div>
        <div>Click <strong>Merge</strong> to see the result</div>
        <div style="font-size:0.85em;opacity:0.6">Right values override left on conflicts</div>
      </div>
      <div class="result-code hidden" id="result-code"></div>
      <div class="result-actions hidden" id="result-actions">
        <button class="btn-primary" id="applyBtn"${sourceName ? '' : ' disabled title="No source document"'}>✓ Apply to ${sourceName ? escapeHtml(sourceName) : 'Editor'}</button>
        <button class="btn-secondary" id="openBtn">Open in New Tab</button>
        <button class="btn-secondary" id="copyBtn">Copy</button>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let mergedText = '';
  const $ = id => document.getElementById(id);

  $('mergeBtn').addEventListener('click', doMerge);
  $('pickRight').addEventListener('click', () => vscode.postMessage({ command: 'pickFile' }));
  $('applyBtn').addEventListener('click', () => vscode.postMessage({ command: 'applyToEditor', merged: mergedText }));
  $('openBtn').addEventListener('click', () => vscode.postMessage({ command: 'openInTab', merged: mergedText }));
  $('copyBtn').addEventListener('click', () => vscode.postMessage({ command: 'copy', merged: mergedText }));
  ['left', 'right'].forEach(id => $(id).addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doMerge();
  }));

  function doMerge() {
    clearErrors();
    vscode.postMessage({ command: 'merge', left: $('left').value, right: $('right').value, arrays: $('arrays').value });
  }
  function clearErrors() {
    ['left', 'right'].forEach(id => { $(id).classList.remove('error'); $(id + '-error').textContent = ''; });
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'init') { $('left').value = msg.json || ''; return; }
    if (msg.command === 'setRight') { $('right').value = msg.json || ''; return; }
    if (msg.command !== 'mergeResult') return;
    if (msg.type === 'error') {
      $(msg.side).classList.add('error');
      $(msg.side + '-error').textContent = '⚠ ' + msg.message;
      return;
    }
    mergedText = msg.merged;
    $('empty').classList.add('hidden');
    $('result-code').textContent = mergedText;
    $('result-code').classList.remove('hidden');
    $('result-actions').classList.remove('hidden');
  });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
