import * as vscode from 'vscode';
import { generateNonce } from './editorUtils';
import { escapeHtml as esc, icon, renderPage } from './webview/ui';

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
  { icon: 'braces', name: 'Format / Minify / Sort', desc: 'Prettify with configurable indent (comments preserved), collapse to one line, or sort all keys alphabetically.', shortcut: 'Shift+Alt+F · Shift+Alt+M', command: 'jsonPro.format' },
  { icon: 'wrench', name: 'Auto-Fix', desc: 'Repairs comments, single quotes, unquoted keys, trailing or missing commas, Python literals and unbalanced brackets. Preview before applying.', shortcut: 'Shift+Alt+X', command: 'jsonPro.fix' },
  { icon: 'zap', name: 'JSONPath Query', desc: 'Live query panel — <code>$.users[*].name</code>, recursive descent, filters, slices, regex. Results update as you type and as you edit.', shortcut: 'Shift+Alt+Q', command: 'jsonPro.jsonPath' },
  { icon: 'chart', name: 'Stats Dashboard', desc: 'Key count, max depth, type distribution, size savings, largest arrays, deepest paths, longest strings.', shortcut: 'Shift+Alt+S', command: 'jsonPro.stats' },
  { icon: 'diff', name: 'Diff Checker', desc: 'Side-by-side diff with line numbers. Green = added, Red = removed, Amber = changed. Load files, navigate hunks, apply.', command: 'jsonPro.diff' },
  { icon: 'merge', name: 'Merge JSON', desc: 'Deep-merge two JSON objects. Right values override left; arrays concatenate or replace.', command: 'jsonPro.merge' },
  { icon: 'code', name: 'TypeScript Interfaces', desc: 'Infers <code>export interface</code> definitions, with optional properties and union types where shapes differ.', command: 'jsonPro.toTypeScript' },
  { icon: 'file', name: 'Convert to YAML', desc: 'One-click conversion to YAML, opened in a new tab.', command: 'jsonPro.toYAML' },
  { icon: 'layers', name: 'Flatten / Unflatten', desc: '<code>{"a":{"b":1}}</code> ↔ <code>{"a.b": 1}</code> — round-trips nested and dot-notation structures.', command: 'jsonPro.flatten' },
  { icon: 'trash', name: 'Remove Nulls & Empty', desc: 'Recursively strips <code>null</code>, <code>""</code>, <code>[]</code> and <code>{}</code> values.', command: 'jsonPro.removeEmpty' },
  { icon: 'pencil', name: 'Rename Key', desc: 'Pick any key and rename it everywhere it appears in the document.', command: 'jsonPro.renameKey' },
  { icon: 'search', name: 'Search', desc: 'Fuzzy-search keys and values; select a match to jump straight to it.', command: 'jsonPro.search' },
  { icon: 'copy', name: 'Copy Path', desc: 'Copies the dot-notation (or JSONPath) path of the value under the cursor.', command: 'jsonPro.copyPath' },
  { icon: 'tree', name: 'Sidebar Tree View', desc: 'Live JSON tree in the Explorer panel. Click any node to jump to it.' },
  { icon: 'eye', name: 'Hover Intelligence', desc: 'Hover to decode <strong>Base64</strong>, <strong>Unix timestamps</strong> and <strong>ISO 8601</strong> dates inline.' },
  { icon: 'alert', name: 'Diagnostics', desc: 'Precise error squiggles with human-readable messages, plus duplicate-key warnings. JSONC aware.' },
];

const CSS = /* css */`
  body { overflow-y: auto; }
  .hero { padding: 40px 48px 28px; border-bottom: 1px solid var(--border); background: var(--card); }
  .hero-inner { max-width: 960px; margin: 0 auto; display: flex; align-items: center; gap: 22px; }
  .hero-logo { width: 56px; height: 56px; border-radius: 14px; background: var(--primary); color: var(--primary-foreground); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: var(--shadow); }
  .hero-title { font-size: 1.9em; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
  .hero-sub { color: var(--muted-foreground); margin-top: 4px; }
  .hero-badges { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
  .content { max-width: 960px; margin: 0 auto; padding: 32px 48px 60px; display: flex; flex-direction: column; gap: 36px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
  .feature .card-header { padding: 14px 16px 8px; }
  .feature .card-title { font-size: 0.97em; }
  .feature .card-title .icon { color: var(--primary); }
  .feature .card-content { padding: 0 16px 14px; }
  .feature .card-description { font-size: var(--text-sm); line-height: 1.5; }
  .feature code { font-family: var(--font-mono); font-size: 0.9em; background: var(--muted); padding: 0 4px; border-radius: 3px; }
  .feature .shortcut { margin-top: 2px; }
  .kbd-table td:first-child { color: var(--muted-foreground); width: 40%; }
  .sample-card .card-content { gap: 12px; }
  .tips { display: flex; flex-direction: column; gap: 8px; }
  .tips .alert strong { color: var(--foreground); font-weight: 600; }
  .tips code { font-family: var(--font-mono); font-size: 0.9em; background: var(--muted); padding: 0 4px; border-radius: 3px; }
  .footer { text-align: center; color: var(--muted-foreground); font-size: var(--text-xs); }
  .footer a { color: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
`;

function getHtml(nonce: string, version: string): string {
  const cards = FEATURES.map(f => `
      <div class="card feature${f.command ? ' interactive' : ''}"${f.command ? ` data-command="${f.command}" title="Run ${esc(f.name)}"` : ''}>
        <div class="card-header"><div class="card-title">${icon(f.icon, 16)} ${esc(f.name)}</div></div>
        <div class="card-content">
          <div class="card-description">${f.desc}</div>
          ${f.shortcut ? `<div class="row wrap shortcut">${f.shortcut.split('·').map(k => `<kbd>${esc(k.trim())}</kbd>`).join('')}</div>` : ''}
        </div>
      </div>`).join('');

  const shortcuts: Array<[string, string]> = [
    ['Format JSON', 'Shift+Alt+F'], ['Minify JSON', 'Shift+Alt+M'], ['Auto-Fix JSON', 'Shift+Alt+X'],
    ['JSONPath Query', 'Shift+Alt+Q'], ['Show Stats', 'Shift+Alt+S'],
  ];
  const tips: Array<[string, string]> = [
    ['eye', 'Hover over <strong>1711929600</strong> → decoded as a human-readable date'],
    ['eye', 'Hover over <strong>"SGVsbG8gZnJvbSBKU09OIFBybw=="</strong> → decoded Base64 string'],
    ['eye', 'Hover over <strong>"2024-04-01T08:00:00Z"</strong> → formatted date with timezone'],
    ['zap', 'Run <strong>JSONPath Query</strong> → try <code>$.users[*].name</code> or <code>$.users[?(@.role == \'admin\')]</code>'],
    ['chart', 'Run <strong>Show Stats</strong> → see type distribution and depth analysis'],
    ['code', 'Run <strong>Generate TypeScript Interfaces</strong> → get typed interfaces instantly'],
    ['layers', 'Run <strong>Flatten JSON</strong> → converts nested structure to dot-notation flat map'],
  ];

  const body = /* html */`
<div class="hero"><div class="hero-inner">
  <div class="hero-logo">${icon('braces', 30)}</div>
  <div>
    <div class="hero-title">JSON Pro</div>
    <div class="hero-sub">The complete JSON toolbox for VS Code</div>
    <div class="hero-badges">
      ${['Format', 'Fix', 'Diff', 'JSONPath', 'TypeScript', 'Stats', 'Merge', 'YAML', 'JSONC'].map(b => `<span class="badge badge-secondary">${b}</span>`).join('')}
    </div>
  </div>
</div></div>

<div class="content">
  <section>
    <div class="section-title">Features — click a card to run it on the active JSON file</div>
    <div class="grid">${cards}
    </div>
  </section>

  <section>
    <div class="section-title">Keyboard shortcuts</div>
    <div class="card"><div class="card-content" style="padding:0">
      <table class="table kbd-table"><tbody>
        ${shortcuts.map(([name, keys]) => `<tr><td style="padding-left:16px">${name}</td><td>${keys.split('+').map(k => `<kbd>${k}</kbd>`).join(' + ')}</td></tr>`).join('')}
        <tr><td style="padding-left:16px">All commands</td><td>Right-click inside any <kbd>.json</kbd> or <kbd>.jsonc</kbd> file, or search <strong>JSON Pro</strong> in the Command Palette</td></tr>
      </tbody></table>
    </div></div>
  </section>

  <section>
    <div class="section-title">Try it — sample JSON</div>
    <div class="card sample-card">
      <div class="card-header row">
        <div><div class="card-title">${icon('fileJson', 15)} sample.json</div><div class="card-description">Covers every feature: timestamps, Base64, nested objects, arrays and nulls</div></div>
        <div class="row">
          <button class="btn btn-outline btn-sm" id="copySample">${icon('copy')} Copy</button>
          <button class="btn btn-default btn-sm" id="openSample">${icon('external')} Open in new file</button>
        </div>
      </div>
      <div class="card-content"><pre class="code" id="sampleJson">${esc(SAMPLE)}</pre></div>
    </div>
  </section>

  <section>
    <div class="section-title">Things to try with the sample</div>
    <div class="tips">
      ${tips.map(([ic, text]) => `<div class="alert">${icon(ic, 15)}<div class="alert-description">${text}</div></div>`).join('')}
    </div>
  </section>

  <div class="footer">JSON Pro · AkshayKale · <a id="changelog">v${esc(version)} — what's new</a></div>
</div>`;

  const script = /* js */`
  const vscode = acquireVsCodeApi();
  const SAMPLE = document.getElementById('sampleJson').textContent;
  const copyBtn = document.getElementById('copySample');
  const copyHtml = copyBtn.innerHTML;
  copyBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'copy', text: SAMPLE });
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.innerHTML = copyHtml; }, 2000);
  });
  document.getElementById('openSample').addEventListener('click', () => vscode.postMessage({ command: 'openSample', json: SAMPLE }));
  document.getElementById('changelog').addEventListener('click', () => vscode.postMessage({ command: 'openChangelog' }));
  document.querySelectorAll('.card[data-command]').forEach(card =>
    card.addEventListener('click', () => vscode.postMessage({ command: 'runCommand', id: card.dataset.command })));
`;

  return renderPage({ nonce, title: 'JSON Pro — Welcome', css: CSS, body, script });
}
