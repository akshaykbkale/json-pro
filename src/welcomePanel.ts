import * as vscode from 'vscode';

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}

export function openWelcomePanel(context: vscode.ExtensionContext): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProWelcome',
    'JSON Pro — Welcome',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  panel.webview.html = getHtml(nonce);

  panel.webview.onDidReceiveMessage(async (msg: { command: string; json?: string }) => {
    if (msg.command === 'openSample' && msg.json) {
      const doc = await vscode.workspace.openTextDocument({ content: msg.json, language: 'json' });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } else if (msg.command === 'openChangelog') {
      const changelogFiles = await vscode.workspace.findFiles('CHANGELOG.md', undefined, 1);
      if (changelogFiles.length > 0) {
        await vscode.commands.executeCommand('markdown.showPreview', changelogFiles[0]);
      }
    }
  }, undefined, context.subscriptions);
}

export function showWelcomeOnFirstInstall(context: vscode.ExtensionContext): void {
  const key = 'jsonPro.welcomeShown';
  const shown = context.globalState.get<boolean>(key, false);
  if (!shown) {
    openWelcomePanel(context);
    context.globalState.update(key, true);
  }
}

function getHtml(nonce: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSON Pro — Welcome</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow-y: auto;
    padding: 0 0 60px 0;
  }

  /* ── Hero ── */
  .hero {
    display: flex; align-items: center; gap: 20px;
    padding: 36px 48px 28px;
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    background: var(--vscode-editorGroupHeader-tabsBackground);
  }
  .hero-icon { font-size: 3em; line-height: 1; flex-shrink: 0; }
  .hero-title { font-size: 1.8em; font-weight: 700; letter-spacing: -0.02em; }
  .hero-sub { font-size: 0.9em; opacity: 0.6; margin-top: 4px; }
  .hero-badges { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .badge {
    padding: 2px 10px; border-radius: 10px; font-size: 0.75em; font-weight: 600;
    background: rgba(97,218,251,0.15); color: #61dafb; border: 1px solid rgba(97,218,251,0.3);
  }

  /* ── Content ── */
  .content { max-width: 900px; margin: 0 auto; padding: 32px 48px; }

  /* ── Section ── */
  .section { margin-bottom: 36px; }
  .section-title {
    font-size: 0.7em; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.12em; opacity: 0.45; margin-bottom: 14px;
  }

  /* ── Feature grid ── */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorGroup-border, #333);
    border-radius: 8px; padding: 16px 18px;
    transition: border-color 0.15s;
    cursor: default;
  }
  .card:hover { border-color: rgba(97,218,251,0.4); }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
  .card-icon { font-size: 1.3em; flex-shrink: 0; }
  .card-name { font-weight: 600; font-size: 0.92em; }
  .card-desc { font-size: 0.82em; opacity: 0.6; line-height: 1.5; }
  .card-shortcut {
    display: inline-block; margin-top: 8px; padding: 2px 8px;
    background: rgba(255,255,255,0.07); border-radius: 4px;
    font-family: var(--vscode-editor-font-family); font-size: 0.75em;
    opacity: 0.7;
  }

  /* ── Keyboard shortcuts table ── */
  .kbd-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  .kbd-table td { padding: 7px 10px; border-bottom: 1px solid var(--vscode-editorGroup-border, #2a2a2a); }
  .kbd-table tr:last-child td { border-bottom: none; }
  .kbd-table td:first-child { opacity: 0.7; }
  .kbd {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    background: rgba(255,255,255,0.08);
    font-family: var(--vscode-editor-font-family); font-size: 0.88em;
  }

  /* ── Sample JSON ── */
  .code-block {
    background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.25));
    border: 1px solid var(--vscode-editorGroup-border, #333);
    border-radius: 6px; padding: 16px 18px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.82em; overflow-x: auto; white-space: pre;
    line-height: 1.6;
  }
  .try-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }

  /* ── Buttons ── */
  button {
    padding: 6px 16px; cursor: pointer; border: none; border-radius: 4px;
    font-size: 0.84em; font-family: var(--vscode-font-family);
  }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

  /* ── Tips ── */
  .tip { display: flex; gap: 10px; padding: 12px 14px; border-radius: 6px; margin-bottom: 10px;
         background: rgba(97,218,251,0.06); border: 1px solid rgba(97,218,251,0.15); font-size: 0.85em; }
  .tip-icon { flex-shrink: 0; }
  .tip-text { opacity: 0.85; line-height: 1.5; }
  .tip-text strong { color: #61dafb; }

  /* ── Footer ── */
  .footer { text-align: center; opacity: 0.35; font-size: 0.8em; margin-top: 40px; }

  /* ── Highlight colors ── */
  .c-cyan   { color: #61dafb; }
  .c-green  { color: #3fb950; }
  .c-amber  { color: #ffc107; }
  .c-purple { color: #c792ea; }
</style>
</head>
<body>

<!-- Hero -->
<div class="hero">
  <div class="hero-icon">{ }</div>
  <div>
    <div class="hero-title">JSON <span class="c-amber">Pro</span></div>
    <div class="hero-sub">The complete JSON toolbox for VS Code</div>
    <div class="hero-badges">
      <span class="badge">Format</span>
      <span class="badge">Diff</span>
      <span class="badge">JSONPath</span>
      <span class="badge">TypeScript</span>
      <span class="badge">Stats</span>
      <span class="badge">Merge</span>
      <span class="badge">YAML</span>
      <span class="badge">Hover</span>
    </div>
  </div>
</div>

<div class="content">

  <!-- Features -->
  <div class="section">
    <div class="section-title">Features</div>
    <div class="grid">

      <div class="card">
        <div class="card-header"><span class="card-icon">✨</span><span class="card-name c-cyan">Format / Minify / Sort</span></div>
        <div class="card-desc">Prettify with configurable indent, collapse to one line, or sort all keys alphabetically.</div>
        <span class="card-shortcut">Shift+Alt+F &nbsp;·&nbsp; Shift+Alt+M</span>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🔧</span><span class="card-name c-cyan">Auto-Fix</span></div>
        <div class="card-desc">Fixes JS comments, single quotes, unquoted keys, trailing commas, and missing brackets. Shows native diff preview before applying.</div>
        <span class="card-shortcut">Shift+Alt+X</span>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">⚡</span><span class="card-name c-cyan">JSONPath Query</span></div>
        <div class="card-desc">Live query panel — <code>$.users[*].name</code>, recursive descent, filters, slices. Results update as you type.</div>
        <span class="card-shortcut">Shift+Alt+Q</span>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">📊</span><span class="card-name c-cyan">Stats Dashboard</span></div>
        <div class="card-desc">Visual analytics: key count, max depth, type distribution bar chart, largest arrays, deepest paths, longest strings.</div>
        <span class="card-shortcut">Shift+Alt+S</span>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">↔</span><span class="card-name c-cyan">Diff Checker</span></div>
        <div class="card-desc">Side-by-side diff with line numbers. Green = added, Red = removed, Amber = changed. Prev/Next navigation, Apply All.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🔀</span><span class="card-name c-cyan">Merge JSON</span></div>
        <div class="card-desc">Deep-merge two JSON objects. Right values override left on conflicts, arrays are concatenated.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🏷</span><span class="card-name c-cyan">TypeScript Interfaces</span></div>
        <div class="card-desc">Infers <code>export interface</code> definitions from any JSON structure. Handles nested objects and arrays.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🔄</span><span class="card-name c-cyan">Convert to YAML</span></div>
        <div class="card-desc">One-click conversion to YAML, opened in a new tab with correct syntax highlighting.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">📐</span><span class="card-name c-cyan">Flatten / Unflatten</span></div>
        <div class="card-desc"><code>{"a":{"b":1}}</code> ↔ <code>{"a.b": 1}</code> — convert between nested and dot-notation flat structures.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🧹</span><span class="card-name c-cyan">Remove Nulls & Empty</span></div>
        <div class="card-desc">Recursively strips all <code>null</code>, <code>""</code>, <code>[]</code>, and <code>{}</code> values in one click.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">✏️</span><span class="card-name c-cyan">Rename Key</span></div>
        <div class="card-desc">Rename a key everywhere it appears in the document. Detects the key at cursor automatically.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🔍</span><span class="card-name c-cyan">Search</span></div>
        <div class="card-desc">Search keys and values by keyword. QuickPick results — select any match to jump to that line.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">📋</span><span class="card-name c-cyan">Copy Path</span></div>
        <div class="card-desc">Click anywhere → copies dot-notation path to clipboard. e.g. <code>users[0].address.city</code></div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🌳</span><span class="card-name c-cyan">Sidebar Tree View</span></div>
        <div class="card-desc">Live JSON tree in the Explorer panel. Refreshes as you type. Click any node to jump to it.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">🔎</span><span class="card-name c-cyan">Hover Intelligence</span></div>
        <div class="card-desc">Hover over any value to decode <strong>Base64</strong> strings, <strong>Unix timestamps</strong>, or <strong>ISO 8601</strong> dates inline.</div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-icon">⚠️</span><span class="card-name c-cyan">Diagnostics</span></div>
        <div class="card-desc">Real-time error squiggles with human-readable messages. Duplicate key warnings. Debounced for performance.</div>
      </div>

    </div>
  </div>

  <!-- Keyboard shortcuts -->
  <div class="section">
    <div class="section-title">Keyboard Shortcuts</div>
    <table class="kbd-table">
      <tr><td>Format JSON</td><td><span class="kbd">Shift+Alt+F</span></td></tr>
      <tr><td>Minify JSON</td><td><span class="kbd">Shift+Alt+M</span></td></tr>
      <tr><td>Auto-Fix JSON</td><td><span class="kbd">Shift+Alt+X</span></td></tr>
      <tr><td>JSONPath Query</td><td><span class="kbd">Shift+Alt+Q</span></td></tr>
      <tr><td>Show Stats</td><td><span class="kbd">Shift+Alt+S</span></td></tr>
      <tr><td>All commands</td><td>Right-click inside any <span class="kbd">.json</span> file</td></tr>
    </table>
  </div>

  <!-- Try it -->
  <div class="section">
    <div class="section-title">Try It — Sample JSON</div>
    <div class="code-block" id="sampleJson">{
  "app": { "name": "JSON Pro Demo", "buildTimestamp": 1711929600, "releasedAt": "2024-04-01T08:00:00Z", "active": true, "description": null },
  "users": [
    { "id": 1, "name": "Akshay Kale", "role": "admin", "score": 98.5,
      "token": "SGVsbG8gZnJvbSBKU09OIFBybw==",
      "address": { "city": "Mumbai", "country": "India", "zip": "400001" },
      "tags": ["admin", "power-user"], "lastLogin": 1711843200 },
    { "id": 2, "name": "Jane Doe", "role": "viewer", "score": 74.0,
      "token": null, "address": { "city": "London", "country": "UK", "zip": "" },
      "tags": ["viewer"], "lastLogin": 1711756800 }
  ],
  "settings": { "theme": "dark", "notifications": { "email": true, "push": false, "sms": null },
    "limits": { "maxUsers": 100, "rateLimit": { "requests": 1000, "windowMs": 60000 } } },
  "stats": { "totalUsers": 2, "revenue": 49999.99, "growth": null, "topCountries": ["India", "UK"] }
}</div>
    <div class="try-row">
      <button class="btn-primary" onclick="copySample()">Copy to Clipboard</button>
      <button class="btn-secondary" onclick="openNewFile()">Open in New File</button>
    </div>
  </div>

  <!-- Tips -->
  <div class="section">
    <div class="section-title">Things to Try with the Sample</div>
    <div class="tip"><span class="tip-icon">🕐</span><div class="tip-text">Hover over <strong>1711929600</strong> → decoded as a human-readable date</div></div>
    <div class="tip"><span class="tip-icon">🔑</span><div class="tip-text">Hover over <strong>"SGVsbG8gZnJvbSBKU09OIFBybw=="</strong> → decoded Base64 string</div></div>
    <div class="tip"><span class="tip-icon">📅</span><div class="tip-text">Hover over <strong>"2024-04-01T08:00:00Z"</strong> → formatted date with timezone</div></div>
    <div class="tip"><span class="tip-icon">⚡</span><div class="tip-text">Run <strong>JSONPath Query</strong> → try <code>$.users[*].name</code> or <code>$.users[?(@.role == 'admin')]</code></div></div>
    <div class="tip"><span class="tip-icon">📊</span><div class="tip-text">Run <strong>Show Stats</strong> → see type distribution and depth analysis</div></div>
    <div class="tip"><span class="tip-icon">🏷</span><div class="tip-text">Run <strong>Generate TypeScript Interfaces</strong> → get typed interfaces instantly</div></div>
    <div class="tip"><span class="tip-icon">📐</span><div class="tip-text">Run <strong>Flatten JSON</strong> → converts nested structure to dot-notation flat map</div></div>
  </div>

  <div class="footer">
    JSON Pro · AkshayKale · <a href="#" onclick="showChangelog()">v1.0.0</a>
  </div>

</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  const SAMPLE = document.getElementById('sampleJson').textContent;

  function copySample() {
    navigator.clipboard.writeText(SAMPLE);
    const btn = event.target;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
  }

  function openNewFile() {
    vscode.postMessage({ command: 'openSample', json: SAMPLE });
  }

  function showChangelog() {
    vscode.postMessage({ command: 'openChangelog' });
  }
</script>
</body>
</html>`;
}
