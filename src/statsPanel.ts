import * as vscode from 'vscode';
import { computeStats, JsonStats } from './core/stats';
import { parseJsonText } from './core/json';
import { reportError } from './editorUtils';

export function openStatsPanel(editor: vscode.TextEditor): void {
  const text = editor.document.getText();
  let stats: JsonStats;
  try {
    stats = computeStats(text, parseJsonText(text));
  } catch (e) {
    reportError('stats', e, editor);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'jsonProStats',
    `JSON Pro: Stats — ${vscode.workspace.asRelativePath(editor.document.uri)}`,
    vscode.ViewColumn.Beside,
    { enableScripts: false } // pure HTML, no scripts needed
  );
  panel.webview.html = getHtml(stats);
}

function fmt(n: number): string { return n.toLocaleString(); }

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getHtml(s: JsonStats): string {
  const total = Object.values(s.types).reduce((a, b) => a + b, 0);
  const typeColors: Record<string, string> = {
    object: '#4ec9b0', array: '#9cdcfe', string: '#ce9178', number: '#b5cea8', boolean: '#569cd6', null: '#888',
  };

  const typeBars = Object.entries(s.types).map(([type, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    return `
      <div class="type-row">
        <div class="type-label"><span class="dot" style="background:${typeColors[type]}"></span>${type}</div>
        <div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${typeColors[type]}"></div></div>
        <div class="type-count">${fmt(count)} <span class="pct">(${pct}%)</span></div>
      </div>`;
  }).join('');

  const arrRows = s.largestArrays.map(a =>
    `<tr><td class="mono">${esc(a.path)}</td><td class="num">${fmt(a.size)} items</td></tr>`
  ).join('') || '<tr><td colspan="2" class="empty-row">No arrays found</td></tr>';

  const deepRows = s.deepestPaths.map(d =>
    `<tr><td class="mono">${esc(d.path)}</td><td class="num">depth ${d.depth}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="empty-row">—</td></tr>';

  const strRows = s.longestStrings.map(str =>
    `<tr><td class="mono">${esc(str.path)}</td><td class="num">${fmt(str.length)} chars</td><td class="preview">"${esc(str.preview)}"</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty-row">No strings found</td></tr>';

  const saving = s.fileSize > 0 ? Math.round((1 - s.minifiedSize / s.fileSize) * 100) : 0;

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSON Stats</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); overflow-y: auto; padding: 20px; }
  h1 { font-size: 1.1em; font-weight: 600; margin-bottom: 20px; opacity: 0.9; }
  h2 { font-size: 0.85em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.5; margin-bottom: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--vscode-editorWidget-background, #252526); border: 1px solid var(--vscode-editorGroup-border, #333);
          border-radius: 6px; padding: 14px 16px; }
  .card-label { font-size: 0.75em; opacity: 0.55; margin-bottom: 6px; }
  .card-value { font-size: 1.6em; font-weight: 700; line-height: 1; }
  .card-sub { font-size: 0.75em; opacity: 0.45; margin-top: 4px; }
  .card.accent { border-color: var(--vscode-focusBorder, #007acc); }
  .section { margin-bottom: 24px; }
  .type-row { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; font-size: 0.85em; }
  .type-label { width: 70px; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .bar-wrap { flex: 1; height: 10px; background: rgba(128,128,128,0.15); border-radius: 5px; overflow: hidden; }
  .bar { height: 100%; border-radius: 5px; min-width: 2px; }
  .type-count { width: 110px; text-align: right; font-variant-numeric: tabular-nums; }
  .pct { opacity: 0.45; font-size: 0.88em; }
  table { width: 100%; border-collapse: collapse; font-size: 0.84em; }
  thead th { text-align: left; padding: 6px 10px; background: var(--vscode-editorGroupHeader-tabsBackground);
             font-weight: 600; opacity: 0.7; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody td { padding: 5px 10px; border-bottom: 1px solid var(--vscode-editorGroup-border, #2a2a2a); }
  tbody tr:hover td { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.08)); }
  .mono { font-family: var(--vscode-editor-font-family); color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe); word-break: break-all; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; opacity: 0.8; }
  .preview { opacity: 0.5; font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty-row { opacity: 0.4; font-style: italic; text-align: center; padding: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  @media (max-width: 700px) { .grid2 { grid-template-columns: 1fr; } }
  hr { border: none; border-top: 1px solid var(--vscode-editorGroup-border, #333); margin: 20px 0; }
</style>
</head>
<body>
<h1>📊 JSON Stats</h1>
<div class="cards">
  <div class="card accent"><div class="card-label">Total Keys</div><div class="card-value">${fmt(s.totalKeys)}</div></div>
  <div class="card"><div class="card-label">Total Values</div><div class="card-value">${fmt(s.totalValues)}</div></div>
  <div class="card"><div class="card-label">Max Depth</div><div class="card-value">${s.maxDepth}</div><div class="card-sub">levels</div></div>
  <div class="card"><div class="card-label">File Size</div><div class="card-value">${fmtBytes(s.fileSize)}</div>
    <div class="card-sub">pretty: ${fmtBytes(s.prettySize)} · minified: ${fmtBytes(s.minifiedSize)}${saving > 0 ? ` (−${saving}%)` : ''}</div></div>
  <div class="card"><div class="card-label">Objects</div><div class="card-value" style="color:#4ec9b0">${fmt(s.types.object)}</div></div>
  <div class="card"><div class="card-label">Arrays</div><div class="card-value" style="color:#9cdcfe">${fmt(s.types.array)}</div></div>
</div>
<div class="section"><h2>Value Type Distribution</h2>${typeBars}</div>
<hr>
<div class="grid2">
  <div><h2>Largest Arrays</h2><table><thead><tr><th>Path</th><th>Size</th></tr></thead><tbody>${arrRows}</tbody></table></div>
  <div><h2>Deepest Paths</h2><table><thead><tr><th>Path</th><th>Depth</th></tr></thead><tbody>${deepRows}</tbody></table></div>
</div>
<div class="section"><h2>Longest Strings</h2>
  <table><thead><tr><th>Path</th><th>Length</th><th>Preview</th></tr></thead><tbody>${strRows}</tbody></table>
</div>
</body>
</html>`;
}
