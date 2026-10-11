import * as vscode from 'vscode';
import { runJsonPathQuery, JsonPathMatch } from './core/jsonPath';
import { generateNonce } from './editorUtils';

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

function getHtml(nonce: string, sourceName: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSONPath Query</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  .header { padding: 14px 18px 10px; border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
            background: var(--vscode-editorGroupHeader-tabsBackground); flex-shrink: 0; }
  .header h2 { font-size: 1em; font-weight: 600; margin-bottom: 10px; opacity: 0.9; display: flex; gap: 8px; align-items: baseline; }
  .header h2 .src { font-weight: 400; opacity: 0.55; font-size: 0.85em; }
  .query-input { width: 100%; padding: 7px 12px; border-radius: 4px; border: 1px solid var(--vscode-input-border, #555);
                 background: var(--vscode-input-background); color: var(--vscode-input-foreground);
                 font-family: var(--vscode-editor-font-family); font-size: 0.95em; }
  .query-input:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); }
  .hint { font-size: 0.78em; opacity: 0.5; margin-top: 6px; }
  .hint code { cursor: pointer; text-decoration: underline dotted; }
  .summary-bar { padding: 5px 18px; font-size: 0.8em; opacity: 0.7; background: var(--vscode-editorWidget-background, #252526);
                 border-bottom: 1px solid var(--vscode-editorGroup-border, #333); flex-shrink: 0; min-height: 26px; }
  .error-bar { color: var(--vscode-errorForeground, #e05252); }
  .results { flex: 1; overflow-y: auto; }
  .result-item { border-bottom: 1px solid var(--vscode-editorGroup-border, #2a2a2a); padding: 10px 18px; }
  .result-item:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)); }
  .result-path { font-family: var(--vscode-editor-font-family); font-size: 0.8em; color: var(--vscode-symbolIcon-propertyForeground, #569cd6);
                 margin-bottom: 5px; display: flex; align-items: center; gap: 8px; }
  .result-path .idx { opacity: 0.4; font-size: 0.85em; }
  .result-value { font-family: var(--vscode-editor-font-family); font-size: 0.88em; white-space: pre-wrap; word-break: break-all;
                  max-height: 200px; overflow-y: auto; padding: 6px 10px; border-radius: 3px;
                  background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2)); }
  .actions { margin-left: auto; display: flex; gap: 4px; }
  .copy-btn { padding: 2px 8px; font-size: 0.75em; cursor: pointer; border: 1px solid var(--vscode-button-border, #555);
              border-radius: 3px; background: transparent; color: var(--vscode-foreground); opacity: 0.6; }
  .copy-btn:hover { opacity: 1; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.4; gap: 10px; font-size: 0.9em; }
  .empty-icon { font-size: 2.5em; }
  .t-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
  .t-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
  .t-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
  .t-null { opacity: 0.6; }
</style>
</head>
<body>
<div class="header">
  <h2>⚡ JSONPath Query <span class="src" id="src"></span></h2>
  <input class="query-input" id="pathInput" type="text"
         placeholder="$.users[*].name  ·  $..email  ·  $.items[?(@.price > 10)]" autocomplete="off" spellcheck="false">
  <div class="hint">
    <code data-q="$.">$.key</code> &nbsp;·&nbsp; <code data-q="$..">$..key</code> recursive &nbsp;·&nbsp;
    <code data-q="$[*]">[*]</code> wildcard &nbsp;·&nbsp; <code data-q="$[0]">[0]</code> index &nbsp;·&nbsp;
    <code data-q="$[0:3]">[0:3]</code> slice &nbsp;·&nbsp; <code data-q="$[?(@.key == 'value')]">[?(@.k == v)]</code> filter &nbsp;·&nbsp;
    <code data-q="$[?(@.name =~ /^a/i)]">=~ /regex/</code>
  </div>
</div>
<div class="summary-bar" id="summaryBar">Type a path above to query the JSON</div>
<div class="results" id="results"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const input = document.getElementById('pathInput');
  const bar = document.getElementById('summaryBar');
  const list = document.getElementById('results');
  let results = [];
  let debounce = null;

  document.getElementById('src').textContent = ${JSON.stringify(sourceName)};

  const state = vscode.getState();
  if (state && state.path) { input.value = state.path; sendQuery(); } else { showEmpty('Query your JSON with JSONPath expressions'); }
  input.focus();

  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(sendQuery, 200); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(debounce); sendQuery(); } });

  document.querySelectorAll('.hint code').forEach(el => el.addEventListener('click', () => {
    input.value = el.dataset.q; input.focus(); sendQuery();
  }));

  list.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    if (!results[idx]) return;
    vscode.postMessage({ command: 'copy', index: idx, what: btn.dataset.action === 'copyPath' ? 'path' : 'value' });
    const old = btn.textContent; btn.textContent = 'copied'; setTimeout(() => { btn.textContent = old; }, 1200);
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
      bar.innerHTML = '<span class="error-bar">⚠ ' + esc(data.error) + '</span>';
      showEmpty(data.error, '⚠️');
      return;
    }
    results = data.results || [];
    if (results.length === 0) { bar.textContent = 'No matches found'; showEmpty('No matches for this query'); return; }
    bar.textContent = data.total + ' result' + (data.total === 1 ? '' : 's') +
      (data.total > results.length ? ' (showing first ' + results.length + ')' : '');
    list.innerHTML = results.map((r, i) =>
      '<div class="result-item">' +
        '<div class="result-path"><span class="idx">#' + (i + 1) + '</span><span>' + esc(r.path) + '</span>' +
        '<span class="actions"><button class="copy-btn" data-action="copyPath" data-idx="' + i + '">copy path</button>' +
        '<button class="copy-btn" data-action="copyValue" data-idx="' + i + '">copy value</button></span></div>' +
        '<div class="result-value t-' + r.type + '">' + esc(r.text) + '</div>' +
      '</div>').join('');
  }

  function showEmpty(text, icon) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">' + (icon || '🔍') + '</div><div>' + esc(text) + '</div></div>';
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
</script>
</body>
</html>`;
}
