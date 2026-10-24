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
  :root {
    --add-line: var(--vscode-diffEditor-insertedLineBackground, rgba(63,185,80,0.15));
    --add-text: var(--vscode-diffEditor-insertedTextBackground, rgba(63,185,80,0.40));
    --del-line: var(--vscode-diffEditor-removedLineBackground, rgba(224,82,82,0.15));
    --del-text: var(--vscode-diffEditor-removedTextBackground, rgba(224,82,82,0.40));
    --chg-line: rgba(210,153,34,0.16);
    --chg-text: rgba(210,153,34,0.45);
    --add-fg: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --del-fg: var(--vscode-gitDecoration-deletedResourceForeground, #e05252);
    --chg-fg: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922);
    --border: var(--vscode-editorGroup-border, #333);
    --tok-key: var(--vscode-debugTokenExpression-name, #9cdcfe);
    --tok-str: var(--vscode-debugTokenExpression-string, #ce9178);
    --tok-num: var(--vscode-debugTokenExpression-number, #b5cea8);
    --tok-kw:  var(--vscode-debugTokenExpression-boolean, #569cd6);
    --filler: repeating-linear-gradient(-45deg, transparent 0 5px, rgba(128,128,128,0.10) 5px 10px);
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground);
         background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Input section ── */
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

  /* ── Result section ── */
  #result-section { display: none; flex-direction: column; flex: 1; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--vscode-editorGroupHeader-tabsBackground);
             border-bottom: 1px solid var(--border); flex-shrink: 0; flex-wrap: wrap; }
  .toolbar-label { font-weight: 600; margin-right: 8px; font-size: 0.9em; opacity: 0.8; }
  .toolbar-sep { flex: 1; }
  .toolbar .group { display: inline-flex; align-items: center; gap: 2px; margin-right: 6px; }
  .hunk-pos { font-size: 0.82em; opacity: 0.7; min-width: 56px; text-align: center; font-variant-numeric: tabular-nums; }
  .toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 0.82em; opacity: 0.85; cursor: pointer; user-select: none; margin-right: 6px; }
  .toggle input { accent-color: var(--vscode-button-background); }
  .summary { display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex-shrink: 0; background: var(--vscode-editorWidget-background, #252526);
             border-bottom: 1px solid var(--border); font-size: 0.82em; flex-wrap: wrap; }
  .summary-label { opacity: 0.6; font-weight: 600; }
  .summary .kbd-hint { margin-left: auto; opacity: 0.45; font-size: 0.92em; }
  kbd { font-family: var(--vscode-editor-font-family); padding: 0 4px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.9em; }

  /* ── Diff view ── */
  .diff-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .diff-headers { display: flex; flex-shrink: 0; border-bottom: 1px solid var(--border); }
  .diff-header-col { flex: 1; padding: 5px 12px; font-size: 0.82em; font-weight: 600; background: var(--vscode-editorGroupHeader-tabsBackground);
                     display: flex; align-items: center; gap: 6px; min-width: 0; }
  .diff-header-col span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diff-header-col + .diff-header-col { border-left: 1px solid var(--border); }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.red { background: var(--del-fg); } .dot.green { background: var(--add-fg); }
  .diff-body { flex: 1; overflow: auto; }
  .diff-table { width: 100%; border-collapse: collapse; font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size, 13px); table-layout: fixed; line-height: 1.5; }
  .diff-table td { padding: 0; vertical-align: top; }
  col.c-ln { width: 44px; } col.c-sign { width: 16px; } col.c-mid { width: 1px; }
  .ln { text-align: right; padding: 0 6px 0 4px; opacity: 0.45; user-select: none; font-size: 0.88em; }
  .sign { text-align: center; user-select: none; font-weight: 700; opacity: 0.9; }
  .code { padding: 0 12px 0 4px; white-space: pre-wrap; word-break: break-all; }
  .mid-border { background: var(--border); padding: 0; }
  .filler { background: var(--filler); }

  tr.added .ln-right, tr.added .sign-right, tr.added .code-right { background: var(--add-line); }
  tr.added .sign-right { color: var(--add-fg); }
  tr.removed .ln-left, tr.removed .sign-left, tr.removed .code-left { background: var(--del-line); }
  tr.removed .sign-left { color: var(--del-fg); }
  tr.changed .ln-left, tr.changed .sign-left, tr.changed .code-left,
  tr.changed .ln-right, tr.changed .sign-right, tr.changed .code-right { background: var(--chg-line); }
  tr.changed .sign { color: var(--chg-fg); }
  tr.added .ln-right, tr.removed .ln-left, tr.changed .ln { opacity: 0.8; }

  /* character-level highlights */
  .code-right .chg, tr.added .chg { background: var(--add-text); border-radius: 2px; }
  .code-left .chg, tr.removed .chg { background: var(--del-text); border-radius: 2px; }
  tr.changed .chg { background: var(--chg-text); }

  /* syntax tokens */
  .tk-key { color: var(--tok-key); } .tk-str { color: var(--tok-str); } .tk-num { color: var(--tok-num); } .tk-kw { color: var(--tok-kw); }
  .tk-pun { opacity: 0.7; }

  /* collapsed unchanged region */
  tr.collapsed td { text-align: center; font-size: 0.82em; opacity: 0.7; padding: 3px 0; cursor: pointer; user-select: none;
                    background: var(--vscode-editorWidget-background, #252526); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  tr.collapsed td:hover { opacity: 1; }

  /* current hunk */
  tr.current-diff td:first-child { box-shadow: inset 3px 0 0 var(--vscode-focusBorder, #007acc); }
  tr.current-diff td { filter: brightness(1.08); }

  /* identical */
  .identical-note { padding: 40px; text-align: center; opacity: 0.6; }

  /* ── Buttons & badges ── */
  button { padding: 4px 12px; cursor: pointer; border: none; border-radius: 3px; background: var(--vscode-button-background);
           color: var(--vscode-button-foreground); font-size: 0.85em; white-space: nowrap; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  button.small { padding: 2px 8px; font-size: 0.78em; }
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 9px; border-radius: 10px; font-size: 0.85em; font-weight: 600; }
  .badge.added { background: var(--add-line); color: var(--add-fg); }
  .badge.removed { background: var(--del-line); color: var(--del-fg); }
  .badge.changed { background: var(--chg-line); color: var(--chg-fg); }
  .badge.same { background: rgba(128,128,128,0.15); opacity: 0.7; font-weight: 400; }
  .badge.identical { background: var(--add-line); color: var(--add-fg); }
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
    <span class="group">
      <button class="secondary" data-action="prev" title="Previous change (p / Shift+F7)">&#8593; Prev</button>
      <span class="hunk-pos" id="hunk-pos">0 / 0</span>
      <button class="secondary" data-action="next" title="Next change (n / F7)">&#8595; Next</button>
    </span>
    <label class="toggle" title="Collapse runs of unchanged lines"><input type="checkbox" id="collapseToggle" checked> Hide unchanged</label>
    <button class="secondary" data-action="swap">&#8597; Swap</button>
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
    <div class="diff-body" id="diff-body"><table class="diff-table">
        <colgroup><col class="c-ln"><col class="c-sign"><col class="c-code"><col class="c-mid"><col class="c-ln"><col class="c-sign"><col class="c-code"></colgroup>
        <tbody id="diff-tbody"></tbody></table></div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const CONTEXT = 3;        // unchanged lines kept around each change when collapsing
  const MIN_COLLAPSE = 4;   // runs shorter than this are never collapsed

  let lines = [];           // DiffLine[] from the extension host
  let hunks = [];           // { start, end } row-index ranges of consecutive changed rows
  let rowEls = new Map();   // row index → <tr>
  let currentHunk = -1;
  let expanded = new Set(); // start indices of collapsed runs the user opened
  let lastFormattedRight = '';
  const saved = vscode.getState() || {};
  let collapse = saved.collapse !== undefined ? saved.collapse : true;
  $('collapseToggle').checked = collapse;

  // ── Wiring ──
  $('compareBtn').addEventListener('click', sendCompare);
  ['left', 'right'].forEach(id => $(id).addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendCompare(); }));
  document.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ command: 'pickFile', side: b.dataset.pick })));
  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => actions[b.dataset.action]()));
  $('collapseToggle').addEventListener('change', e => { collapse = e.target.checked; vscode.setState({ collapse }); expanded.clear(); render(); });
  $('diff-tbody').addEventListener('click', e => {
    const tr = e.target.closest('tr.collapsed');
    if (tr) { expanded.add(Number(tr.dataset.start)); render(); }
  });
  document.addEventListener('keydown', e => {
    if ($('result-section').style.display !== 'flex') return;
    if (e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type === 'text')) return;
    if (e.key === 'n' || (e.key === 'F7' && !e.shiftKey)) { e.preventDefault(); actions.next(); }
    else if (e.key === 'p' || (e.key === 'F7' && e.shiftKey)) { e.preventDefault(); actions.prev(); }
    else if (e.key === 'h') { $('collapseToggle').click(); }
  });

  const actions = {
    back: () => { $('result-section').style.display = 'none'; $('input-section').style.display = 'flex'; },
    swap: () => {
      const lv = $('left').value, rv = $('right').value, ln = $('left-name').value, rn = $('right-name').value;
      $('left').value = rv; $('right').value = lv; $('left-name').value = rn; $('right-name').value = ln;
      sendCompare();
    },
    prev: () => { if (!hunks.length) return; goToHunk((currentHunk - 1 + hunks.length) % hunks.length); },
    next: () => { if (!hunks.length) return; goToHunk((currentHunk + 1) % hunks.length); },
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

  // ── Messages from the extension host ──
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

    lines = data.lines;
    hunks = computeHunks(lines);
    expanded.clear();
    currentHunk = -1;

    const s = data.summary;
    const identical = s.added + s.removed + s.changed === 0;
    const summary = $('summary');
    summary.innerHTML = '';
    summary.append(el('span', 'summary-label', 'diff result'));
    if (identical) summary.append(badge('✓ documents are semantically identical', 'identical'));
    summary.append(badge('+' + s.added + ' added', 'added'), badge('−' + s.removed + ' removed', 'removed'),
                   badge('~' + s.changed + ' changed', 'changed'), badge('=' + s.same + ' same', 'same'));
    const hint = el('span', 'kbd-hint', '');
    hint.innerHTML = '<kbd>n</kbd> next · <kbd>p</kbd> prev · <kbd>h</kbd> hide/show unchanged';
    summary.append(hint);

    render();
    $('input-section').style.display = 'none';
    $('result-section').style.display = 'flex';
    if (hunks.length > 0) setTimeout(() => goToHunk(0), 30);
  });

  // ── Rendering ──
  function computeHunks(ls) {
    const out = [];
    let start = -1;
    ls.forEach((l, i) => {
      if (l.type !== 'equal') { if (start === -1) start = i; }
      else if (start !== -1) { out.push({ start, end: i - 1 }); start = -1; }
    });
    if (start !== -1) out.push({ start, end: ls.length - 1 });
    return out;
  }

  function visibleRows() {
    // Returns an array of either row indices or { collapsedStart, count } markers.
    if (!collapse || hunks.length === 0) return lines.map((_, i) => i);
    const keep = new Uint8Array(lines.length);
    for (const h of hunks) for (let i = Math.max(0, h.start - CONTEXT); i <= Math.min(lines.length - 1, h.end + CONTEXT); i++) keep[i] = 1;
    const out = [];
    for (let i = 0; i < lines.length;) {
      if (keep[i]) { out.push(i); i++; continue; }
      let j = i; while (j < lines.length && !keep[j]) j++;
      const count = j - i;
      if (count < MIN_COLLAPSE || expanded.has(i)) { for (let k = i; k < j; k++) out.push(k); }
      else out.push({ collapsedStart: i, count });
      i = j;
    }
    return out;
  }

  function render() {
    const tbody = $('diff-tbody');
    tbody.innerHTML = '';
    rowEls = new Map();
    const frag = document.createDocumentFragment();
    for (const item of visibleRows()) {
      if (typeof item === 'number') { const tr = buildRow(lines[item], item); rowEls.set(item, tr); frag.appendChild(tr); }
      else {
        const tr = document.createElement('tr');
        tr.className = 'collapsed';
        tr.dataset.start = String(item.collapsedStart);
        const td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = '⋯ ' + item.count + ' unchanged line' + (item.count === 1 ? '' : 's') + ' — click to show';
        tr.appendChild(td);
        frag.appendChild(tr);
      }
    }
    tbody.appendChild(frag);
    markCurrent();
  }

  function buildRow(line, idx) {
    const tr = document.createElement('tr');
    tr.className = line.type;
    tr.dataset.idx = idx;
    let lRange = null, rRange = null;
    if (line.type === 'changed') { [lRange, rRange] = charDiff(line.leftLine, line.rightLine); }
    else if (line.type === 'added') rRange = [0, line.rightLine.length];
    else if (line.type === 'removed') lRange = [0, line.leftLine.length];
    const hasLeft = line.leftNum !== null, hasRight = line.rightNum !== null;
    const sign = { added: '+', removed: '−', changed: '~', equal: '' }[line.type];

    tr.append(
      cell('ln ln-left' + (hasLeft ? '' : ' filler'), hasLeft ? String(line.leftNum) : ''),
      cell('sign sign-left' + (hasLeft ? '' : ' filler'), hasLeft && line.type !== 'added' ? sign : ''),
      codeCell('code code-left' + (hasLeft ? '' : ' filler'), line.leftLine, lRange),
      cell('mid-border', ''),
      cell('ln ln-right' + (hasRight ? '' : ' filler'), hasRight ? String(line.rightNum) : ''),
      cell('sign sign-right' + (hasRight ? '' : ' filler'), hasRight && line.type !== 'removed' ? sign : ''),
      codeCell('code code-right' + (hasRight ? '' : ' filler'), line.rightLine, rRange),
    );
    return tr;
  }

  // Common prefix/suffix trimming → the differing span on each side.
  function charDiff(a, b) {
    let p = 0;
    const max = Math.min(a.length, b.length);
    while (p < max && a[p] === b[p]) p++;
    let s = 0;
    while (s < max - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return [[p, a.length - s], [p, b.length - s]];
  }

  const TOKEN = /("(?:[^"\\\\]|\\\\.)*")(\\s*:)?|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|\\b(true|false|null)\\b|([{}\\[\\],:])/g;

  function tokenize(text) {
    const tokens = [];
    let m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(text)) !== null) {
      if (m[1] !== undefined) {
        tokens.push({ start: m.index, end: m.index + m[1].length, cls: m[2] !== undefined ? 'tk-key' : 'tk-str' });
        if (m[2] !== undefined) tokens.push({ start: m.index + m[1].length, end: m.index + m[0].length, cls: 'tk-pun' });
      } else if (m[3] !== undefined) tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'tk-num' });
      else if (m[4] !== undefined) tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'tk-kw' });
      else tokens.push({ start: m.index, end: m.index + m[0].length, cls: 'tk-pun' });
    }
    return tokens;
  }

  // Syntax-coloured line with an optional [from, to) range wrapped in .chg (token spans are split at the boundaries).
  function codeCell(cls, text, range) {
    const td = document.createElement('td');
    td.className = cls;
    if (!text) return td;
    const bounds = new Set([0, text.length]);
    const tokens = tokenize(text);
    for (const t of tokens) { bounds.add(t.start); bounds.add(t.end); }
    if (range && range[0] < range[1]) { bounds.add(range[0]); bounds.add(range[1]); }
    const cuts = [...bounds].sort((x, y) => x - y);
    const frag = document.createDocumentFragment();
    let ti = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i], to = cuts[i + 1];
      while (ti < tokens.length && tokens[ti].end <= from) ti++;
      const tok = ti < tokens.length && tokens[ti].start <= from ? tokens[ti] : null;
      const inChange = range && from >= range[0] && to <= range[1];
      const classes = [tok ? tok.cls : '', inChange ? 'chg' : ''].filter(Boolean);
      const piece = text.slice(from, to);
      if (classes.length === 0) frag.append(document.createTextNode(piece));
      else frag.append(el('span', classes.join(' '), piece));
    }
    td.appendChild(frag);
    return td;
  }

  function goToHunk(i) {
    currentHunk = i;
    const h = hunks[i];
    if (!h) return;
    if (!rowEls.has(h.start)) { // inside a collapsed run (e.g. after toggling) → expand it
      for (const tr of document.querySelectorAll('tr.collapsed')) {
        const start = Number(tr.dataset.start);
        if (start <= h.start) expanded.add(start);
      }
      render();
    }
    markCurrent();
    const row = rowEls.get(h.start);
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function markCurrent() {
    document.querySelectorAll('tr.current-diff').forEach(r => r.classList.remove('current-diff'));
    const h = hunks[currentHunk];
    if (h) for (let i = h.start; i <= h.end; i++) rowEls.get(i)?.classList.add('current-diff');
    $('hunk-pos').textContent = hunks.length ? (currentHunk + 1) + ' / ' + hunks.length : '0 / 0';
  }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function cell(cls, text) { return el('td', cls, text); }
  function badge(text, cls) { return el('span', 'badge ' + cls, text); }
</script>
</body>
</html>`;
}
