import * as vscode from 'vscode';
import { computeJsonDiff } from './core/diff';
import { generateNonce, getIndent, isJsonDocument, pickJsonFile, replaceDocumentText, resolveDocument, statusMessage } from './editorUtils';

/** Open the diff panel with the active JSON document pre-filled on the left. */
export function openDiffPanel(context: vscode.ExtensionContext, editor: vscode.TextEditor | undefined): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProDiff',
    'JSON Pro: Diff',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const source = editor && isJsonDocument(editor.document) ? editor.document : undefined;
  const sourceUri = source?.uri;
  const sourceName = sourceUri ? vscode.workspace.asRelativePath(sourceUri) : undefined;
  const indent = getIndent(source);

  panel.webview.html = getWebviewHtml(nonce, sourceName);
  void panel.webview.postMessage({ command: 'init', json: source?.getText() ?? '', name: sourceName ?? 'original' });

  const sub = panel.webview.onDidReceiveMessage(
    async (msg: { command: string; left?: string; right?: string; leftName?: string; rightName?: string; side?: 'left' | 'right'; text?: string }) => {
      if (msg.command === 'compare') {
        const result = computeJsonDiff(msg.left ?? '', msg.right ?? '', indent);
        void panel.webview.postMessage({
          command: 'diffResult',
          leftName: msg.leftName || 'original',
          rightName: msg.rightName || 'modified',
          ...result,
        });
      } else if (msg.command === 'applyToEditor') {
        const doc = await resolveDocument(sourceUri);
        if (!doc) {
          void vscode.window.showWarningMessage('JSON Pro: The original document is no longer available.');
          return;
        }
        await replaceDocumentText(doc, msg.right ?? '');
        statusMessage('Diff applied to editor');
        await vscode.window.showTextDocument(doc, { preview: false });
      } else if (msg.command === 'pickFile') {
        const text = await pickJsonFile();
        if (text !== undefined) void panel.webview.postMessage({ command: 'setSide', side: msg.side, json: text });
      } else if (msg.command === 'copy' && typeof msg.text === 'string') {
        await vscode.env.clipboard.writeText(msg.text);
      }
    }
  );
  panel.onDidDispose(() => sub.dispose(), undefined, context.subscriptions);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getWebviewHtml(nonce: string, sourceName: string | undefined): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSON Diff</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  #input-section { display: flex; flex-direction: column; flex: 1; padding: 16px; gap: 12px; overflow: auto; }
  .input-row { display: flex; gap: 12px; flex: 1; min-height: 0; }
  .input-col { display: flex; flex-direction: column; flex: 1; gap: 6px; min-width: 0; }
  .input-head { display: flex; gap: 6px; align-items: center; }
  .input-col input { flex: 1; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border, #555);
                     background: var(--vscode-input-background); color: var(--vscode-input-foreground); font-size: 0.85em; min-width: 0; }
  .input-col textarea { flex: 1; padding: 8px; resize: none; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
                        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border, #555); border-radius: 4px; }
  .input-col textarea.error { border-color: var(--vscode-errorForeground, #e05252); }
  .error-msg { color: var(--vscode-errorForeground, #e05252); font-size: 0.82em; min-height: 16px; }
  .input-actions { display: flex; gap: 8px; align-items: center; }
  .input-actions .hint { font-size: 0.8em; opacity: 0.5; }
  #result-section { display: none; flex-direction: column; flex: 1; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--vscode-editorGroupHeader-tabsBackground);
             border-bottom: 1px solid var(--vscode-editorGroup-border, #333); flex-shrink: 0; flex-wrap: wrap; }
  .toolbar-label { font-weight: 600; margin-right: 8px; font-size: 0.9em; opacity: 0.8; }
  .toolbar-sep { flex: 1; }
  .summary { display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex-shrink: 0; background: var(--vscode-editorWidget-background, #252526);
             border-bottom: 1px solid var(--vscode-editorGroup-border, #333); font-size: 0.82em; }
  .summary-label { opacity: 0.6; font-weight: 600; }
  .diff-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .diff-headers { display: flex; flex-shrink: 0; border-bottom: 1px solid var(--vscode-editorGroup-border, #333); }
  .diff-header-col { flex: 1; padding: 5px 12px; font-size: 0.82em; font-weight: 600; background: var(--vscode-editorGroupHeader-tabsBackground);
                     display: flex; align-items: center; gap: 6px; }
  .diff-header-col + .diff-header-col { border-left: 1px solid var(--vscode-editorGroup-border, #333); }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.red { background: #e05252; } .dot.green { background: #3fb950; }
  .diff-body { flex: 1; overflow: auto; }
  .diff-table { width: 100%; border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size, 13px); table-layout: fixed; }
  .diff-table td { padding: 1px 0; vertical-align: top; white-space: pre; }
  .ln { width: 48px; min-width: 48px; text-align: right; padding: 1px 8px; opacity: 0.4; user-select: none; font-size: 0.88em; }
  .code { padding: 1px 12px; width: 100%; overflow: hidden; text-overflow: ellipsis; }
  tr.added .ln-left, tr.added .code-left { background: rgba(63,185,80,0.06); }
  tr.added .ln-right, tr.added .code-right { background: rgba(63,185,80,0.18); }
  tr.removed .ln-left, tr.removed .code-left { background: rgba(224,82,82,0.18); }
  tr.removed .ln-right, tr.removed .code-right { background: rgba(224,82,82,0.06); }
  tr.changed .ln-left, tr.changed .code-left, tr.changed .ln-right, tr.changed .code-right { background: rgba(210,153,34,0.18); }
  .mid-border { width: 1px; min-width: 1px; background: var(--vscode-editorGroup-border, #333); padding: 0; }
  tr.current-diff td { outline: 1px solid var(--vscode-focusBorder, rgba(255,255,255,0.4)); outline-offset: -1px; }
  button { padding: 4px 12px; cursor: pointer; border: none; border-radius: 3px; background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); font-size: 0.85em; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  button.small { padding: 2px 8px; font-size: 0.78em; }
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 10px; font-size: 0.82em; }
  .badge.added { background: rgba(63,185,80,0.2); color: #3fb950; }
  .badge.removed { background: rgba(224,82,82,0.2); color: #e05252; }
  .badge.changed { background: rgba(210,153,34,0.2); color: #d29922; }
  .badge.same { background: rgba(128,128,128,0.15); opacity: 0.7; }
  .badge.identical { background: rgba(63,185,80,0.2); color: #3fb950; font-weight: 600; }
</style>
</head>
<body>
<div id="input-section">
  <div class="input-row">
    <div class="input-col">
      <div class="input-head"><input type="text" id="left-name" placeholder="Left label (e.g. original)" value="original">
        <button class="secondary small" data-pick="left">Load file…</button></div>
      <textarea id="left" placeholder="Paste original JSON here..." spellcheck="false"></textarea>
      <div id="left-error" class="error-msg"></div>
    </div>
    <div class="input-col">
      <div class="input-head"><input type="text" id="right-name" placeholder="Right label (e.g. modified)" value="modified">
        <button class="secondary small" data-pick="right">Load file…</button></div>
      <textarea id="right" placeholder="Paste modified JSON here..." spellcheck="false"></textarea>
      <div id="right-error" class="error-msg"></div>
    </div>
  </div>
  <div class="input-actions">
    <button id="compareBtn">Compare</button>
    <span class="hint">Ctrl/Cmd+Enter to compare · both sides are normalised before diffing, so formatting differences are ignored</span>
  </div>
</div>

<div id="result-section">
  <div class="toolbar">
    <span class="toolbar-label">JSON Diff</span>
    <button class="secondary" data-action="swap">&#8597; Swap</button>
    <button class="secondary" data-action="prev">&#8593; Prev</button>
    <button class="secondary" data-action="next">&#8595; Next</button>
    <button class="secondary" data-action="copyRight">Copy Right</button>
    <button data-action="apply" id="applyBtn"${sourceName ? '' : ' disabled title="No source document to apply to"'}>&#10003; Apply Right to ${sourceName ? escapeHtml(sourceName) : 'Editor'}</button>
    <span class="toolbar-sep"></span>
    <button class="secondary" data-action="back">&#8592; Edit</button>
  </div>
  <div class="summary" id="summary"></div>
  <div class="diff-wrap">
    <div class="diff-headers">
      <div class="diff-header-col"><span class="dot red"></span><span id="left-title">original</span></div>
      <div class="diff-header-col"><span class="dot green"></span><span id="right-title">modified</span></div>
    </div>
    <div class="diff-body"><table class="diff-table"><tbody id="diff-tbody"></tbody></table></div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  let diffRows = [], diffIndices = [], currentDiffIdx = -1, lastFormattedRight = '';

  $('compareBtn').addEventListener('click', sendCompare);
  ['left', 'right'].forEach(id => $(id).addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendCompare(); }));
  document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ command: 'pickFile', side: b.dataset.pick })));
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => actions[b.dataset.action]()));

  const actions = {
    back: () => { $('result-section').style.display = 'none'; $('input-section').style.display = 'flex'; },
    swap: () => {
      const lv = $('left').value, rv = $('right').value, ln = $('left-name').value, rn = $('right-name').value;
      $('left').value = rv; $('right').value = lv; $('left-name').value = rn; $('right-name').value = ln;
      sendCompare();
    },
    prev: () => { if (!diffIndices.length) return; currentDiffIdx = (currentDiffIdx - 1 + diffIndices.length) % diffIndices.length; scrollToDiff(diffIndices[currentDiffIdx]); },
    next: () => { if (!diffIndices.length) return; currentDiffIdx = (currentDiffIdx + 1) % diffIndices.length; scrollToDiff(diffIndices[currentDiffIdx]); },
    copyRight: () => vscode.postMessage({ command: 'copy', text: lastFormattedRight }),
    apply: () => vscode.postMessage({ command: 'applyToEditor', right: lastFormattedRight }),
  };

  function sendCompare() {
    clearErrors();
    vscode.postMessage({ command: 'compare', left: $('left').value, right: $('right').value,
                         leftName: $('left-name').value, rightName: $('right-name').value });
  }
  function clearErrors() {
    ['left', 'right'].forEach(id => { $(id).classList.remove('error'); $(id + '-error').textContent = ''; });
  }
  function scrollToDiff(rowIdx) {
    diffRows.forEach(r => r.classList.remove('current-diff'));
    const row = diffRows[rowIdx];
    if (row) { row.classList.add('current-diff'); row.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (data.command === 'init') { $('left').value = data.json || ''; if (data.name) $('left-name').value = data.name; return; }
    if (data.command === 'setSide') { $(data.side).value = data.json || ''; return; }
    if (data.command !== 'diffResult') return;

    if (data.type === 'error') {
      clearErrors();
      if (data.side === 'both') { $('left-error').textContent = data.message; return; }
      $(data.side).classList.add('error');
      $(data.side + '-error').textContent = 'Invalid JSON: ' + data.message;
      return;
    }

    lastFormattedRight = data.formattedRight;
    $('left').value = data.formattedLeft;
    $('right').value = data.formattedRight;
    $('left-title').textContent = data.leftName || 'original';
    $('right-title').textContent = data.rightName || 'modified';

    const s = data.summary;
    const identical = s.added + s.removed + s.changed === 0;
    $('summary').innerHTML = '<span class="summary-label">diff result</span>' +
      (identical ? badge('✓ documents are semantically identical', 'identical') : '') +
      badge('+' + s.added + ' added', 'added') + badge('-' + s.removed + ' removed', 'removed') +
      badge('~' + s.changed + ' changed', 'changed') + badge('=' + s.same + ' same', 'same');

    const tbody = $('diff-tbody');
    tbody.innerHTML = '';
    diffRows = []; diffIndices = []; currentDiffIdx = -1;
    const frag = document.createDocumentFragment();
    data.lines.forEach((line, idx) => {
      const tr = document.createElement('tr');
      tr.className = line.type;
      tr.append(td('ln ln-left', line.leftNum !== null ? String(line.leftNum) : ''), td('code code-left', line.leftLine),
                td('mid-border', ''), td('ln ln-right', line.rightNum !== null ? String(line.rightNum) : ''), td('code code-right', line.rightLine));
      frag.appendChild(tr);
      diffRows.push(tr);
      if (line.type !== 'equal') diffIndices.push(idx);
    });
    tbody.appendChild(frag);

    $('input-section').style.display = 'none';
    $('result-section').style.display = 'flex';
    if (diffIndices.length > 0) { currentDiffIdx = 0; setTimeout(() => scrollToDiff(diffIndices[0]), 50); }
  });

  function badge(text, cls) { const s = document.createElement('span'); s.className = 'badge ' + cls; s.textContent = text; return s.outerHTML; }
  function td(cls, text) { const el = document.createElement('td'); el.className = cls; el.textContent = text; return el; }
</script>
</body>
</html>`;
}
