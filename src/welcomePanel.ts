import * as vscode from 'vscode';
import { generateNonce } from './editorUtils';

const WELCOME_KEY = 'jsonPro.welcomeShownVersion';

export function openWelcomePanel(context: vscode.ExtensionContext, preserveFocus = false): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProWelcome',
    'JSON Pro — Welcome',
    { viewColumn: vscode.ViewColumn.One, preserveFocus },
    { enableScripts: true }
  );
  panel.webview.html = getHtml(nonce, extensionVersion(context));

  const sub = panel.webview.onDidReceiveMessage(async (msg: { command: string; json?: string; id?: string; text?: string }) => {
    if (msg.command === 'openSample' && msg.json) {
      const doc = await vscode.workspace.openTextDocument({ content: msg.json, language: 'json' });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } else if (msg.command === 'copy' && typeof msg.text === 'string') {
      await vscode.env.clipboard.writeText(msg.text);
    } else if (msg.command === 'openChangelog') {
      const changelog = vscode.Uri.joinPath(context.extensionUri, 'CHANGELOG.md');
      try {
        await vscode.commands.executeCommand('markdown.showPreview', changelog);
      } catch {
        await vscode.window.showTextDocument(changelog);
      }
    } else if (msg.command === 'runCommand' && msg.id && msg.id.startsWith('jsonPro.')) {
      await vscode.commands.executeCommand(msg.id);
    }
  });
  panel.onDidDispose(() => sub.dispose(), undefined, context.subscriptions);
}

/** Show the welcome page once per installation (without stealing focus from the file just opened). */
export function showWelcomeOnFirstInstall(context: vscode.ExtensionContext): void {
  const shown = context.globalState.get<string>(WELCOME_KEY);
  if (shown) return;
  void context.globalState.update(WELCOME_KEY, extensionVersion(context));
  openWelcomePanel(context, true);
}

function extensionVersion(context: vscode.ExtensionContext): string {
  const pkg = context.extension?.packageJSON as { version?: string } | undefined;
  return pkg?.version ?? '0.0.0';
}

const SAMPLE = `{
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
}`;

interface Feature { icon: string; name: string; desc: string; shortcut?: string; command?: string }

const FEATURES: Feature[] = [
  { icon: '✨', name: 'Format / Minify / Sort', desc: 'Prettify with configurable indent (comments preserved), collapse to one line, or sort all keys alphabetically.', shortcut: 'Shift+Alt+F · Shift+Alt+M', command: 'jsonPro.format' },
  { icon: '🔧', name: 'Auto-Fix', desc: 'Repairs comments, single quotes, unquoted keys, trailing or missing commas, Python literals and unbalanced brackets. Preview before applying.', shortcut: 'Shift+Alt+X', command: 'jsonPro.fix' },
  { icon: '⚡', name: 'JSONPath Query', desc: 'Live query panel — <code>$.users[*].name</code>, recursive descent, filters, slices, regex. Results update as you type and as you edit.', shortcut: 'Shift+Alt+Q', command: 'jsonPro.jsonPath' },
  { icon: '📊', name: 'Stats Dashboard', desc: 'Key count, max depth, type distribution, size savings, largest arrays, deepest paths, longest strings.', shortcut: 'Shift+Alt+S', command: 'jsonPro.stats' },
  { icon: '↔', name: 'Diff Checker', desc: 'Side-by-side diff with line numbers. Green = added, Red = removed, Amber = changed. Load files, navigate hunks, apply.', command: 'jsonPro.diff' },
  { icon: '🔀', name: 'Merge JSON', desc: 'Deep-merge two JSON objects. Right values override left; arrays concatenate or replace.', command: 'jsonPro.merge' },
  { icon: '🏷', name: 'TypeScript Interfaces', desc: 'Infers <code>export interface</code> definitions, with optional properties and union types where shapes differ.', command: 'jsonPro.toTypeScript' },
  { icon: '🔄', name: 'Convert to YAML', desc: 'One-click conversion to YAML, opened in a new tab.', command: 'jsonPro.toYAML' },
  { icon: '📐', name: 'Flatten / Unflatten', desc: '<code>{"a":{"b":1}}</code> ↔ <code>{"a.b": 1}</code> — round-trips nested and dot-notation structures.', command: 'jsonPro.flatten' },
  { icon: '🧹', name: 'Remove Nulls & Empty', desc: 'Recursively strips <code>null</code>, <code>""</code>, <code>[]</code> and <code>{}</code> values.', command: 'jsonPro.removeEmpty' },
  { icon: '✏️', name: 'Rename Key', desc: 'Pick any key and rename it everywhere it appears in the document.', command: 'jsonPro.renameKey' },
  { icon: '🔍', name: 'Search', desc: 'Fuzzy-search keys and values; select a match to jump straight to it.', command: 'jsonPro.search' },
  { icon: '📋', name: 'Copy Path', desc: 'Copies the dot-notation (or JSONPath) path of the value under the cursor.', command: 'jsonPro.copyPath' },
  { icon: '🌳', name: 'Sidebar Tree View', desc: 'Live JSON tree in the Explorer panel. Click any node to jump to it.' },
  { icon: '🔎', name: 'Hover Intelligence', desc: 'Hover to decode <strong>Base64</strong>, <strong>Unix timestamps</strong> and <strong>ISO 8601</strong> dates inline.' },
  { icon: '⚠️', name: 'Diagnostics', desc: 'Precise error squiggles with human-readable messages, plus duplicate-key warnings. JSONC aware.' },
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getHtml(nonce: string, version: string): string {
  const cards = FEATURES.map(f => `
      <div class="card"${f.command ? ` data-command="${f.command}" title="Run ${esc(f.name)}"` : ''}>
        <div class="card-header"><span class="card-icon">${f.icon}</span><span class="card-name c-cyan">${esc(f.name)}</span></div>
        <div class="card-desc">${f.desc}</div>
        ${f.shortcut ? `<span class="card-shortcut">${esc(f.shortcut)}</span>` : ''}
      </div>`).join('');

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSON Pro — Welcome</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); overflow-y: auto; padding: 0 0 60px 0; }
  .hero { display: flex; align-items: center; gap: 20px; padding: 36px 48px 28px;
          border-bottom: 1px solid var(--vscode-editorGroup-border, #333); background: var(--vscode-editorGroupHeader-tabsBackground); }
  .hero-icon { font-size: 3em; line-height: 1; flex-shrink: 0; }
  .hero-title { font-size: 1.8em; font-weight: 700; letter-spacing: -0.02em; }
  .hero-sub { font-size: 0.9em; opacity: 0.6; margin-top: 4px; }
  .hero-badges { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .badge { padding: 2px 10px; border-radius: 10px; font-size: 0.75em; font-weight: 600;
           background: rgba(97,218,251,0.15); color: #61dafb; border: 1px solid rgba(97,218,251,0.3); }
  .content { max-width: 900px; margin: 0 auto; padding: 32px 48px; }
  .section { margin-bottom: 36px; }
  .section-title { font-size: 0.7em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.45; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
  .card { background: var(--vscode-editorWidget-background, #252526); border: 1px solid var(--vscode-editorGroup-border, #333);
          border-radius: 8px; padding: 16px 18px; transition: border-color 0.15s; }
  .card[data-command] { cursor: pointer; }
  .card:hover { border-color: rgba(97,218,251,0.4); }
  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
  .card-icon { font-size: 1.3em; flex-shrink: 0; }
  .card-name { font-weight: 600; font-size: 0.92em; }
  .card-desc { font-size: 0.82em; opacity: 0.6; line-height: 1.5; }
  .card-shortcut { display: inline-block; margin-top: 8px; padding: 2px 8px; background: rgba(128,128,128,0.15); border-radius: 4px;
                   font-family: var(--vscode-editor-font-family); font-size: 0.75em; opacity: 0.7; }
  .kbd-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  .kbd-table td { padding: 7px 10px; border-bottom: 1px solid var(--vscode-editorGroup-border, #2a2a2a); }
  .kbd-table tr:last-child td { border-bottom: none; }
  .kbd-table td:first-child { opacity: 0.7; }
  .kbd { display: inline-block; padding: 2px 8px; border-radius: 4px; background: rgba(128,128,128,0.15);
         font-family: var(--vscode-editor-font-family); font-size: 0.88em; }
  .code-block { background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.25)); border: 1px solid var(--vscode-editorGroup-border, #333);
                border-radius: 6px; padding: 16px 18px; font-family: var(--vscode-editor-font-family); font-size: 0.82em;
                overflow-x: auto; white-space: pre; line-height: 1.6; }
  .try-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  button { padding: 6px 16px; cursor: pointer; border: none; border-radius: 4px; font-size: 0.84em; font-family: var(--vscode-font-family); }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .tip { display: flex; gap: 10px; padding: 12px 14px; border-radius: 6px; margin-bottom: 10px;
         background: rgba(97,218,251,0.06); border: 1px solid rgba(97,218,251,0.15); font-size: 0.85em; }
  .tip-icon { flex-shrink: 0; }
  .tip-text { opacity: 0.85; line-height: 1.5; }
  .tip-text strong { color: #61dafb; }
  .footer { text-align: center; opacity: 0.5; font-size: 0.8em; margin-top: 40px; }
  .footer a { color: inherit; cursor: pointer; text-decoration: underline; }
  .c-cyan { color: #61dafb; } .c-amber { color: #ffc107; }
</style>
</head>
<body>
<div class="hero">
  <div class="hero-icon">{ }</div>
  <div>
    <div class="hero-title">JSON <span class="c-amber">Pro</span></div>
    <div class="hero-sub">The complete JSON toolbox for VS Code</div>
    <div class="hero-badges">
      <span class="badge">Format</span><span class="badge">Fix</span><span class="badge">Diff</span><span class="badge">JSONPath</span>
      <span class="badge">TypeScript</span><span class="badge">Stats</span><span class="badge">Merge</span><span class="badge">YAML</span><span class="badge">JSONC</span>
    </div>
  </div>
</div>

<div class="content">
  <div class="section">
    <div class="section-title">Features — click a card to run it on the active JSON file</div>
    <div class="grid">${cards}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Keyboard Shortcuts</div>
    <table class="kbd-table">
      <tr><td>Format JSON</td><td><span class="kbd">Shift+Alt+F</span></td></tr>
      <tr><td>Minify JSON</td><td><span class="kbd">Shift+Alt+M</span></td></tr>
      <tr><td>Auto-Fix JSON</td><td><span class="kbd">Shift+Alt+X</span></td></tr>
      <tr><td>JSONPath Query</td><td><span class="kbd">Shift+Alt+Q</span></td></tr>
      <tr><td>Show Stats</td><td><span class="kbd">Shift+Alt+S</span></td></tr>
      <tr><td>All commands</td><td>Right-click inside any <span class="kbd">.json</span> or <span class="kbd">.jsonc</span> file</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Try It — Sample JSON</div>
    <div class="code-block" id="sampleJson">${esc(SAMPLE)}</div>
    <div class="try-row">
      <button class="btn-primary" id="copySample">Copy to Clipboard</button>
      <button class="btn-secondary" id="openSample">Open in New File</button>
    </div>
  </div>

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

  <div class="footer">JSON Pro · AkshayKale · <a id="changelog">v${esc(version)} — what's new</a></div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const SAMPLE = document.getElementById('sampleJson').textContent;

  document.getElementById('copySample').addEventListener('click', e => {
    vscode.postMessage({ command: 'copy', text: SAMPLE });
    const btn = e.currentTarget; btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
  });
  document.getElementById('openSample').addEventListener('click', () => vscode.postMessage({ command: 'openSample', json: SAMPLE }));
  document.getElementById('changelog').addEventListener('click', () => vscode.postMessage({ command: 'openChangelog' }));
  document.querySelectorAll('.card[data-command]').forEach(card =>
    card.addEventListener('click', () => vscode.postMessage({ command: 'runCommand', id: card.dataset.command })));
</script>
</body>
</html>`;
}
