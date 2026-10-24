import * as vscode from 'vscode';
import { computeMerge, ArrayStrategy } from './core/merge';
import { generateNonce, getIndent, isJsonDocument, pickJsonFile, replaceDocumentText, resolveDocument, statusMessage } from './editorUtils';
import { escapeHtml, icon, renderPage } from './webview/ui';

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

const CSS = /* css */`
  body { display: flex; flex-direction: column; overflow: hidden; }
  .layout { display: flex; gap: 12px; flex: 1; overflow: hidden; padding: 12px; }
  .layout .card { flex: 1; min-height: 0; }
  .layout .card-content { flex: 1; }
  .layout .textarea { flex: 1; }
  .dot-l { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .result-code { flex: 1; overflow: auto; font-family: var(--font-mono); font-size: var(--vscode-editor-font-size, 13px); white-space: pre;
                 line-height: 1.5; padding: 10px 12px; border-radius: var(--radius); background: var(--muted); border: 1px solid var(--border); }
  .hidden { display: none !important; }
  .empty { flex: 1; }
`;

function getHtml(nonce: string, sourceName: string | undefined): string {
  const body = /* html */`
<div class="toolbar">
  <span class="toolbar-title">${icon('merge', 15)} Merge JSON</span>
  <span class="text-xs muted">Right values override left on conflicts</span>
  <span class="spacer"></span>
  <label class="row text-xs muted" style="gap:6px">Arrays
    <select class="select" id="arrays" style="width:170px">
      <option value="concat">concatenate</option>
      <option value="replace">right replaces left</option>
    </select>
  </label>
  <button class="btn btn-default" id="mergeBtn">${icon('merge')} Merge</button>
</div>
<div class="layout">
  <div class="card">
    <div class="card-header row">
      <div><div class="card-title"><span class="dot-l" style="background:var(--tok-key,#569cd6)"></span>Base</div>
           <div class="card-description truncate">${sourceName ? escapeHtml(sourceName) : 'Left side'}</div></div>
    </div>
    <div class="card-content">
      <textarea class="textarea mono" id="left" placeholder="Paste base JSON here…" spellcheck="false"></textarea>
      <div id="left-error" class="field-error"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header row">
      <div><div class="card-title"><span class="dot-l" style="background:var(--success)"></span>Overrides</div><div class="card-description">Right side — wins on conflicts</div></div>
      <button class="btn btn-outline btn-sm" id="pickRight">${icon('file')} Load file…</button>
    </div>
    <div class="card-content">
      <textarea class="textarea mono" id="right" placeholder="Paste JSON to merge in…" spellcheck="false"></textarea>
      <div id="right-error" class="field-error"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header row">
      <div><div class="card-title">${icon('check')} Merged result</div><div class="card-description">Deep merge of both sides</div></div>
    </div>
    <div class="card-content">
      <div class="empty" id="empty">
        ${icon('merge', 28)}
        <div>Click <strong>Merge</strong> to see the result</div>
        <div class="text-xs"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> in either editor also merges</div>
      </div>
      <div class="result-code hidden" id="result-code"></div>
      <div class="row hidden" id="result-actions">
        <button class="btn btn-default btn-sm" id="applyBtn"${sourceName ? '' : ' disabled title="No source document"'}>${icon('check')} Apply to ${sourceName ? escapeHtml(sourceName) : 'editor'}</button>
        <button class="btn btn-outline btn-sm" id="openBtn">${icon('external')} Open in new tab</button>
        <button class="btn btn-ghost btn-sm btn-icon" id="copyBtn" title="Copy result">${icon('copy')}</button>
      </div>
    </div>
  </div>
</div>`;

  const script = /* js */`
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
    ['left', 'right'].forEach(id => { $(id).classList.remove('invalid'); const e = $(id + '-error'); e.textContent = ''; e.classList.remove('show'); });
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'init') { $('left').value = msg.json || ''; return; }
    if (msg.command === 'setRight') { $('right').value = msg.json || ''; return; }
    if (msg.command !== 'mergeResult') return;
    if (msg.type === 'error') {
      $(msg.side).classList.add('invalid');
      const el = $(msg.side + '-error'); el.textContent = msg.message; el.classList.add('show');
      return;
    }
    mergedText = msg.merged;
    $('empty').classList.add('hidden');
    $('result-code').textContent = mergedText;
    $('result-code').classList.remove('hidden');
    $('result-actions').classList.remove('hidden');
  });
`;

  return renderPage({ nonce, title: 'Merge JSON', css: CSS, body, script });
}
