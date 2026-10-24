# Changelog

All notable changes to the **JSON Pro** extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [2.0.0] — 2026-10-11

### Added
- **JSONC support everywhere.** Commands, context menu, keyboard shortcuts and the tree view now work in `.jsonc` files and in files VS Code treats as JSONC (`settings.json`, `tsconfig.json`, …).
- **Comment-preserving Format.** Formatting keeps comments, key order and number spelling (`74.0` stays `74.0`).
- **Lossless Minify.** Minify drops whitespace, comments and trailing commas but never rewrites values.
- **Live JSONPath panel.** Results refresh automatically as you edit the source file; added `copy path`, regex filters (`=~ /.../`), existence filters (`[?(@.key)]`), quoted-key unions and recursive bracket selectors (`$..[0]`).
- **Copy JSONPath** command (`$.users[0].name`) alongside Copy Path.
- **Diff view redesign.** Added/removed rows use your theme's own diff-editor colours, the empty side of a one-sided row is hatched, every row has a `+` / `−` / `~` gutter sign, JSON tokens are syntax-coloured, and the characters that actually changed within a line are highlighted. Long runs of unchanged lines collapse to a "⋯ N unchanged lines" row (toggle with **Hide unchanged** or `h`), Prev/Next step through hunks with a `1 / 5` counter, and `n` / `p` (or `F7` / `Shift+F7`) navigate from the keyboard. Long lines wrap instead of being cut off.
- **Load file…** buttons in the Diff and Merge panels, Ctrl/Cmd+Enter to compare/merge, and an array strategy selector (concatenate / replace) for Merge.
- **Rename Key** now offers a picker of all keys in the document and reports how many occurrences were renamed.
- **Search** is now a single fuzzy QuickPick over every key and value.
- **Stats** panel shows minified size and the potential saving.
- **TypeScript generator** merges objects that share a name: properties missing in some occurrences become optional and conflicting types become unions. Array element interfaces are singularised (`users` → `User`).
- Setting `jsonPro.enableDiagnostics` to turn JSON Pro's own diagnostics off if you prefer VS Code's built-in validation.
- Hover on ISO dates and timestamps also shows the Unix / ISO counterpart; long strings show their length.
- Setting `jsonPro.largeFileThresholdKB` (default 4096). Live features — diagnostics, duplicate-key warnings, the tree view and the breadcrumb — are skipped above the threshold so multi-megabyte files never make the editor stutter. Explicit commands still work on any size.
- The tree view builds nodes lazily as you expand them instead of materialising the whole document up front.
- Unit tests for the core logic plus an end-to-end test suite that drives every command and provider against a simulated VS Code API (`npm test`), and GitHub Actions CI / release workflows.

### Fixed
- **Buttons in the Diff, Merge, Welcome and JSONPath panels did nothing** because inline `onclick` handlers were blocked by the webview Content Security Policy.
- **"Apply to Editor" in Diff/Merge failed with "No active editor"** when the panel had focus. Results are now applied to the document the panel was opened from.
- **Validator flagged valid JSONC files** (for example `settings.json` with comments) as errors.
- **Auto-Fix corrupted string contents**: URLs such as `"http://…"` lost everything after `//`, and apostrophes inside double-quoted strings (`"it's"`) broke the document. The fixer is now a proper scanner that never touches string contents.
- Auto-Fix also repairs missing commas/colons, duplicate commas, Python literals (`True`/`None`), `+1`/`.5` numbers, raw tabs in strings, stray closing brackets and a leading BOM.
- **Auto-fix on save** now applies through the save event itself (`waitUntil`), so the saved file is the fixed one and the document is not left dirty. It no longer opens a preview dialog on every save.
- **Search jumped to the wrong occurrence** when the same key existed at several paths.
- Diff line numbers now reflect real source lines; very large diffs no longer risk exhausting memory.
- Flatten/Unflatten round-trip empty objects and arrays; Unflatten produces a root array when every path starts with an index; quoted segments (`a["b.c"]`) are understood.
- Remove Nulls & Empty also strips empty values inside arrays.
- YAML output uses `|-` for strings without a trailing newline and quotes `~`, `%`-prefixed and hex-like strings.
- Copy Path / breadcrumb bracket-quote keys that are not identifiers (`data["first name"]`).
- Duplicate-key warnings are emitted for every occurrence, including a third or fourth one.
- Diagnostics are debounced per document, so editing two files quickly no longer drops validation for one of them.
- The tree view no longer steals keyboard focus from the editor when a JSON file becomes active; it shows a message instead of going blank when the document has syntax errors.
- The welcome page opens without stealing focus on first install, links to the extension's own changelog and shows the real version.
- Auto-fix on save only runs on explicit saves. With `files.autoSave` it no longer rewrites the buffer mid-typing, and it skips files above the large-file threshold.
- A `"__proto__"` key was silently deleted by Sort Keys, Flatten, Unflatten, Remove Nulls, Rename Key, Search, Stats and the converters; `constructor`/`prototype` keys were dropped by Merge and rejected by Unflatten. All three now round-trip as ordinary data.
- Diff pairing of removed/added lines was quadratic and could stall the extension host for seconds on large objects; it is now linear.
- Diff and Merge accept JSONC input (comments, trailing commas) instead of rejecting the pre-filled left side.
- Merge no longer binds "Apply" to a non-JSON editor, so running it from the palette with a TypeScript file active cannot overwrite that file.
- Auto-Fix refuses to apply a preview if the document changed while the preview was open.
- JSONPath results are capped per value in the webview; copy still yields the full value.
- YAML export quotes the `<<` merge key.
- Three separate "JSON Pro" output channels were created; there is now one.
- Webview message listeners are disposed with their panel instead of accumulating until deactivation.
- Command failures show an error notification (with a "Run Auto-Fix" shortcut for syntax errors) instead of a status-bar message that was easy to miss.

### Changed
- **Why 2.0:** Format output is no longer normalised through `JSON.stringify` (numbers such as `74.0` and comments are kept as written), commands and shortcuts now apply to JSONC files, and the Diff/Merge panels apply results to the file they were opened from rather than whichever editor is active. Review any scripts or habits that relied on the old behaviour.
- Commands are listed under the **JSON Pro** category in the Command Palette.
- Development tooling upgraded (`@vscode/vsce` 4, `esbuild` 0.28); packaging now needs Node 22. No vulnerable dependencies remain (`npm audit`). The shipped bundle has a single runtime dependency, `jsonc-parser`.
- `repository`, `bugs`, `homepage` and `license` are declared in the manifest; packaging runs the build automatically (`vscode:prepublish`).
- The extension declares support for untrusted and virtual workspaces.

## [1.0.0] — 2026-09-15

### Added
- Initial release: Format, Minify, Sort Keys, Auto-Fix with preview, Diff Checker, JSONPath Query, Merge, Stats dashboard, Flatten/Unflatten, Remove Nulls & Empty, Rename Key, TypeScript interface generation, YAML conversion, Escape/Unescape, Search, Copy Path, sidebar tree view, inline diagnostics, duplicate-key detection, hover decoding for Base64 / timestamps / ISO dates, breadcrumb status bar and a welcome page.

[2.0.0]: https://github.com/akshaykbkale/json-pro/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/akshaykbkale/json-pro/releases/tag/v1.0.0
