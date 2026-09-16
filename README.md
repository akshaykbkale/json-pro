# JSON Pro

**The complete JSON toolbox for VS Code.** Format, fix, diff, query, transform, and analyze JSON — all from the right-click menu or keyboard shortcuts. Works in `.json` **and** `.jsonc` files (including `settings.json`, `tsconfig.json`, …).

[![CI](https://github.com/akshaykbkale/json-pro/actions/workflows/ci.yml/badge.svg)](https://github.com/akshaykbkale/json-pro/actions/workflows/ci.yml)

---

## Features at a Glance

### ✦ Format & Edit
| Command | Shortcut | Description |
|---|---|---|
| **Format** | `Shift+Alt+F` | Prettify with configurable indent. Comments, key order and number spelling (`74.0`) are preserved |
| **Minify** | `Shift+Alt+M` | Collapse to a single line. Drops whitespace, comments and trailing commas; never rewrites values |
| **Sort Keys** | — | Sort all keys alphabetically (recursive; array order is kept) |
| **Auto-Fix** | `Shift+Alt+X` | Repair almost-JSON — see below. Shows a native diff preview before applying |
| **Remove Nulls & Empty** | — | Strip `null`, `""`, `[]`, `{}` values recursively (objects and arrays) |
| **Rename Key** | — | Pick any key and rename it everywhere it appears in the document |

**Auto-Fix** handles: `//`, `/* */` and `#` comments · single-quoted strings · unquoted keys · trailing, duplicate and missing commas · missing colons · Python/JS literals (`True`, `None`, `undefined`, `NaN`) · `+1`, `.5`, `5.` numbers · raw tabs in strings · unterminated strings · stray or missing closing brackets · byte-order marks. String contents are never touched, so `"http://example.com"` and `"it's"` survive intact.

---

### ✦ Diff Checker
Side-by-side diff panel with line numbers, color-coded changes, and navigation. Both sides are normalised before diffing, so pure formatting differences are ignored.

- **Green** rows = added in right · **Red** rows = removed from left · **Amber** rows = same key, different value
- Summary bar: `+2 added · -1 removed · ~3 changed · =8 same` (or *documents are semantically identical*)
- Toolbar: Swap, Prev/Next hunk, Copy Right, Apply Right to the file the panel was opened from, Edit
- **Load file…** on either side, `Ctrl/Cmd+Enter` to compare

---

### ✦ JSONPath Query
`Shift+Alt+Q` — Live query panel powered by a built-in JSONPath engine. Results update as you type **and as you edit the source file**.

```
$.users[*].name
$..email
$.users[?(@.role == 'admin')]
$.users[?(@.active)]
$.users[?(@.name =~ /^a/i)]
$.settings['theme','language']
$.users[0:2]
$..[0]
```

Each result shows its path and value with *copy path* / *copy value* buttons.

---

### ✦ Merge JSON
Deep-merge two JSON objects side-by-side. Right values override left on conflicts; arrays are concatenated or replaced (your choice). Apply the result to the original file, open it in a new tab, or copy it. **Load file…** fills the right side from disk.

---

### ✦ Stats Dashboard
`Shift+Alt+S` — Visual analytics panel for any JSON file.

- Total keys, values, max depth, file size (with pretty / minified sizes and potential saving)
- **Type distribution** bar chart (object / array / string / number / boolean / null)
- Largest arrays, deepest paths and longest strings tables

---

### ✦ Transform
| Command | Description |
|---|---|
| **Flatten JSON** | `{"a":{"b":1},"c":[1]}` → `{"a.b": 1, "c[0]": 1}` (empty `{}` / `[]` are kept so the transform round-trips) |
| **Unflatten JSON** | `{"a.b": 1}` → `{"a":{"b":1}}`; `{"[0].x": 1}` → `[{"x":1}]` |

---

### ✦ Convert
| Command | Description |
|---|---|
| **Generate TypeScript Interfaces** | Infers `export interface` definitions. Objects sharing a name are merged: properties missing in some become optional (`zip?: string`) and conflicting types become unions (`string \| null`). Array element types are singularised (`users` → `User`) |
| **Convert to YAML** | Opens YAML output in a new tab (block scalars for multi-line strings, correct quoting) |
| **Escape JSON String** | Wraps content as an escaped JSON string value |
| **Unescape JSON String** | Parses an escaped JSON string back to raw content |

---

### ✦ Search
One fuzzy QuickPick over every key and value in the document. Select a match to jump straight to it — the right occurrence, even when the same key exists at several paths.

---

### ✦ Copy Path / Copy JSONPath
Put the cursor anywhere → **Copy Path** copies `users[0].address.city`; **Copy JSONPath** copies `$.users[0].address.city`. Keys that are not plain identifiers are bracket-quoted: `data["first name"]`.

---

### ✦ Sidebar Tree View
A live JSON tree in the Explorer panel with type icons. Refreshes as you type (debounced) and never steals focus from the editor. Click any node to jump to it.

- `{n}` badge for objects · `[n]` badge for arrays · value preview for primitives
- Shows a message instead of going blank while the document has syntax errors

---

### ✦ Inline Diagnostics
- **Validator** — precise error squiggles with human-readable messages, aware of the document's language mode (comments and trailing commas are allowed in `.jsonc`):
  `Trailing comma — remove the last comma before } or ]`
  `Missing comma between items`
  `Unterminated string — missing closing double quote`
- **Duplicate key detection** — warning squiggles on every occurrence of a key that appears more than once in the same object
- Turn both off with `jsonPro.enableDiagnostics: false` if you prefer VS Code's built-in validation only

---

### ✦ Hover Intelligence
Hover over any JSON value to see:
- **Base64 strings** → decoded content shown inline
- **Unix timestamps** (10 or 13 digits, as numbers or strings) → human-readable date, plus the ISO form
- **ISO 8601 date strings** → full formatted date, plus the Unix timestamp
- **Long strings** → character count

---

### ✦ Breadcrumb Status Bar
The bottom status bar always shows your current JSON path as the cursor moves. Click it to copy.

---

## Quick Start

Open any `.json` or `.jsonc` file → **right-click** to see all JSON Pro commands grouped by category, or open the Command Palette and type **JSON Pro**:

```
── Format / Minify / Sort Keys
── Auto-Fix / Flatten / Unflatten / Remove Nulls / Rename Key
── Diff Checker / Merge JSON / JSONPath Query / Show Stats
── Generate TypeScript / Convert to YAML / Escape / Unescape
── Search / Copy Path / Copy JSONPath
```

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `jsonPro.indentSize` | `2` | Spaces per indent level (`2` or `4`) |
| `jsonPro.useTabs` | `false` | Use tabs instead of spaces |
| `jsonPro.autoFixOnSave` | `false` | Silently repair invalid JSON when saving (valid files are never modified) |
| `jsonPro.showTreeOnOpen` | `true` | Reveal the tree view when a JSON file becomes active |
| `jsonPro.enableDiagnostics` | `true` | Show JSON Pro's own syntax and duplicate-key diagnostics |

---

## Keyboard Shortcuts

| Shortcut | Command |
|---|---|
| `Shift+Alt+F` | Format (overrides the built-in *Format Document* binding in JSON files) |
| `Shift+Alt+M` | Minify |
| `Shift+Alt+X` | Auto-Fix |
| `Shift+Alt+Q` | JSONPath Query |
| `Shift+Alt+S` | Show Stats |

---

## Try It — Sample JSON

Paste this into a `.json` file to explore every feature (or run **JSON Pro: Welcome / Overview** and click *Open in New File*):

```json
{
  "app": {
    "name": "JSON Pro Demo",
    "version": "2.1.0",
    "buildTimestamp": 1711929600,
    "releasedAt": "2024-04-01T08:00:00Z",
    "active": true,
    "description": null
  },
  "users": [
    {
      "id": 1,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "role": "admin",
      "verified": true,
      "score": 98.5,
      "token": "SGVsbG8gZnJvbSBKU09OIFBybw==",
      "address": { "street": "123 Oak drive", "city": "London", "country": "UK", "zip": "" },
      "tags": ["admin", "power-user"],
      "lastLogin": 1711843200
    },
    {
      "id": 2,
      "name": "John Doe",
      "email": "john@example.com",
      "role": "viewer",
      "verified": false,
      "score": 74.0,
      "token": null,
      "address": { "street": "121 oak dr", "city": "Delhi", "country": "IN", "zip": "" },
      "tags": ["viewer"],
      "lastLogin": 1711756800
    }
  ],
  "settings": {
    "theme": "dark",
    "language": "en",
    "notifications": { "email": true, "push": false, "sms": null },
    "limits": { "maxUsers": 100, "maxStorage": 5368709120, "rateLimit": { "requests": 1000, "windowMs": 60000 } }
  },
  "stats": { "totalUsers": 2, "activeUsers": 1, "revenue": 49999.99, "growth": null, "topCountries": ["IN", "UK"] }
}
```

**Things to try with this file:**
- Hover over `1711929600` → see the decoded timestamp
- Hover over `"SGVsbG8gZnJvbSBKU09OIFBybw=="` → see decoded Base64
- Hover over `"2024-04-01T08:00:00Z"` → see formatted date
- Run **JSONPath Query** → try `$.users[*].name` or `$.users[?(@.role == 'admin')]`
- Run **Show Stats** → see type distribution and depth analysis
- Run **Generate TypeScript Interfaces** → note `zip` is typed from both users and `token` becomes `string | null`
- Run **Flatten JSON** → see the dot-notation flat map, then **Unflatten JSON** to get back
- Run **Remove Nulls & Empty** → strip all null/empty values
- Add a trailing comma or a `// comment`, then run **Auto-Fix**

---

## Development

```bash
npm install
npm run compile   # typecheck
npm test          # unit tests for the core logic (node --test)
npm run build     # bundle to dist/extension.js
npm run check     # all of the above
npm run package   # build the .vsix
```

Press `F5` in VS Code to launch an Extension Development Host. Pure logic lives in `src/core/` (no `vscode` imports) and is covered by the tests in `test/`; the VS Code integration lives alongside in `src/`.

### Releasing

1. Update `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Commit, then tag: `git tag v1.1.0 && git push --tags`.
3. The **Release** workflow builds the VSIX, attaches it to a GitHub Release and, if a `VSCE_PAT` repository secret is configured, publishes it to the Marketplace. Without the secret, publish manually with `npx vsce publish --packagePath json-pro-*.vsix`.

---

## Requirements

- VS Code `^1.85.0`

## Extension ID

`AkshayKale.json-pro`

## License

[MIT](LICENSE)
