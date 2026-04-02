import * as vscode from 'vscode';

export function openDiffPanel(context: vscode.ExtensionContext): void {
  const nonce = generateNonce();
  const panel = vscode.window.createWebviewPanel(
    'jsonProDiff',
    'JSON Diff',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  let initialLeft = '';
  const editor = vscode.window.activeTextEditor;
  if (
    editor &&
    (editor.document.languageId === 'json' || editor.document.languageId === 'jsonc')
  ) {
    initialLeft = editor.document.getText();
  }

  panel.webview.html = getWebviewHtml(nonce);

  // Send initial JSON safely via postMessage — never interpolated into HTML
  panel.webview.postMessage({ command: 'init', json: initialLeft });

  panel.webview.onDidReceiveMessage(
    async (msg: {
      command: string;
      left?: string;
      right?: string;
      leftName?: string;
      rightName?: string;
    }) => {
      if (msg.command === 'compare') {
        const result = computeDiff(msg.left ?? '', msg.right ?? '');
        panel.webview.postMessage({
          command: 'diffResult',
          leftName: msg.leftName || 'original',
          rightName: msg.rightName || 'modified',
          ...result,
        });
      } else if (msg.command === 'applyToEditor') {
        await applyToEditor(msg.right ?? '');
      }
    },
    undefined,
    context.subscriptions
  );
}

async function applyToEditor(text: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('JSON Pro: No active editor to apply changes to.');
    return;
  }
  const doc = editor.document;
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(doc.uri, fullRange, text);
  await vscode.workspace.applyEdit(edit);
  vscode.window.setStatusBarMessage('$(check) JSON Pro: Changes applied to editor', 3000);
}

// ─── Diff types ──────────────────────────────────────────────────────────────

interface DiffLine {
  type: 'equal' | 'added' | 'removed' | 'changed';
  leftLine: string;
  rightLine: string;
  leftNum: number | null;
  rightNum: number | null;
}

interface DiffSuccess {
  type: 'success';
  lines: DiffLine[];
  formattedLeft: string;
  formattedRight: string;
  summary: { added: number; removed: number; changed: number; same: number };
}

interface DiffError {
  type: 'error';
  side: 'left' | 'right';
  message: string;
}

// ─── Diff algorithm ──────────────────────────────────────────────────────────

function computeDiff(leftText: string, rightText: string): DiffSuccess | DiffError {
  let leftFormatted: string;
  let rightFormatted: string;

  try {
    leftFormatted = JSON.stringify(JSON.parse(leftText), null, 2);
  } catch (e) {
    return { type: 'error', side: 'left', message: e instanceof Error ? e.message : String(e) };
  }

  try {
    rightFormatted = JSON.stringify(JSON.parse(rightText), null, 2);
  } catch (e) {
    return { type: 'error', side: 'right', message: e instanceof Error ? e.message : String(e) };
  }

  const leftLines = leftFormatted.split('\n');
  const rightLines = rightFormatted.split('\n');
  const lines = lineDiff(leftLines, rightLines);

  let added = 0, removed = 0, changed = 0, same = 0;
  for (const l of lines) {
    if (l.type === 'added') added++;
    else if (l.type === 'removed') removed++;
    else if (l.type === 'changed') changed++;
    else same++;
  }

  return { type: 'success', lines, formattedLeft: leftFormatted, formattedRight: rightFormatted, summary: { added, removed, changed, same } };
}

function lineDiff(leftLines: string[], rightLines: string[]): DiffLine[] {
  const m = leftLines.length;
  const n = rightLines.length;

  // LCS table
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      lcs[i][j] =
        leftLines[i - 1] === rightLines[j - 1]
          ? lcs[i - 1][j - 1] + 1
          : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    }
  }

  // Backtrack
  type Op = { type: 'equal' | 'added' | 'removed'; li?: number; ri?: number };
  const ops: Op[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      ops.push({ type: 'equal', li: i - 1, ri: j - 1 });
      i--; j--;
    } else if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      ops.push({ type: 'added', ri: j - 1 });
      j--;
    } else {
      ops.push({ type: 'removed', li: i - 1 });
      i--;
    }
  }
  ops.reverse();

  // Convert ops → DiffLine[]
  // Only pair removed+added as 'changed' when they share the same JSON key.
  // Otherwise emit removed (left-only) then added (right-only) separately.
  const result: DiffLine[] = [];
  let ln = 1, rn = 1;
  let idx = 0;

  while (idx < ops.length) {
    const op = ops[idx];
    if (op.type === 'equal') {
      result.push({ type: 'equal', leftLine: leftLines[op.li!], rightLine: rightLines[op.ri!], leftNum: ln++, rightNum: rn++ });
      idx++;
    } else {
      // Gather the whole hunk
      const removedOps: Op[] = [];
      const addedOps: Op[] = [];
      while (idx < ops.length && ops[idx].type !== 'equal') {
        if (ops[idx].type === 'removed') removedOps.push(ops[idx]);
        else addedOps.push(ops[idx]);
        idx++;
      }

      // Match by JSON key: only pair lines with the same key as 'changed'
      const usedAdded = new Set<number>();
      const pairedRemoved = new Set<number>();

      for (let r = 0; r < removedOps.length; r++) {
        const lLine = leftLines[removedOps[r].li!];
        const lKey = extractJsonKey(lLine);
        if (lKey !== null) {
          for (let a = 0; a < addedOps.length; a++) {
            if (usedAdded.has(a)) continue;
            const rLine = rightLines[addedOps[a].ri!];
            if (extractJsonKey(rLine) === lKey) {
              result.push({ type: 'changed', leftLine: lLine, rightLine: rLine, leftNum: ln++, rightNum: rn++ });
              pairedRemoved.add(r);
              usedAdded.add(a);
              break;
            }
          }
        }
      }

      // Remaining removed → left-only rows
      for (let r = 0; r < removedOps.length; r++) {
        if (pairedRemoved.has(r)) continue;
        result.push({ type: 'removed', leftLine: leftLines[removedOps[r].li!], rightLine: '', leftNum: ln++, rightNum: null });
      }
      // Remaining added → right-only rows
      for (let a = 0; a < addedOps.length; a++) {
        if (usedAdded.has(a)) continue;
        result.push({ type: 'added', leftLine: '', rightLine: rightLines[addedOps[a].ri!], leftNum: null, rightNum: rn++ });
      }
    }
  }

  return result;
}

function extractJsonKey(line: string): string | null {
  const m = line.trim().match(/^"([^"]+)"\s*:/);
  return m ? m[1] : null;
}

// ─── Nonce generator ──────────────────────────────────────────────────────────

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

// ─── Webview HTML ─────────────────────────────────────────────────────────────

function getWebviewHtml(nonce: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JSON Diff</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100vh; display: flex; flex-direction: column; overflow: hidden;
  }

  /* ── Input section ── */
  #input-section { display: flex; flex-direction: column; flex: 1; padding: 16px; gap: 12px; overflow: auto; }
  .input-row { display: flex; gap: 12px; flex: 1; min-height: 0; }
  .input-col { display: flex; flex-direction: column; flex: 1; gap: 6px; }
  .input-col input {
    padding: 4px 8px; border-radius: 4px; border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    font-size: 0.85em;
  }
  .input-col textarea {
    flex: 1; padding: 8px; resize: none;
    font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555); border-radius: 4px;
  }
  .input-col textarea.error { border-color: #e05252; }
  .error-msg { color: #e05252; font-size: 0.82em; min-height: 16px; }
  .input-actions { display: flex; gap: 8px; }

  /* ── Result section ── */
  #result-section { display: none; flex-direction: column; flex: 1; overflow: hidden; }

  .toolbar {
    display: flex; align-items: center; gap: 4px; padding: 6px 12px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    flex-shrink: 0;
  }
  .toolbar-label { font-weight: 600; margin-right: 8px; font-size: 0.9em; opacity: 0.8; }
  .toolbar-sep { flex: 1; }

  .summary {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px; flex-shrink: 0;
    background: var(--vscode-editorWidget-background, #252526);
    border-bottom: 1px solid var(--vscode-editorGroup-border, #333);
    font-size: 0.82em;
  }
  .summary-label { opacity: 0.6; font-weight: 600; }

  /* ── Diff view ── */
  .diff-wrap { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .diff-headers { display: flex; flex-shrink: 0; border-bottom: 1px solid var(--vscode-editorGroup-border, #333); }
  .diff-header-col {
    flex: 1; padding: 5px 12px; font-size: 0.82em; font-weight: 600;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    display: flex; align-items: center; gap: 6px;
  }
  .diff-header-col + .diff-header-col { border-left: 1px solid var(--vscode-editorGroup-border, #333); }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.red { background: #e05252; }
  .dot.green { background: #3fb950; }

  .diff-body { flex: 1; overflow: auto; }
  .diff-table { width: 100%; border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size, 13px); table-layout: fixed; }
  .diff-table td { padding: 1px 0; vertical-align: top; white-space: pre; }

  .ln { width: 48px; min-width: 48px; text-align: right; padding: 1px 8px; opacity: 0.4; user-select: none; font-size: 0.88em; }
  .code { padding: 1px 12px; width: 100%; overflow: hidden; text-overflow: ellipsis; }

  /* equal */
  tr.equal .ln, tr.equal .code { background: transparent; }
  /* added */
  tr.added .ln-left, tr.added .code-left { background: rgba(63,185,80,0.06); }
  tr.added .ln-right, tr.added .code-right { background: rgba(63,185,80,0.18); }
  /* removed */
  tr.removed .ln-left, tr.removed .code-left { background: rgba(224,82,82,0.18); }
  tr.removed .ln-right, tr.removed .code-right { background: rgba(224,82,82,0.06); }
  /* changed */
  tr.changed .ln-left, tr.changed .code-left { background: rgba(210,153,34,0.18); }
  tr.changed .ln-right, tr.changed .code-right { background: rgba(210,153,34,0.18); }

  .mid-border { width: 1px; min-width: 1px; background: var(--vscode-editorGroup-border, #333); padding: 0; }

  tr.current-diff td { outline: 1px solid rgba(255,255,255,0.2); outline-offset: -1px; }

  /* ── Shared buttons ── */
  button {
    padding: 4px 12px; cursor: pointer; border: none; border-radius: 3px;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    font-size: 0.85em; white-space: nowrap;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }

  /* ── badges ── */
  .badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 10px; font-size: 0.82em; }
  .badge.added   { background: rgba(63,185,80,0.2);  color: #3fb950; }
  .badge.removed { background: rgba(224,82,82,0.2);  color: #e05252; }
  .badge.changed { background: rgba(210,153,34,0.2); color: #d29922; }
  .badge.same    { background: rgba(128,128,128,0.15); color: var(--vscode-foreground); opacity: 0.6; }
</style>
</head>
<body>

<!-- ── Input section ────────────────────────────────────── -->
<div id="input-section">
  <div class="input-row">
    <div class="input-col">
      <input type="text" id="left-name" placeholder="Left label (e.g. original)" value="original">
      <textarea id="left" placeholder="Paste original JSON here..."></textarea>
      <div id="left-error" class="error-msg"></div>
    </div>
    <div class="input-col">
      <input type="text" id="right-name" placeholder="Right label (e.g. modified)" value="modified">
      <textarea id="right" placeholder="Paste modified JSON here..."></textarea>
      <div id="right-error" class="error-msg"></div>
    </div>
  </div>
  <div class="input-actions">
    <button id="compareBtn">Compare</button>
  </div>
</div>

<!-- ── Result section ───────────────────────────────────── -->
<div id="result-section">
  <div class="toolbar">
    <span class="toolbar-label">JSON Diff</span>
    <button class="secondary" onclick="doSwap()">&#8597; Swap</button>
    <button class="secondary" onclick="goPrev()">&#8593; Prev</button>
    <button class="secondary" onclick="goNext()">&#8595; Next</button>
    <button class="secondary" onclick="doFormatBoth()">&#8801; Format Both</button>
    <button onclick="doApplyAll()">&#10003; Apply All</button>
    <span class="toolbar-sep"></span>
    <button class="secondary" onclick="goBack()">&#8592; Edit</button>
  </div>
  <div class="summary" id="summary"></div>
  <div class="diff-wrap">
    <div class="diff-headers">
      <div class="diff-header-col"><span class="dot red"></span> original &mdash; <span id="left-title">left</span></div>
      <div class="diff-header-col"><span class="dot green"></span> modified &mdash; <span id="right-title">right</span></div>
    </div>
    <div class="diff-body">
      <table class="diff-table" id="diff-table"><tbody id="diff-tbody"></tbody></table>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let diffRows = [];       // all tr elements
  let diffIndices = [];    // indices of non-equal rows
  let currentDiffIdx = -1;
  let lastFormattedLeft = '';
  let lastFormattedRight = '';

  document.getElementById('compareBtn').addEventListener('click', sendCompare);

  function sendCompare() {
    const left  = document.getElementById('left').value;
    const right = document.getElementById('right').value;
    const leftName  = document.getElementById('left-name').value;
    const rightName = document.getElementById('right-name').value;
    clearErrors();
    vscode.postMessage({ command: 'compare', left, right, leftName, rightName });
  }

  function clearErrors() {
    document.getElementById('left').classList.remove('error');
    document.getElementById('right').classList.remove('error');
    document.getElementById('left-error').textContent = '';
    document.getElementById('right-error').textContent = '';
  }

  function goBack() {
    document.getElementById('result-section').style.display = 'none';
    document.getElementById('input-section').style.display = 'flex';
  }

  function doSwap() {
    const lv = document.getElementById('left').value;
    const rv = document.getElementById('right').value;
    const ln = document.getElementById('left-name').value;
    const rn = document.getElementById('right-name').value;
    document.getElementById('left').value  = rv;
    document.getElementById('right').value = lv;
    document.getElementById('left-name').value  = rn;
    document.getElementById('right-name').value = ln;
    goBack();
    sendCompare();
  }

  function doFormatBoth() {
    try { document.getElementById('left').value  = JSON.stringify(JSON.parse(document.getElementById('left').value), null, 2); } catch(e) {}
    try { document.getElementById('right').value = JSON.stringify(JSON.parse(document.getElementById('right').value), null, 2); } catch(e) {}
    sendCompare();
  }

  function doApplyAll() {
    vscode.postMessage({ command: 'applyToEditor', right: lastFormattedRight });
  }

  function goPrev() {
    if (diffIndices.length === 0) return;
    currentDiffIdx = (currentDiffIdx - 1 + diffIndices.length) % diffIndices.length;
    scrollToDiff(diffIndices[currentDiffIdx]);
  }

  function goNext() {
    if (diffIndices.length === 0) return;
    currentDiffIdx = (currentDiffIdx + 1) % diffIndices.length;
    scrollToDiff(diffIndices[currentDiffIdx]);
  }

  function scrollToDiff(rowIdx) {
    diffRows.forEach(r => r.classList.remove('current-diff'));
    const row = diffRows[rowIdx];
    if (row) {
      row.classList.add('current-diff');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  window.addEventListener('message', event => {
    const data = event.data;

    // Safely populate initial JSON via postMessage
    if (data.command === 'init') {
      document.getElementById('left').value = data.json || '';
      return;
    }

    if (data.command !== 'diffResult') return;

    if (data.type === 'error') {
      clearErrors();
      if (data.side === 'left') {
        document.getElementById('left').classList.add('error');
        document.getElementById('left-error').textContent = 'Invalid JSON: ' + data.message;
      } else {
        document.getElementById('right').classList.add('error');
        document.getElementById('right-error').textContent = 'Invalid JSON: ' + data.message;
      }
      return;
    }

    lastFormattedLeft  = data.formattedLeft;
    lastFormattedRight = data.formattedRight;

    // Update left/right textarea with formatted versions
    document.getElementById('left').value  = data.formattedLeft;
    document.getElementById('right').value = data.formattedRight;

    // Titles
    document.getElementById('left-title').textContent  = data.leftName  || 'original';
    document.getElementById('right-title').textContent = data.rightName || 'modified';

    // Summary
    const s = data.summary;
    document.getElementById('summary').innerHTML =
      '<span class="summary-label">diff result</span>' +
      badge('+' + s.added   + ' added',   'added')   +
      badge('-' + s.removed + ' removed', 'removed') +
      badge('~' + s.changed + ' changed', 'changed') +
      badge('=' + s.same    + ' same',    'same');

    // Build diff table
    const tbody = document.getElementById('diff-tbody');
    tbody.innerHTML = '';
    diffRows = [];
    diffIndices = [];
    currentDiffIdx = -1;

    data.lines.forEach((line, idx) => {
      const tr = document.createElement('tr');
      tr.className = line.type;

      const leftNumTd  = td('ln ln-left',   line.leftNum  !== null ? String(line.leftNum)  : '');
      const leftCode   = td('code code-left', esc(line.leftLine));
      const sep        = document.createElement('td');
      sep.className = 'mid-border';
      const rightNumTd = td('ln ln-right',  line.rightNum !== null ? String(line.rightNum) : '');
      const rightCode  = td('code code-right', esc(line.rightLine));

      tr.append(leftNumTd, leftCode, sep, rightNumTd, rightCode);
      tbody.appendChild(tr);
      diffRows.push(tr);

      if (line.type !== 'equal') diffIndices.push(idx);
    });

    // Show result section
    document.getElementById('input-section').style.display  = 'none';
    document.getElementById('result-section').style.display = 'flex';

    // Jump to first diff
    if (diffIndices.length > 0) {
      currentDiffIdx = 0;
      setTimeout(() => scrollToDiff(diffIndices[0]), 50);
    }
  });

  function badge(text, cls) {
    return '<span class="badge ' + cls + '">' + text + '</span>';
  }

  function td(cls, html) {
    const el = document.createElement('td');
    el.className = cls;
    el.innerHTML = html;
    return el;
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
</script>
</body>
</html>`;
}
