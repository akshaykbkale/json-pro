import * as vscode from 'vscode';

export function openJsonPathPanel(context: vscode.ExtensionContext, initialJson: string): void {
  const panel = vscode.window.createWebviewPanel(
    'jsonProJsonPath',
    'JSON Pro: JSONPath Query',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  const nonce = generateNonce();
  panel.webview.html = getHtml(nonce);

  // Send initial JSON
  panel.webview.postMessage({ command: 'setJson', json: initialJson });

  panel.webview.onDidReceiveMessage(
    (msg: { command: string; json: string; path: string }) => {
      if (msg.command === 'query') {
        const result = runQuery(msg.json, msg.path);
        panel.webview.postMessage({ command: 'queryResult', ...result });
      }
    },
    undefined,
    context.subscriptions
  );
}

// ── JSONPath Evaluator ────────────────────────────────────────────────────────

interface QueryResult {
  type: 'success' | 'error';
  results?: Array<{ path: string; value: unknown }>;
  error?: string;
}

function runQuery(jsonText: string, path: string): QueryResult {
  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch (e) {
    return { type: 'error', error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!path.trim()) {
    return { type: 'success', results: [{ path: '$', value: root }] };
  }

  try {
    const results: Array<{ path: string; value: unknown }> = [];
    evaluatePath(root, path.trim(), '$', results);
    return { type: 'success', results };
  } catch (e) {
    return { type: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

function evaluatePath(
  value: unknown,
  path: string,
  currentPath: string,
  results: Array<{ path: string; value: unknown }>
): void {
  if (!path.startsWith('$')) throw new Error('Path must start with $');
  walk(value, path.slice(1), currentPath, results);
}

function walk(
  value: unknown,
  remaining: string,
  currentPath: string,
  results: Array<{ path: string; value: unknown }>
): void {
  if (remaining === '' || remaining === '.') {
    results.push({ path: currentPath, value });
    return;
  }

  // Recursive descent: ..key or ..*
  if (remaining.startsWith('..')) {
    const rest = remaining.slice(2);
    const keyMatch = rest.match(/^([a-zA-Z_$*][a-zA-Z0-9_$]*)(.*)/);
    if (keyMatch) {
      const key = keyMatch[1];
      const after = keyMatch[2];
      // Apply at current level
      walk(value, `.${key}${after}`, currentPath, results);
      // Recurse all children
      descend(value, `..${rest}`, currentPath, results);
    }
    return;
  }

  // Dot notation: .key or .*
  if (remaining.startsWith('.')) {
    const rest = remaining.slice(1);

    // Wildcard .*
    if (rest.startsWith('*')) {
      const after = rest.slice(1);
      walkChildren(value, after, currentPath, results);
      return;
    }

    const keyMatch = rest.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)(.*)/);
    if (keyMatch) {
      const key = keyMatch[1];
      const after = keyMatch[2];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (key in obj) {
          walk(obj[key], after, `${currentPath}.${key}`, results);
        }
      }
      return;
    }
  }

  // Bracket notation: [...]
  if (remaining.startsWith('[')) {
    const closeIdx = remaining.indexOf(']');
    if (closeIdx === -1) throw new Error(`Unclosed '[' in path`);
    const selector = remaining.slice(1, closeIdx).trim();
    const after = remaining.slice(closeIdx + 1);

    // Wildcard [*]
    if (selector === '*') {
      walkChildren(value, after, currentPath, results);
      return;
    }

    // String key ['key'] or ["key"]
    const strMatch = selector.match(/^(['"])(.+)\1$/);
    if (strMatch) {
      const key = strMatch[2];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (key in obj) walk(obj[key], after, `${currentPath}['${key}']`, results);
      }
      return;
    }

    // Slice [start:end] or [start:end:step]
    if (selector.includes(':')) {
      if (Array.isArray(value)) {
        const parts = selector.split(':').map(s => s.trim() === '' ? undefined : parseInt(s, 10));
        const len = value.length;
        const start = parts[0] !== undefined ? (parts[0] < 0 ? Math.max(len + parts[0], 0) : Math.min(parts[0], len)) : 0;
        const end   = parts[1] !== undefined ? (parts[1] < 0 ? Math.max(len + parts[1], 0) : Math.min(parts[1], len)) : len;
        const step  = parts[2] !== undefined ? parts[2] : 1;
        for (let i = start; i < end; i += step) {
          walk(value[i], after, `${currentPath}[${i}]`, results);
        }
      }
      return;
    }

    // Union [0,1,2]
    if (selector.includes(',')) {
      const indices = selector.split(',').map(s => parseInt(s.trim(), 10));
      if (Array.isArray(value)) {
        for (const idx of indices) {
          const realIdx = idx < 0 ? value.length + idx : idx;
          if (realIdx >= 0 && realIdx < value.length) {
            walk(value[realIdx], after, `${currentPath}[${realIdx}]`, results);
          }
        }
      }
      return;
    }

    // Numeric index [0] or [-1]
    const numMatch = selector.match(/^-?\d+$/);
    if (numMatch) {
      const idx = parseInt(selector, 10);
      if (Array.isArray(value)) {
        const realIdx = idx < 0 ? value.length + idx : idx;
        if (realIdx >= 0 && realIdx < value.length) {
          walk(value[realIdx], after, `${currentPath}[${realIdx}]`, results);
        }
      }
      return;
    }

    // Filter [?(@.key == val)]
    if (selector.startsWith('?(') && selector.endsWith(')')) {
      const expr = selector.slice(2, -1);
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          if (evaluateFilter(v, expr)) {
            walk(v, after, `${currentPath}[${i}]`, results);
          }
        });
      }
      return;
    }
  }
}

function walkChildren(
  value: unknown,
  after: string,
  currentPath: string,
  results: Array<{ path: string; value: unknown }>
): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, after, `${currentPath}[${i}]`, results));
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, after, `${currentPath}.${k}`, results);
    }
  }
}

function descend(
  value: unknown,
  path: string,
  currentPath: string,
  results: Array<{ path: string; value: unknown }>
): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      walk(v, path, `${currentPath}[${i}]`, results);
      descend(v, path, `${currentPath}[${i}]`, results);
    });
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path, `${currentPath}.${k}`, results);
      descend(v, path, `${currentPath}.${k}`, results);
    }
  }
}

function evaluateFilter(value: unknown, expr: string): boolean {
  // Bounded value capture: quoted string OR number/boolean/null (max 200 chars total)
  if (expr.length > 200) return false;
  const m = expr.match(/^@\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(===?|!==?|>=?|<=?)\s*("[^"]{0,100}"|'[^']{0,100}'|true|false|null|-?\d+(?:\.\d+)?)$/);
  if (!m) return false;

  const [, key, op, rawVal] = m;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = (value as Record<string, unknown>)[key];

  let expected: unknown;
  const t = rawVal.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    expected = t.slice(1, -1);
  } else if (t === 'true') expected = true;
  else if (t === 'false') expected = false;
  else if (t === 'null') expected = null;
  else expected = Number(t);

  switch (op) {
    case '=': case '==': case '===': return actual === expected;
    case '!=': case '!==': return actual !== expected;
    case '>':  return (actual as number) >  (expected as number);
    case '<':  return (actual as number) <  (expected as number);
    case '>=': return (actual as number) >= (expected as number);
    case '<=': return (actual as number) <= (expected as number);
  }
  return false;
}

// ── Webview HTML ──────────────────────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

function getHtml(nonce: string): string {
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
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  /* ── Header ── */
  .header {
    padding: 14px 18px 10px;
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    background: var(--vscode-editorGroupHeader-tabsBackground);
    flex-shrink: 0;
  }
  .header h2 { font-size: 1em; font-weight: 600; margin-bottom: 10px; opacity: 0.9; }
  .query-row { display: flex; gap: 8px; align-items: center; }
  .query-input {
    flex: 1; padding: 7px 12px; border-radius: 4px;
    border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    font-family: var(--vscode-editor-font-family);
    font-size: 0.95em;
  }
  .query-input:focus { outline: 1px solid var(--vscode-focusBorder, #007acc); }
  .hint { font-size: 0.78em; opacity: 0.5; margin-top: 6px; }

  /* ── Summary bar ── */
  .summary-bar {
    padding: 5px 18px; font-size: 0.8em; opacity: 0.7;
    background: var(--vscode-editorWidget-background, #252526);
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    flex-shrink: 0; min-height: 26px;
  }
  .error-bar { color: #e05252; }

  /* ── Results ── */
  .results { flex: 1; overflow-y: auto; padding: 0; }
  .result-item {
    border-bottom: 1px solid var(--vscode-editorGroup-border, #2a2a2a);
    padding: 10px 18px;
    transition: background 0.1s;
  }
  .result-item:hover { background: var(--vscode-list-hoverBackground, rgba(255,255,255,0.04)); }
  .result-path {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.8em; color: #569cd6; margin-bottom: 5px;
    display: flex; align-items: center; gap: 8px;
  }
  .result-path .idx { opacity: 0.4; font-size: 0.85em; }
  .result-value {
    font-family: var(--vscode-editor-font-family);
    font-size: 0.88em; white-space: pre-wrap; word-break: break-all;
    max-height: 200px; overflow-y: auto;
    padding: 6px 10px; border-radius: 3px;
    background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.2));
  }
  .copy-btn {
    margin-left: auto; padding: 2px 8px; font-size: 0.75em; cursor: pointer;
    border: 1px solid var(--vscode-button-border, #555); border-radius: 3px;
    background: transparent; color: var(--vscode-foreground); opacity: 0.6;
  }
  .copy-btn:hover { opacity: 1; }
  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; opacity: 0.4; gap: 10px; font-size: 0.9em;
  }
  .empty-icon { font-size: 2.5em; }

  /* ── Type colors ── */
  .t-string  { color: #ce9178; }
  .t-number  { color: #b5cea8; }
  .t-boolean { color: #569cd6; }
  .t-null    { color: #888; }
  .t-object  { color: #9cdcfe; }
  .t-array   { color: #4ec9b0; }
</style>
</head>
<body>

<div class="header">
  <h2>⚡ JSONPath Query</h2>
  <div class="query-row">
    <input class="query-input" id="pathInput" type="text"
           placeholder="$.users[*].name  or  $..email  or  $.items[?(@.price > 10)]"
           autocomplete="off" spellcheck="false">
  </div>
  <div class="hint">
    <strong>$.</strong>key &nbsp;·&nbsp; <strong>$..</strong>key (recursive) &nbsp;·&nbsp;
    <strong>[*]</strong> wildcard &nbsp;·&nbsp; <strong>[0]</strong> index &nbsp;·&nbsp;
    <strong>[0:3]</strong> slice &nbsp;·&nbsp; <strong>[?(@.k == v)]</strong> filter
  </div>
</div>

<div class="summary-bar" id="summaryBar">Type a path above to query the JSON</div>
<div class="results" id="results">
  <div class="empty-state">
    <div class="empty-icon">🔍</div>
    <div>Query your JSON with JSONPath expressions</div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let currentJson = '';
  let debounce = null;

  document.getElementById('pathInput').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(sendQuery, 200);
  });

  function sendQuery() {
    const path = document.getElementById('pathInput').value.trim();
    if (!path) { clearResults(); return; }
    vscode.postMessage({ command: 'query', json: currentJson, path });
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'setJson') {
      currentJson = msg.json;
      sendQuery();
    } else if (msg.command === 'queryResult') {
      renderResult(msg);
    }
  });

  function renderResult(data) {
    const bar  = document.getElementById('summaryBar');
    const list = document.getElementById('results');

    if (data.type === 'error') {
      bar.innerHTML = '<span class="error-bar">⚠ ' + esc(data.error) + '</span>';
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><div>' + esc(data.error) + '</div></div>';
      return;
    }

    const results = data.results || [];
    if (results.length === 0) {
      bar.textContent = 'No matches found';
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div>No matches for this query</div></div>';
      return;
    }

    bar.textContent = results.length + ' result' + (results.length === 1 ? '' : 's') + ' found';
    list.innerHTML = results.map((r, i) => {
      const type = r.value === null ? 'null' : Array.isArray(r.value) ? 'array' : typeof r.value;
      const formatted = type === 'object' || type === 'array'
        ? JSON.stringify(r.value, null, 2)
        : JSON.stringify(r.value);
      return \`<div class="result-item">
        <div class="result-path">
          <span class="idx">#\${i + 1}</span>
          <span>\${esc(r.path)}</span>
          <button class="copy-btn" onclick="copyVal(\${i})">copy</button>
        </div>
        <div class="result-value t-\${type}">\${esc(formatted)}</div>
      </div>\`;
    }).join('');

    // Store values for copy
    window._results = results;
  }

  function clearResults() {
    document.getElementById('summaryBar').textContent = 'Type a path above to query the JSON';
    document.getElementById('results').innerHTML =
      '<div class="empty-state"><div class="empty-icon">🔍</div><div>Query your JSON with JSONPath expressions</div></div>';
  }

  function copyVal(idx) {
    const val = window._results[idx].value;
    const text = typeof val === 'object' ? JSON.stringify(val, null, 2) : JSON.stringify(val);
    navigator.clipboard.writeText(text);
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
</script>
</body>
</html>`;
}
