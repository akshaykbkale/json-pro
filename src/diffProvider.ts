import * as vscode from 'vscode';
import { computeJsonDiff } from './core/diff';
import { generateNonce, getIndent, isJsonDocument, pickJsonFile, replaceDocumentText, resolveDocument, statusMessage } from './editorUtils';
import { escapeHtml, icon, renderPage } from './webview/ui';

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

const CSS = /* css */`
  body { display: flex; flex-direction: column; overflow: hidden; }
  :root {
    --add-line: var(--vscode-diffEditor-insertedLineBackground, rgba(63,185,80,0.15));
    --add-text: var(--vscode-diffEditor-insertedTextBackground, rgba(63,185,80,0.40));
    --del-line: var(--vscode-diffEditor-removedLineBackground, rgba(224,82,82,0.15));
    --del-text: var(--vscode-diffEditor-removedTextBackground, rgba(224,82,82,0.40));
    --chg-line: color-mix(in srgb, var(--warning) 16%, transparent);
    --chg-text: color-mix(in srgb, var(--warning) 45%, transparent);
    --add-fg: var(--vscode-gitDecoration-addedResourceForeground, #3fb950);
    --del-fg: var(--vscode-gitDecoration-deletedResourceForeground, #e05252);
    --chg-fg: var(--vscode-gitDecoration-modifiedResourceForeground, #d29922);
    --tok-key: var(--vscode-debugTokenExpression-name, #9cdcfe);
    --tok-str: var(--vscode-debugTokenExpression-string, #ce9178);
    --tok-num: var(--vscode-debugTokenExpression-number, #b5cea8);
    --tok-kw:  var(--vscode-debugTokenExpression-boolean, #569cd6);
    --filler: repeating-linear-gradient(-45deg, transparent 0 5px, rgba(128,128,128,0.10) 5px 10px);
  }

  /* ── Input stage ── */
  #input-section { display: flex; flex-direction: column; flex: 1; padding: 16px; gap: 12px; overflow: auto; }
  .input-row { display: flex; gap: 12px; flex: 1; min-height: 0; }
  .input-col { flex: 1; }
  .input-col .card-content { flex: 1; }
  .input-col .textarea { flex: 1; min-height: 160px; }
  .input-actions { display: flex; gap: 12px; align-items: center; }

  /* ── Result stage ── */
  #result-section { display: none; flex-direction: column; flex: 1; overflow: hidden; }
  .hunk-pos { font-size: var(--text-xs); color: var(--muted-foreground); min-width: 48px; text-align: center; font-variant-numeric: tabular-nums; }
  .summary { display: flex; align-items: center; gap: 6px; padding: 7px 12px; flex-shrink: 0; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .summary .kbd-hint { margin-left: auto; display: inline-flex; gap: 10px; align-items: center; font-size: var(--text-xs); color: var(--muted-foreground); }
  .badge.b-added { color: var(--add-fg); } .badge.b-removed { color: var(--del-fg); } .badge.b-changed { color: var(--chg-fg); }
  .badge.b-same { color: var(--muted-foreground); }
  .badge.b-identical { color: var(--add-fg); border-color: color-mix(in srgb, var(--add-fg) 40%, transparent); background: var(--add-line); }

  .diff-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .diff-headers { display: flex; flex-shrink: 0; border-bottom: 1px solid var(--border); background: var(--card); }
  .diff-header-col { flex: 1; padding: 6px 12px; font-size: var(--text-xs); font-weight: 500; color: var(--muted-foreground);
                     display: flex; align-items: center; gap: 7px; min-width: 0; }
  .diff-header-col .name { color: var(--foreground); font-weight: 600; }
  .diff-header-col + .diff-header-col { border-left: 1px solid var(--border); }
  .dot-l { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot-l.red { background: var(--del-fg); } .dot-l.green { background: var(--add-fg); }
  .diff-body { flex: 1; overflow: auto; }
  .diff-table { width: 100%; border-collapse: collapse; font-family: var(--font-mono);
                font-size: var(--vscode-editor-font-size, 13px); table-layout: fixed; line-height: 1.5; }
  .diff-table td { padding: 0; vertical-align: top; }
  col.c-ln { width: 44px; } col.c-sign { width: 16px; } col.c-mid { width: 1px; }
  .ln { text-align: right; padding: 0 6px 0 4px; color: var(--muted-foreground); opacity: 0.7; user-select: none; font-size: 0.88em; }
  .sign { text-align: center; user-select: none; font-weight: 700; }
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
  tr.added .ln-right, tr.removed .ln-left, tr.changed .ln { opacity: 1; }
  .code-right .chg, tr.added .chg { background: var(--add-text); border-radius: 2px; }
  .code-left .chg, tr.removed .chg { background: var(--del-text); border-radius: 2px; }
  tr.changed .chg { background: var(--chg-text); }
  .tk-key { color: var(--tok-key); } .tk-str { color: var(--tok-str); } .tk-num { color: var(--tok-num); } .tk-kw { color: var(--tok-kw); }
  .tk-pun { opacity: 0.7; }
  tr.collapsed td { text-align: center; font-family: var(--font-sans); font-size: var(--text-xs); color: var(--muted-foreground); padding: 4px 0;
                    cursor: pointer; user-select: none; background: var(--muted); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  tr.collapsed td:hover { color: var(--foreground); background: var(--accent); }
  tr.collapsed td .icon { vertical-align: -3px; margin-right: 4px; }
  tr.current-diff td:first-child { box-shadow: inset 3px 0 0 var(--ring); }
`;

function getWebviewHtml(nonce: string, sourceName: string | undefined): string {
  const body = /* html */`
<div id="input-section">
  <div class="input-row">
    <div class="card input-col">
      <div class="card-header row">
        <div><div class="card-title"><span class="dot-l red"></span>Original</div><div class="card-description">Left side — the baseline to compare against</div></div>
        <button class="btn btn-outline btn-sm" data-pick="left">${icon('file')} Load file…</button>
      </div>
      <div class="card-content">
        <input class="input" type="text" id="left-name" placeholder="Label (e.g. original)" value="original" spellcheck="false">
        <textarea class="textarea mono" id="left" placeholder="Paste original JSON here…" spellcheck="false"></textarea>
        <div id="left-error" class="field-error"></div>
      </div>
    </div>
    <div class="card input-col">
      <div class="card-header row">
        <div><div class="card-title"><span class="dot-l green"></span>Modified</div><div class="card-description">Right side — the version with changes</div></div>
        <button class="btn btn-outline btn-sm" data-pick="right">${icon('file')} Load file…</button>
      </div>
      <div class="card-content">
        <input class="input" type="text" id="right-name" placeholder="Label (e.g. modified)" value="modified" spellcheck="false">
        <textarea class="textarea mono" id="right" placeholder="Paste modified JSON here…" spellcheck="false"></textarea>
        <div id="right-error" class="field-error"></div>
      </div>
    </div>
  </div>
  <div class="input-actions">
    <button id="compareBtn" class="btn btn-default">${icon('diff')} Compare</button>
    <span class="text-xs muted"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to compare · both sides are normalised first, so formatting differences are ignored</span>
  </div>
</div>

<div id="result-section">
  <div class="toolbar">
    <span class="toolbar-title">${icon('diff', 15)} JSON Diff</span>
    <span class="btn-group">
      <button class="btn btn-outline btn-sm" data-action="prev" title="Previous change (p / Shift+F7)">${icon('chevronUp')} Prev</button>
      <span class="hunk-pos" id="hunk-pos">0 / 0</span>
      <button class="btn btn-outline btn-sm" data-action="next" title="Next change (n / F7)">Next ${icon('chevronDown')}</button>
    </span>
    <hr class="separator vertical">
    <label class="switch" title="Collapse runs of unchanged lines (h)"><input type="checkbox" id="collapseToggle" checked><span class="switch-track"><span class="switch-thumb"></span></span>Hide unchanged</label>
    <hr class="separator vertical">
    <button class="btn btn-ghost btn-sm" data-action="swap">${icon('swap')} Swap</button>
    <button class="btn btn-ghost btn-sm" data-action="copyRight">${icon('copy')} Copy right</button>
    <button class="btn btn-default btn-sm" data-action="apply" id="applyBtn"${sourceName ? '' : ' disabled title="No source document to apply to"'}>${icon('check')} Apply right to ${sourceName ? escapeHtml(sourceName) : 'editor'}</button>
    <span class="spacer"></span>
    <button class="btn btn-outline btn-sm" data-action="back">${icon('arrowLeft')} Edit</button>
  </div>
  <div class="summary" id="summary"></div>
  <div class="diff-wrap">
    <div class="diff-headers">
      <div class="diff-header-col"><span class="dot-l red"></span>original <span class="name truncate" id="left-title">original</span></div>
      <div class="diff-header-col"><span class="dot-l green"></span>modified <span class="name truncate" id="right-title">modified</span></div>
    </div>
    <div class="diff-body" id="diff-body"><table class="diff-table">
        <colgroup><col class="c-ln"><col class="c-sign"><col class="c-code"><col class="c-mid"><col class="c-ln"><col class="c-sign"><col class="c-code"></colgroup>
        <tbody id="diff-tbody"></tbody></table></div>
  </div>
</div>`;

  const script = /* js */`
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const CONTEXT = 3;        // unchanged lines kept around each change when collapsing
  const MIN_COLLAPSE = 4;   // runs shorter than this are never collapsed
  const CHEVRON = ${JSON.stringify(icon('chevronDown', 12))};

  let lines = [];           // DiffLine[] from the extension host
  let hunks = [];           // { start, end } row-index ranges of consecutive changed rows
  let rowEls = new Map();   // row index → <tr>
  let currentHunk = -1;
  let expanded = new Set(); // start indices of collapsed runs the user opened
  let lastFormattedRight = '';
  const saved = vscode.getState() || {};
  let collapse = saved.collapse !== undefined ? saved.collapse : true;
  $('collapseToggle').checked = collapse;

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
    ['left', 'right'].forEach(id => { $(id).classList.remove('invalid'); const e = $(id + '-error'); e.textContent = ''; e.classList.remove('show'); });
  }
  function showError(side, message) {
    $(side).classList.add('invalid');
    const e = $(side + '-error'); e.textContent = message; e.classList.add('show');
  }

  window.addEventListener('message', event => {
    const data = event.data;
    if (data.command === 'init') { $('left').value = data.json || ''; if (data.name) $('left-name').value = data.name; return; }
    if (data.command === 'setSide') { $(data.side).value = data.json || ''; return; }
    if (data.command !== 'diffResult') return;

    if (data.type === 'error') {
      clearErrors();
      if (data.side === 'both') { showError('left', data.message); return; }
      showError(data.side, 'Invalid JSON: ' + data.message);
      return;
    }

    lastFormattedRight = data.formattedRight;
    $('left').value = data.formattedLeft;
    $('right').value = data.formattedRight;
    $('left-title').textContent = data.leftName && data.leftName !== 'original' ? data.leftName : '';
    $('right-title').textContent = data.rightName && data.rightName !== 'modified' ? data.rightName : '';

    lines = data.lines;
    hunks = computeHunks(lines);
    expanded.clear();
    currentHunk = -1;

    const s = data.summary;
    const identical = s.added + s.removed + s.changed === 0;
    const summary = $('summary');
    summary.innerHTML = '';
    if (identical) summary.append(badge('Documents are semantically identical', 'b-identical', true));
    summary.append(badge('+' + s.added + ' added', 'b-added'), badge('−' + s.removed + ' removed', 'b-removed'),
                   badge('~' + s.changed + ' changed', 'b-changed'), badge('=' + s.same + ' same', 'b-same'));
    const hint = el('span', 'kbd-hint', '');
    hint.innerHTML = '<span><kbd>n</kbd> next</span><span><kbd>p</kbd> prev</span><span><kbd>h</kbd> hide unchanged</span>';
    summary.append(hint);

    render();
    $('input-section').style.display = 'none';
    $('result-section').style.display = 'flex';
    if (hunks.length > 0) setTimeout(() => goToHunk(0), 30);
  });

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
        td.innerHTML = CHEVRON + esc(item.count + ' unchanged line' + (item.count === 1 ? '' : 's') + ' — click to show');
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
    if (!rowEls.has(h.start)) {
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
  function badge(text, cls, filled) {
    const b = el('span', 'badge ' + (filled ? '' : 'badge-outline ') + cls, '');
    const dot = el('span', 'dot', ''); b.append(dot, document.createTextNode(text));
    return b;
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
`;

  return renderPage({ nonce, title: 'JSON Diff', css: CSS, body, script });
}
