import './helpers/installStub';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  vscode, state, openDocument, activate, typeText, moveCursor, closeDocument, save, setConfig,
  diagnosticsFor, lastPanel, sleep, reset, Position, TextDocument,
} from './helpers/vscodeStub';
import * as extension from '../src/extension';

const pkg = require('../../package.json') as { version: string; contributes: { commands: Array<{ command: string }> } };
const run = (id: string, ...args: unknown[]): Promise<unknown> => vscode.commands.executeCommand(id, ...args);
const SAMPLE = '{"users":[{"id":1,"name":"Ann"},{"id":2,"name":"Bob"}],"meta":{"count":2,"token":"SGVsbG8gZnJvbSBKU09OIFBybw=="}}';

const context = {
  subscriptions: [] as Array<{ dispose(): unknown }>,
  extension: { packageJSON: pkg },
  extensionUri: vscode.Uri.file('/ext'),
  globalState: { store: {} as Record<string, unknown>, get(k: string) { return this.store[k]; }, async update(k: string, v: unknown) { this.store[k] = v; } },
};

before(() => { extension.activate(context as never); });
after(() => { extension.deactivate(); for (const d of context.subscriptions) d.dispose(); });
beforeEach(() => reset());

// ── Activation ────────────────────────────────────────────────────────────────

test('activation registers every contributed command and shows the welcome page once', () => {
  for (const c of pkg.contributes.commands) assert.ok(state.commands.has(c.command), `missing ${c.command}`);
  assert.ok(state.commands.has('jsonPro.revealNode'));
  assert.equal(state.panels.length, 0, 'panels are reset per test');
  assert.equal(context.globalState.get('jsonPro.welcomeShownVersion'), pkg.version);
});

test('context key tracks whether the active editor is JSON', () => {
  openDocument('{}', 'json');
  assert.equal(state.contextKeys['jsonPro.isJsonEditor'], true);
  openDocument('x', 'plaintext');
  assert.equal(state.contextKeys['jsonPro.isJsonEditor'], false);
  activate(undefined);
  assert.equal(state.contextKeys['jsonPro.isJsonEditor'], false);
});

// ── Whole-document rewrites ───────────────────────────────────────────────────

test('format honours indent settings, preserves comments and reports parse errors', async () => {
  const doc = openDocument('{"a":[1,2],"b":74.0}');
  await run('jsonPro.format');
  assert.equal(doc.getText(), '{\n  "a": [\n    1,\n    2\n  ],\n  "b": 74.0\n}');

  setConfig('jsonPro.indentSize', 4);
  await run('jsonPro.format');
  assert.equal(doc.getText(), '{\n    "a": [\n        1,\n        2\n    ],\n    "b": 74.0\n}');

  setConfig('jsonPro.useTabs', true);
  await run('jsonPro.format');
  assert.ok(doc.getText().includes('\n\t"a"'));

  const jsonc = openDocument('{"a":1, // keep me\n"b":2}', 'jsonc');
  await run('jsonPro.format');
  assert.ok(jsonc.getText().includes('// keep me'));

  const bad = openDocument('{"a": }');
  const editor = vscode.window.activeTextEditor!;
  await run('jsonPro.format');
  assert.equal(bad.getText(), '{"a": }');
  assert.match(state.errorMessages.at(-1)!, /Value expected.*line 1/);
  assert.equal(editor.document.offsetAt(editor.selection.active), 6, 'cursor moved to the error');
});

test('minify and sort keys', async () => {
  const doc = openDocument('{\n  "b": 1,\n  "a": [1, 2.50, ],  // c\n}', 'jsonc');
  await run('jsonPro.minify');
  assert.equal(doc.getText(), '{"b":1,"a":[1,2.50]}');
  await run('jsonPro.sortKeys');
  assert.equal(doc.getText(), '{\n  "a": [\n    1,\n    2.5\n  ],\n  "b": 1\n}');
  await run('jsonPro.sortKeys');
  assert.match(state.statusMessages.at(-1)!, /Already up to date/);
});

test('commands without an editor are a no-op with a hint', async () => {
  activate(undefined);
  await run('jsonPro.format');
  await run('jsonPro.fix');
  assert.match(state.infoMessages.at(-1)!, /Open a JSON file first/);
});

// ── Auto-Fix ──────────────────────────────────────────────────────────────────

test('auto-fix previews in a diff editor and applies on confirmation', async () => {
  const doc = openDocument("{a: 1, 'b': [1,2,], url: 'http://x.y'}");
  state.answers.info.push((_msg: string, items: string[]) => {
    assert.deepEqual(items, ['Apply', 'Discard']);
    const diff = state.executed.find(e => e.id === 'vscode.diff')!;
    assert.ok(diff, 'diff preview opened before asking');
    const provider = state.contentProviders.get('jsonpro-fix')!;
    assert.equal(provider.provideTextDocumentContent(diff.args[0]), "{a: 1, 'b': [1,2,], url: 'http://x.y'}");
    assert.deepEqual(JSON.parse(provider.provideTextDocumentContent(diff.args[1])), { a: 1, b: [1, 2], url: 'http://x.y' });
    return 'Apply';
  });
  await run('jsonPro.fix');
  assert.deepEqual(JSON.parse(doc.getText()), { a: 1, b: [1, 2], url: 'http://x.y' });
  assert.equal(state.contentProviders.get('jsonpro-fix')!.provideTextDocumentContent(state.executed.find(e => e.id === 'vscode.diff')!.args[0]), '', 'preview contents released');

  const doc2 = openDocument('{a: 1}');
  state.answers.info.push('Discard');
  await run('jsonPro.fix');
  assert.equal(doc2.getText(), '{a: 1}');

  openDocument('{"ok": true}');
  await run('jsonPro.fix');
  assert.match(state.statusMessages.at(-1)!, /already valid/);

  openDocument('{"a": "unclosed');
  await run('jsonPro.fix');
  // Fixer closes the string and the brace → valid; must have asked
  assert.equal(state.infoMessages.filter(m => /Apply auto-fix/.test(m)).length, 3);
});

test('auto-fix on save applies through waitUntil only when enabled and needed', async () => {
  const doc = openDocument('{"a": 1,}');
  assert.deepEqual(await save(doc), [], 'disabled by default');

  setConfig('jsonPro.autoFixOnSave', true);
  const edits = await save(doc);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].newText, '{"a": 1}');

  const valid = openDocument('{"a": 1}');
  assert.deepEqual(await save(valid), []);

  const jsonc = openDocument('{"a": 1, // c\n}', 'jsonc');
  assert.deepEqual(await save(jsonc), [], 'valid JSONC is left alone');

  const other = openDocument('{a:1}', 'plaintext');
  assert.deepEqual(await save(other), []);

  const typing = openDocument('{"a": "hel');
  assert.deepEqual(await save(typing, vscode.TextDocumentSaveReason.AfterDelay), [], 'auto-save never rewrites the buffer');
  assert.deepEqual(await save(typing, vscode.TextDocumentSaveReason.FocusOut), []);
  assert.equal((await save(typing)).length, 1);

  setConfig('jsonPro.largeFileThresholdKB', 1);
  const big = openDocument('{"a": [' + '1,'.repeat(600) + '1],}');
  assert.deepEqual(await save(big), [], 'large files are not fixed on save');
});

test('auto-fix refuses to apply a preview that is stale', async () => {
  const doc = openDocument('{a: 1}');
  state.answers.info.push(() => { typeText(doc, '{a: 1, b: 2}'); return 'Apply'; });
  await run('jsonPro.fix');
  assert.equal(doc.getText(), '{a: 1, b: 2}');
  assert.match(state.warningMessages.at(-1)!, /changed while the preview was open/);
});

// ── Diagnostics ───────────────────────────────────────────────────────────────

test('validator is language aware, debounced per document and respects the toggle', async () => {
  const json = openDocument('{"a": 1,}');
  const jsonc = openDocument('{"a": 1, // c\n}', 'jsonc');
  await sleep(0);
  assert.match(diagnosticsFor('jsonPro', json)[0].message, /Trailing comma/);
  assert.equal(diagnosticsFor('jsonPro', json)[0].range.start.character, 7);
  assert.equal(diagnosticsFor('jsonPro', json)[0].source, 'JSON Pro');
  assert.equal(diagnosticsFor('jsonPro', jsonc).length, 0);

  typeText(json, '{"a": 1 "b": 2}');
  typeText(jsonc, '{"a": }');
  await sleep(400);
  assert.match(diagnosticsFor('jsonPro', json)[0].message, /Missing comma/);
  assert.match(diagnosticsFor('jsonPro', jsonc)[0].message, /Value expected/);

  typeText(json, '{"a": 1}');
  await sleep(400);
  assert.equal(diagnosticsFor('jsonPro', json).length, 0);

  setConfig('jsonPro.enableDiagnostics', false);
  typeText(jsonc, '{');
  await sleep(400);
  assert.equal(diagnosticsFor('jsonPro', jsonc).length, 0);

  setConfig('jsonPro.enableDiagnostics', true);
  await sleep(0);
  assert.equal(diagnosticsFor('jsonPro', jsonc).length, 1);

  closeDocument(jsonc);
  assert.equal(diagnosticsFor('jsonPro', jsonc).length, 0);
});

test('duplicate keys are flagged at every occurrence', async () => {
  const doc = openDocument('{"a": 1, "b": {"x": 1, "x": 2, "x": 3}, "a": 2}');
  await sleep(0);
  const diags = diagnosticsFor('jsonPro.duplicates', doc);
  assert.equal(diags.length, 5);
  assert.ok(diags.every(d => d.severity === vscode.DiagnosticSeverity.Warning));
  assert.match(diags.find(d => d.message.includes('"x"'))!.message, /1 of 3/);
});

test('large files skip live features but commands still work', async () => {
  setConfig('jsonPro.largeFileThresholdKB', 1);
  const big = '{"a": [' + '1,'.repeat(600) + '1],}'; // > 1 KB, has a trailing comma
  const doc = openDocument(big);
  await sleep(0);
  assert.equal(diagnosticsFor('jsonPro', doc).length, 0);
  assert.match(state.treeViews[0].message ?? '', /too large/);
  assert.equal(state.statusBarItems.find(i => i.id === 'jsonPro.breadcrumb')!.visible, false);
  await run('jsonPro.minify');
  assert.equal(doc.getText(), '{"a":[' + '1,'.repeat(600) + '1]}');

  setConfig('jsonPro.largeFileThresholdKB', 0);
  typeText(doc, '{"a": 1,}');
  await sleep(400);
  assert.equal(diagnosticsFor('jsonPro', doc).length, 1);
});

// ── Tree, breadcrumb, paths, hover ───────────────────────────────────────────

test('tree view is lazy, reveals without focus and reports syntax errors', async () => {
  const doc = openDocument(SAMPLE);
  const view = state.treeViews[0];
  await sleep(0); // reveal waits for the context key to be set
  const reveal = view.reveals.at(-1)!;
  assert.equal(reveal.options.focus, false);
  assert.equal(reveal.element.label, 'users');
  assert.equal(reveal.element.description, '[2]');
  assert.equal(reveal.element.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
  const first = reveal.element.children[0];
  assert.equal(first.label, '0');
  assert.equal(first.parent, reveal.element);
  assert.deepEqual(first.children.map((c: { label: string; description: string }) => `${c.label}=${c.description}`), ['id=1', 'name="Ann"']);
  assert.equal(view.message, undefined);

  const node = first.children[1].command.arguments[1];
  const editor = vscode.window.activeTextEditor!;
  await run('jsonPro.revealNode', doc, node);
  assert.equal(editor.document.offsetAt(editor.selection.active), node.offset);
  assert.equal(node.offset, SAMPLE.indexOf('"Ann"'));

  typeText(doc, '{"a": ');
  await sleep(600);
  assert.match(view.message ?? '', /syntax errors/);
});

test('breadcrumb and copy path follow the cursor', async () => {
  const doc = openDocument(SAMPLE);
  const editor = vscode.window.activeTextEditor!;
  const item = state.statusBarItems.find(i => i.id === 'jsonPro.breadcrumb')!;
  moveCursor(editor, doc.getText().indexOf('"Bob"') + 2);
  assert.equal(item.text, '$(json) users[1].name');
  assert.equal(item.visible, true);

  await run('jsonPro.copyPath');
  assert.equal(state.clipboard, 'users[1].name');
  await run('jsonPro.copyJsonPath');
  assert.equal(state.clipboard, '$.users[1].name');

  moveCursor(editor, 0);
  assert.equal(item.text, '$(json) $');
  openDocument('x', 'plaintext');
  assert.equal(item.visible, false);
});

test('hover decodes base64, timestamps and ISO dates without trusting markdown', () => {
  const doc = openDocument('{"token":"SGVsbG8gZnJvbSBKU09OIFBybw==","ts":1711929600,"iso":"2024-04-01T08:00:00Z","plain":"hello"}');
  const provider = state.hoverProviders[0];
  const hoverAt = (needle: string): { contents: { value: string; isTrusted: boolean } } | null =>
    provider.provideHover(doc, doc.positionAt(doc.getText().indexOf(needle) + 1));

  assert.match(hoverAt('SGVsbG8')!.contents.value, /Base64 decoded[\s\S]*Hello from JSON Pro/);
  assert.equal(hoverAt('SGVsbG8')!.contents.isTrusted, false);
  assert.match(hoverAt('1711929600')!.contents.value, /Unix timestamp \(seconds\)[\s\S]*2024-04-01T00:00:00\.000Z/);
  assert.match(hoverAt('2024-04-01')!.contents.value, /ISO 8601[\s\S]*Unix: 1711958400/);
  assert.equal(hoverAt('hello'), null);
});

// ── Transforms, search, rename ───────────────────────────────────────────────

test('flatten / unflatten / removeEmpty commands', async () => {
  const doc = openDocument('{"a":{"b":1,"c":[1,{"d":null}],"e":{}},"f":""}');
  await run('jsonPro.flatten');
  assert.deepEqual(JSON.parse(doc.getText()), { 'a.b': 1, 'a.c[0]': 1, 'a.c[1].d': null, 'a.e': {}, f: '' });
  await run('jsonPro.unflatten');
  assert.deepEqual(JSON.parse(doc.getText()), { a: { b: 1, c: [1, { d: null }], e: {} }, f: '' });
  await run('jsonPro.removeEmpty');
  assert.deepEqual(JSON.parse(doc.getText()), { a: { b: 1, c: [1] } });
});

test('rename key offers the key at cursor first and reports the count', async () => {
  const doc = openDocument(SAMPLE);
  moveCursor(vscode.window.activeTextEditor!, doc.getText().indexOf('"name"') + 2);
  state.answers.quickPick.push((items: Array<{ label: string; description?: string }>) => {
    assert.equal(items[0].label, 'name');
    assert.equal(items[0].description, 'key at cursor');
    return items[0];
  });
  state.answers.inputBox.push('fullName');
  await run('jsonPro.renameKey');
  assert.deepEqual(JSON.parse(doc.getText()).users.map((u: { fullName: string }) => u.fullName), ['Ann', 'Bob']);
  assert.match(state.statusMessages.at(-1)!, /2 occurrences/);
});

test('search jumps to the exact occurrence that was picked', async () => {
  const doc = openDocument(SAMPLE);
  const editor = vscode.window.activeTextEditor!;
  state.answers.quickPick.push('users[1].name');
  await run('jsonPro.search');
  const expected = doc.getText().indexOf('"name":"Bob"');
  assert.equal(editor.document.offsetAt(editor.selection.active), expected);
  assert.equal(editor.revealed.length, 1);
});

// ── Conversions ───────────────────────────────────────────────────────────────

test('TypeScript, YAML, escape and unescape open results beside the editor', async () => {
  openDocument('{"users":[{"id":1,"zip":"x"},{"id":2}]}');
  await run('jsonPro.toTypeScript');
  assert.equal(state.openedUntitled.at(-1)!.language, 'typescript');
  assert.match(state.openedUntitled.at(-1)!.content, /users: User\[\];[\s\S]*zip\?: string;/);

  await run('jsonPro.toYAML');
  assert.equal(state.openedUntitled.at(-1)!.language, 'yaml');
  assert.equal(state.openedUntitled.at(-1)!.content, 'users:\n  - id: 1\n    zip: x\n  - id: 2\n');

  openDocument('a "b"');
  await run('jsonPro.escapeJson');
  assert.equal(state.openedUntitled.at(-1)!.content, '"a \\"b\\""');
  openDocument('"a \\"b\\""');
  await run('jsonPro.unescapeJson');
  assert.equal(state.openedUntitled.at(-1)!.content, 'a "b"');
  assert.equal(state.shownDocuments.length, 4);
});

// ── Panels ────────────────────────────────────────────────────────────────────

test('stats panel renders without scripts', async () => {
  openDocument(SAMPLE);
  await run('jsonPro.stats');
  const panel = lastPanel();
  assert.equal(panel.viewType, 'jsonProStats');
  assert.match(panel.html, /Total Keys[\s\S]*\$\.users/);
  assert.ok(!panel.html.includes('<script'));
  assert.ok(!panel.html.includes('onclick='));

  openDocument('{bad');
  await run('jsonPro.stats');
  assert.match(state.errorMessages.at(-1)!, /JSON Pro:/);
});

test('JSONPath panel answers queries, copies, and follows document edits', async () => {
  const doc = openDocument(SAMPLE);
  await run('jsonPro.jsonPath');
  const panel = lastPanel();
  assert.ok(!panel.html.includes('onclick='), 'no inline handlers (blocked by CSP)');
  assert.match(panel.html, /nonce="[A-Za-z0-9]{32}"/);

  await panel.receive({ command: 'query', path: '$.users[*].name' });
  let result = panel.posted.at(-1)!;
  assert.equal(result.command, 'queryResult');
  assert.deepEqual(result.results.map((r: { text: string }) => r.text), ['"Ann"', '"Bob"']);
  assert.equal(result.results[0].path, '$.users[0].name');

  await panel.receive({ command: 'query', path: 'users' });
  assert.equal(panel.posted.at(-1)!.type, 'error');

  await panel.receive({ command: 'query', path: '$.users[1]' });
  await panel.receive({ command: 'copy', index: 0, what: 'value' });
  assert.deepEqual(JSON.parse(state.clipboard), { id: 2, name: 'Bob' });
  await panel.receive({ command: 'copy', index: 0, what: 'path' });
  assert.equal(state.clipboard, '$.users[1]');
  await panel.receive({ command: 'copy', index: 7, what: 'path' });
  assert.equal(state.clipboard, '$.users[1]', 'out-of-range index ignored');

  const huge = { big: 'x'.repeat(10_000) };
  typeText(doc, JSON.stringify(huge));
  await panel.receive({ command: 'query', path: '$' });
  const big = panel.posted.at(-1)!.results[0];
  assert.equal(big.truncated, true);
  assert.ok(big.text.length < 4200, 'payload is capped');
  await panel.receive({ command: 'copy', index: 0, what: 'value' });
  assert.deepEqual(JSON.parse(state.clipboard), huge, 'copy still yields the full value');

  await panel.receive({ command: 'query', path: '$.meta.count' });
  typeText(doc, '{"meta":{"count":99}}');
  await sleep(400);
  result = panel.posted.at(-1)!;
  assert.deepEqual(result.results.map((r: { text: string }) => r.text), ['99']);

  panel.dispose();
  typeText(doc, '{"meta":{"count":1}}');
  await sleep(400);
  assert.equal(panel.posted.at(-1), result, 'no updates after dispose');
});

test('diff panel compares, loads files and applies to the source document', async () => {
  const doc = openDocument('{"a":1,"b":2}');
  await run('jsonPro.diff');
  const panel = lastPanel();
  assert.ok(!panel.html.includes('onclick='));
  assert.equal(panel.posted[0].command, 'init');
  assert.equal(panel.posted[0].json, '{"a":1,"b":2}');

  await panel.receive({ command: 'compare', left: '{"a":1,"b":2}', right: '{"a":1,"b":3,"c":4}', leftName: 'L', rightName: 'R' });
  const result = panel.posted.at(-1)!;
  assert.equal(result.type, 'success');
  assert.equal(result.summary.added, 1);
  assert.ok(result.summary.changed >= 1);
  assert.equal(result.leftName, 'L');
  assert.match(panel.html, /id="collapseToggle"/);
  assert.match(panel.html, /<colgroup>/);
  assert.match(panel.html, /id="hunk-pos"/);

  await panel.receive({ command: 'compare', left: '{', right: '{}' });
  assert.equal(panel.posted.at(-1)!.side, 'left');
  await panel.receive({ command: 'compare', left: '{"a":1, // c\n}', right: '{"a":1,}' });
  assert.equal(panel.posted.at(-1)!.summary.same, 3, 'JSONC accepted');

  const other = openDocument('{"loaded":true}', 'json', { activate: false });
  state.answers.openDialog.push([other.uri]);
  await panel.receive({ command: 'pickFile', side: 'right' });
  assert.deepEqual(panel.posted.at(-1), { command: 'setSide', side: 'right', json: '{"loaded":true}' });

  activate(undefined); // webview has focus: no active text editor
  await panel.receive({ command: 'applyToEditor', right: result.formattedRight });
  assert.deepEqual(JSON.parse(doc.getText()), { a: 1, b: 3, c: 4 });
});

test('merge panel merges with the chosen array strategy and applies to the source document', async () => {
  const doc = openDocument('{"a":[1],"b":{"x":1}}');
  await run('jsonPro.merge');
  const panel = lastPanel();
  assert.ok(!panel.html.includes('onclick='));

  await panel.receive({ command: 'merge', left: '{"a":[1],"b":{"x":1}}', right: '{"a":[2],"b":{"y":2}}', arrays: 'concat' });
  assert.deepEqual(JSON.parse(panel.posted.at(-1)!.merged), { a: [1, 2], b: { x: 1, y: 2 } });
  await panel.receive({ command: 'merge', left: '{"a":[1]}', right: '{"a":[2]}', arrays: 'replace' });
  assert.deepEqual(JSON.parse(panel.posted.at(-1)!.merged), { a: [2] });

  activate(undefined);
  await panel.receive({ command: 'applyToEditor', merged: '{"done":true}' });
  assert.equal(doc.getText(), '{"done":true}');
  assert.equal(panel.disposed, true);

  const ts = openDocument('const x = 1;', 'typescript');
  await run('jsonPro.merge');
  const unbound = lastPanel();
  assert.equal(unbound.posted[0].json, '', 'non-JSON editor is not loaded into the panel');
  await unbound.receive({ command: 'applyToEditor', merged: '{}' });
  assert.equal(ts.getText(), 'const x = 1;', 'non-JSON editor is never overwritten');
  assert.equal(state.openedUntitled.at(-1)!.content, '{}');
});

test('welcome panel only runs JSON Pro commands and opens the bundled changelog', async () => {
  const doc = openDocument('{"b":1,"a":2}');
  await run('jsonPro.welcome');
  const panel = lastPanel();
  assert.ok(!panel.html.includes('onclick='));
  assert.ok(panel.html.includes(`v${pkg.version}`));

  await panel.receive({ command: 'runCommand', id: 'jsonPro.sortKeys' });
  assert.equal(doc.getText(), '{\n  "a": 2,\n  "b": 1\n}');

  const before = state.executed.length;
  await panel.receive({ command: 'runCommand', id: 'workbench.action.terminal.new' });
  assert.equal(state.executed.length, before, 'foreign commands are ignored');

  await panel.receive({ command: 'openChangelog' });
  const preview = state.executed.find(e => e.id === 'markdown.showPreview')!;
  assert.equal(preview.args[0].toString(), 'file:/ext/CHANGELOG.md');

  await panel.receive({ command: 'openSample', json: '{"s":1}' });
  assert.equal(state.openedUntitled.at(-1)!.content, '{"s":1}');
});

test('every panel uses a strict CSP and no inline event handlers', async () => {
  openDocument(SAMPLE);
  for (const id of ['jsonPro.stats', 'jsonPro.jsonPath', 'jsonPro.diff', 'jsonPro.merge', 'jsonPro.welcome']) await run(id);
  for (const panel of state.panels) {
    assert.match(panel.html, /Content-Security-Policy" content="default-src 'none';/, panel.viewType);
    assert.doesNotMatch(panel.html, /\son[a-z]+="/i, `${panel.viewType} has inline handlers`);
    assert.doesNotMatch(panel.html, /unsafe-eval/, panel.viewType);
  }
});

test('document edits and positions round-trip in the stub itself', () => {
  const doc = new TextDocument(vscode.Uri.file('/t.json'), 'json', 'ab\ncd\n');
  assert.deepEqual(doc.positionAt(4), new Position(1, 1));
  assert.equal(doc.offsetAt(new Position(1, 1)), 4);
  assert.equal(doc.lineCount, 3);
});
