import * as vscode from 'vscode';
import { runJsonPathQuery, JsonPathMatch } from './core/jsonPath';
import { generateNonce } from './editorUtils';
import { escapeHtml, icon, renderPage } from './webview/ui';

const MAX_RESULTS = 1000;
/** Values longer than this (pretty-printed) are sent as a truncated preview; copy resolves the full value. */
const MAX_VALUE_CHARS = 4000;

/** Open a live JSONPath query panel bound to the given editor's document. */
export function openJsonPathPanel(context: vscode.ExtensionContext, editor: vscode.TextEditor | undefined): void {
  const panel = vscode.window.createWebviewPanel(
    'jsonProJsonPath',
    'JSON Pro: JSONPath Query',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const sourceUri = editor?.document.uri;
  let currentText = editor?.document.getText() ?? '{}';
  let lastPath = '';
  const disposables: vscode.Disposable[] = [];

  const nonce = generateNonce();
  panel.webview.html = getHtml(nonce, sourceUri ? vscode.workspace.asRelativePath(sourceUri) : 'untitled');

  let lastResults: JsonPathMatch[] = [];

  const send = (path: string): void => {
    lastPath = path;
    const result = runJsonPathQuery(currentText, path);
    lastResults = (result.results ?? []).slice(0, MAX_RESULTS);
    void panel.webview.postMessage({
      command: 'queryResult',
      type: result.type,
      error: result.error,
      total: result.results?.length ?? 0,
      results: lastResults.map(shrink),
    });
  };

  disposables.push(panel.webview.onDidReceiveMessage((msg: { command: string; path?: string; index?: number; what?: 'path' | 'value' }) => {
    if (msg.command === 'query') send(msg.path ?? '');
    else if (msg.command === 'copy' && typeof msg.index === 'number') {
      const match = lastResults[msg.index];
      if (!match) return;
      void vscode.env.clipboard.writeText(msg.what === 'path' ? match.path : formatValue(match.value));
    }
  }));

  // Keep results in sync while the source document is edited
  if (sourceUri) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== sourceUri.toString()) return;
      currentText = e.document.getText();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (lastPath) send(lastPath); }, 300);
    }));
    disposables.push({ dispose: () => { if (timer) clearTimeout(timer); } });
  }

  panel.onDidDispose(() => disposables.forEach(d => d.dispose()), undefined, context.subscriptions);
}

function formatValue(v: unknown): string {
  return typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : JSON.stringify(v);
}

/** Pre-render each value and cap its size so huge subtrees never flood the webview. */
function shrink(m: JsonPathMatch): { path: string; text: string; type: string; truncated: boolean } {
  const type = m.value === null ? 'null' : Array.isArray(m.value) ? 'array' : typeof m.value;
  const full = formatValue(m.value);
  const truncated = full.length > MAX_VALUE_CHARS;
  return { path: m.path, text: truncated ? full.slice(0, MAX_VALUE_CHARS) + '\n… (truncated, copy value for the full text)' : full, type, truncated };
}

const CSS = /* css */`
  body { display: flex; flex-direction: column; overflow: hidden; }
  .header { padding: 14px 16px 12px; border-bottom: 1px solid var(--border); background: var(--card); flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
  .header .input { font-family: var(--font-mono); height: 34px; }
  .hints { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .hints .label { font-size: var(--text-xs); color: var(--muted-foreground); margin-right: 2px; }
  .hints .badge { font-family: var(--font-mono); font-weight: 500; }
  .summary-bar { padding: 6px 16px; font-size: var(--text-xs); color: var(--muted-foreground); border-bottom: 1px solid var(--border); flex-shrink: 0; min-height: 29px; display: flex; align-items: center; gap: 8px; }
  .summary-bar .alert { padding: 6px 10px; flex: 1; }
  .results { flex: 1; overflow-y: auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
  .result-item { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); overflow: hidden; }
  .result-path { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--border);
                 font-family: var(--font-mono); font-size: var(--text-xs); color: var(--vscode-debugTokenExpression-name, #9cdcfe); }
  .result-path .idx { color: var(--muted-foreground); font-family: var(--font-sans); min-width: 22px; }
  .result-path .path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-value { font-family: var(--font-mono); font-size: var(--text-sm); white-space: pre-wrap; word-break: break-all;
                  max-height: 220px; overflow-y: auto; padding: 8px 12px; line-height: 1.5; }
  .t-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .t-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .t-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .t-null { color: var(--muted-foreground); }
  .type-badge { font-family: var(--font-sans); }
  .empty { height: 100%; }
`;

function getHtml(nonce: string, sourceName: string): string {
  const hints: Array<[string, string, string]> = [
    ['$.', '$.key', 'child'], ['$..', '$..key', 'recursive'], ['$[*]', '[*]', 'wildcard'], ['$[0]', '[0]', 'index'],
    ['$[0:3]', '[0:3]', 'slice'], ["$[?(@.key == 'value')]", '[?(@.k == v)]', 'filter'], ['$[?(@.name =~ /^a/i)]', '=~ /re/', 'regex'],
  ];
  const body = /* html */`
<div class="header">
  <div class="row">
    <span class="toolbar-title">${icon('zap', 15)} JSONPath Query</span>
    <span class="badge badge-muted truncate" title="Source document">${icon('fileJson', 12)} ${escapeHtml(sourceName)}</span>
  </div>
  <div class="input-icon">
    ${icon('search', 15)}
    <input class="input" id="pathInput" type="text" placeholder="$.users[*].name  ·  $..email  ·  $.items[?(@.price > 10)]" autocomplete="off" spellcheck="false">
  </div>
  <div class="hints"><span class="label">Try:</span>
    ${hints.map(([q, label, title]) => `<span class="badge badge-outline clickable" data-q="${escapeHtml(q)}" title="${title}">${escapeHtml(label)}</span>`).join('')}
  </div>
</div>
<div class="summary-bar" id="summaryBar">Type a path above to query the JSON</div>
<div class="results" id="results"></div>`;

  const script = /* js */`
  const vscode = acquireVsCodeApi();
  const input = document.getElementById('pathInput');
  const bar = document.getElementById('summaryBar');
  const list = document.getElementById('results');
  const ICON_COPY = ${JSON.stringify(icon('copy', 12))};
  const ICON_SEARCH = ${JSON.stringify(icon('search', 28))};
  const ICON_ALERT = ${JSON.stringify(icon('alert', 14))};
  let results = [];
  let debounce = null;

  const state = vscode.getState();
  if (state && state.path) { input.value = state.path; sendQuery(); } else { showEmpty('Query your JSON with JSONPath expressions'); }
  input.focus();

  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(sendQuery, 200); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(debounce); sendQuery(); } });
  document.querySelectorAll('.hints .badge').forEach(el => el.addEventListener('click', () => {
    input.value = el.dataset.q; input.focus(); sendQuery();
  }));

  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    if (!results[idx]) return;
    vscode.postMessage({ command: 'copy', index: idx, what: btn.dataset.action === 'copyPath' ? 'path' : 'value' });
    const old = btn.innerHTML; btn.textContent = 'copied'; setTimeout(() => { btn.innerHTML = old; }, 1200);
  });

  function sendQuery() {
    const path = input.value.trim();
    vscode.setState({ path });
    if (!path) { bar.textContent = 'Type a path above to query the JSON'; showEmpty('Query your JSON with JSONPath expressions'); return; }
    vscode.postMessage({ command: 'query', path });
  }

  window.addEventListener('message', e => { if (e.data.command === 'queryResult') render(e.data); });

  function render(data) {
    if (data.type === 'error') {
      bar.innerHTML = '<div class="alert alert-destructive">' + ICON_ALERT + '<div class="alert-description">' + esc(data.error) + '</div></div>';
      showEmpty(data.error, true);
      return;
    }
    results = data.results || [];
    if (results.length === 0) { bar.textContent = 'No matches found'; showEmpty('No matches for this query'); return; }
    bar.textContent = data.total + ' result' + (data.total === 1 ? '' : 's') +
      (data.total > results.length ? ' (showing first ' + results.length + ')' : '');
    list.innerHTML = results.map((r, i) =>
      '<div class="result-item">' +
        '<div class="result-path"><span class="idx">' + (i + 1) + '</span><span class="path" title="' + esc(r.path) + '">' + esc(r.path) + '</span>' +
        '<span class="badge badge-muted type-badge">' + esc(r.type) + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-action="copyPath" data-idx="' + i + '" title="Copy path">' + ICON_COPY + ' path</button>' +
        '<button class="btn btn-ghost btn-sm" data-action="copyValue" data-idx="' + i + '" title="Copy value">' + ICON_COPY + ' value</button></div>' +
        '<div class="result-value t-' + r.type + '">' + esc(r.text) + '</div>' +
      '</div>').join('');
  }

  function showEmpty(text, isError) {
    list.innerHTML = '<div class="empty">' + (isError ? ICON_ALERT : ICON_SEARCH) + '<div>' + esc(text) + '</div></div>';
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
`;

  return renderPage({ nonce, title: 'JSONPath Query', css: CSS, body, script });
}
