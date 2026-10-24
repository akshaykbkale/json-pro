import * as vscode from 'vscode';
import { computeStats, JsonStats } from './core/stats';
import { parseJsonText } from './core/json';
import { reportError } from './editorUtils';
import { escapeHtml as esc, icon, renderPage } from './webview/ui';

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
  panel.webview.html = getHtml(stats, vscode.workspace.asRelativePath(editor.document.uri));
}

function fmt(n: number): string { return n.toLocaleString(); }

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

const CSS = /* css */`
  body { overflow-y: auto; padding: 20px 24px 40px; }
  .page { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  .page-title { display: flex; align-items: center; gap: 8px; font-size: 1.25em; font-weight: 600; letter-spacing: -0.01em; }
  .page-title .muted { font-size: 0.72em; font-weight: 400; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .metric .card-header { padding: 12px 14px 4px; }
  .metric .card-content { padding: 0 14px 12px; gap: 2px; }
  .metric-value { font-size: 1.7em; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .metric-sub { font-size: var(--text-xs); color: var(--muted-foreground); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 760px) { .grid2 { grid-template-columns: 1fr; } }
  .type-row { display: grid; grid-template-columns: 90px 1fr 120px; align-items: center; gap: 12px; font-size: var(--text-sm); padding: 4px 0; }
  .type-label { display: flex; align-items: center; gap: 7px; text-transform: capitalize; }
  .type-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .type-count { text-align: right; font-variant-numeric: tabular-nums; }
  .type-count .pct { color: var(--muted-foreground); font-size: 0.9em; margin-left: 4px; }
  .path { font-family: var(--font-mono); color: var(--vscode-debugTokenExpression-name, #9cdcfe); word-break: break-all; font-size: var(--text-xs); }
  .preview { color: var(--muted-foreground); font-style: italic; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-xs); }
  .card .table { margin: 0 -16px; width: calc(100% + 32px); }
  .card .table th:first-child, .card .table td:first-child { padding-left: 16px; }
  .card .table th:last-child, .card .table td:last-child { padding-right: 16px; }
`;

function getHtml(s: JsonStats, fileName: string): string {
  const total = Object.values(s.types).reduce((a, b) => a + b, 0);
  const typeColors: Record<string, string> = {
    object: '#4ec9b0', array: '#9cdcfe', string: '#ce9178', number: '#b5cea8', boolean: '#569cd6', null: '#9a9a9a',
  };
  const typeRows = Object.entries(s.types).map(([type, count]) => {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
    return `
      <div class="type-row">
        <div class="type-label"><span class="type-dot" style="background:${typeColors[type]}"></span>${type}</div>
        <div class="progress"><div class="progress-indicator" style="width:${pct}%;background:${typeColors[type]}"></div></div>
        <div class="type-count">${fmt(count)}<span class="pct">${pct}%</span></div>
      </div>`;
  }).join('');

  const arrRows = s.largestArrays.map(a =>
    `<tr><td class="path">${esc(a.path)}</td><td class="num">${fmt(a.size)} item${a.size === 1 ? '' : 's'}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="empty-row">No arrays found</td></tr>';
  const deepRows = s.deepestPaths.map(d =>
    `<tr><td class="path">${esc(d.path)}</td><td class="num">depth ${d.depth}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="empty-row">—</td></tr>';
  const strRows = s.longestStrings.map(str =>
    `<tr><td class="path">${esc(str.path)}</td><td class="num">${fmt(str.length)} char${str.length === 1 ? '' : 's'}</td><td class="preview">"${esc(str.preview)}"</td></tr>`
  ).join('') || '<tr><td colspan="3" class="empty-row">No strings found</td></tr>';
  const saving = s.fileSize > 0 ? Math.round((1 - s.minifiedSize / s.fileSize) * 100) : 0;

  const metric = (label: string, value: string, sub?: string, color?: string): string => `
    <div class="card metric">
      <div class="card-header"><div class="card-description">${label}</div></div>
      <div class="card-content"><div class="metric-value"${color ? ` style="color:${color}"` : ''}>${value}</div>${sub ? `<div class="metric-sub">${sub}</div>` : ''}</div>
    </div>`;

  const body = /* html */`
<div class="page">
  <div class="page-title">${icon('chart', 18)} JSON Stats <span class="muted truncate">${esc(fileName)}</span></div>
  <div class="metrics">
    ${metric('Total keys', fmt(s.totalKeys))}
    ${metric('Total values', fmt(s.totalValues))}
    ${metric('Max depth', String(s.maxDepth), 'levels')}
    ${metric('File size', fmtBytes(s.fileSize), `pretty ${fmtBytes(s.prettySize)} · minified ${fmtBytes(s.minifiedSize)}${saving > 0 ? ` (−${saving}%)` : ''}`)}
    ${metric('Objects', fmt(s.types.object), undefined, typeColors.object)}
    ${metric('Arrays', fmt(s.types.array), undefined, typeColors.array)}
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">Value type distribution</div><div class="card-description">${fmt(total)} values and containers</div></div>
    <div class="card-content">${typeRows}</div>
  </div>
  <div class="grid2">
    <div class="card">
      <div class="card-header"><div class="card-title">Largest arrays</div></div>
      <div class="card-content"><table class="table"><thead><tr><th>Path</th><th class="num">Size</th></tr></thead><tbody>${arrRows}</tbody></table></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title">Deepest paths</div></div>
      <div class="card-content"><table class="table"><thead><tr><th>Path</th><th class="num">Depth</th></tr></thead><tbody>${deepRows}</tbody></table></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><div class="card-title">Longest strings</div></div>
    <div class="card-content"><table class="table"><thead><tr><th>Path</th><th class="num">Length</th><th>Preview</th></tr></thead><tbody>${strRows}</tbody></table></div>
  </div>
</div>`;

  return renderPage({ nonce: 'none', title: 'JSON Stats', css: CSS, body });
}
