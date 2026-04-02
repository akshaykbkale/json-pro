# JSON Pro

**The complete JSON toolbox for VS Code.** Format, fix, diff, query, transform, and analyze JSON — all from the right-click menu or keyboard shortcuts.

---

## Features at a Glance

### ✦ Format & Edit
| Command | Shortcut | Description |
|---|---|---|
| **Format** | `Shift+Alt+F` | Prettify JSON with configurable indent |
| **Minify** | `Shift+Alt+M` | Collapse to a single line |
| **Sort Keys** | — | Sort all keys alphabetically (recursive) |
| **Auto-Fix** | `Shift+Alt+X` | Fix comments, single quotes, unquoted keys, trailing commas, missing brackets — shows native diff preview before applying |
| **Remove Nulls & Empty** | — | Strip `null`, `""`, `[]`, `{}` values recursively |
| **Rename Key** | — | Rename a key everywhere it appears in the document |

---

### ✦ Diff Checker
Side-by-side diff panel with line numbers, color-coded changes, and navigation.

- **Green** rows = added in right
- **Red** rows = removed from left
- **Amber** rows = same key, different value
- Summary bar: `+2 added · -1 removed · ~3 changed · =8 same`
- Toolbar: Swap, Prev/Next hunk, Format Both, Apply All, Edit

---

### ✦ JSONPath Query
`Shift+Alt+Q` — Live query panel powered by a built-in JSONPath engine.

```
$.users[*].name
$..email
$.users[?(@.role == 'admin')]
$.settings.limits.rateLimit
$.users[0:2]
```

Results show path + value with a copy button. Updates as you type.

---

### ✦ Merge JSON
Deep-merge two JSON objects side-by-side. Right values override left on conflicts, arrays are concatenated. Apply result directly to editor or open in a new tab.

---

### ✦ Stats Dashboard
`Shift+Alt+S` — Visual analytics panel for any JSON file.

- Total keys, values, max depth, file size
- **Type distribution** bar chart (object / array / string / number / boolean / null)
- Largest arrays table
- Deepest paths table
- Longest strings table

---

### ✦ Transform
| Command | Description |
|---|---|
| **Flatten JSON** | `{"a":{"b":1}}` → `{"a.b": 1}` |
| **Unflatten JSON** | `{"a.b": 1}` → `{"a":{"b":1}}` |

---

### ✦ Convert
| Command | Description |
|---|---|
| **Generate TypeScript Interfaces** | Infers `export interface` definitions from any JSON structure |
| **Convert to YAML** | Opens YAML output in a new tab |
| **Escape JSON String** | Wraps content as an escaped JSON string value |
| **Unescape JSON String** | Parses an escaped JSON string back to raw content |

---

### ✦ Search
Search keys and values by keyword. Results shown in a QuickPick — select any match to jump directly to that line.

---

### ✦ Copy Path
Click anywhere in a JSON file → **Copy Path** copies the dot-notation path to clipboard.
e.g. `users[0].address.city`

---

### ✦ Sidebar Tree View
A live JSON tree in the Explorer panel. Refreshes as you type (debounced). Click any node to jump to it in the editor.

- `{}` badge for objects
- `[n]` badge for arrays
- Value preview for primitives

---

### ✦ Inline Diagnostics
- **Validator** — real-time error squiggles with human-readable messages:
  `Trailing comma — remove the last comma before } or ]`
  `Missing closing bracket or brace`
- **Duplicate key detection** — warning squiggles on any key that appears more than once in the same object

---

### ✦ Hover Intelligence
Hover over any JSON value to see:
- **Base64 strings** → decoded content shown inline
- **Unix timestamps** (10 or 13-digit) → human-readable date & time
- **ISO 8601 date strings** → full formatted date

---

### ✦ Breadcrumb Status Bar
The bottom status bar always shows your current JSON path as the cursor moves.
`users[1].address.city` — click to copy it to clipboard.

---

## Quick Start

Open any `.json` file → **right-click** to see all JSON Pro commands grouped by category:

```
── Format / Minify / Sort Keys
── Auto-Fix / Flatten / Unflatten / Remove Nulls / Rename Key
── Diff Checker / Merge JSON / JSONPath Query / Show Stats
── Generate TypeScript / Convert to YAML / Escape / Unescape
── Search / Copy Path
```

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `jsonPro.indentSize` | `2` | Spaces per indent level (`2` or `4`) |
| `jsonPro.useTabs` | `false` | Use tabs instead of spaces |
| `jsonPro.autoFixOnSave` | `false` | Auto-fix JSON on every save |
| `jsonPro.showTreeOnOpen` | `true` | Auto-reveal tree view when opening a JSON file |

---

## Keyboard Shortcuts

| Shortcut | Command |
|---|---|
| `Shift+Alt+F` | Format |
| `Shift+Alt+M` | Minify |
| `Shift+Alt+X` | Auto-Fix |
| `Shift+Alt+Q` | JSONPath Query |
| `Shift+Alt+S` | Show Stats |

---

## Try It — Sample JSON

Paste this into a `.json` file to explore every feature:

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
      "role": "viewer",
      "verified": false,
      "score": 74.0,
      "token": null,
      "address": {
        "street": "123 Oak drive",
        "city": "London",
        "country": "UK",
        "zip": ""
      },
      "tags": ["viewer"],
      "lastLogin": 1711756800
    },
    {
      "id": 1,
      "name": "John Doe ",
      "email": "john@example.com",
      "role": "viewer",
      "verified": false,
      "score": 74.0,
      "token": null,
      "address": {
        "street": "121 oak dr",
        "city": "Delhi",
        "country": "IN",
        "zip": ""
      },
      "tags": ["viewer"],
      "lastLogin": 1711756800
    }
  ],
  "settings": {
    "theme": "dark",
    "language": "en",
    "notifications": {
      "email": true,
      "push": false,
      "sms": null
    },
    "limits": {
      "maxUsers": 100,
      "maxStorage": 5368709120,
      "rateLimit": { "requests": 1000, "windowMs": 60000 }
    }
  },
  "stats": {
    "totalUsers": 2,
    "activeUsers": 1,
    "revenue": 49999.99,
    "growth": null,
    "topCountries": ["IN", "UK"]
  }
}
```

**Things to try with this file:**
- Hover over `1711929600` → see the decoded timestamp
- Hover over `"SGVsbG8gZnJvbSBKU09OIFBybw=="` → see decoded Base64
- Hover over `"2024-04-01T08:00:00Z"` → see formatted date
- Run **JSONPath Query** → try `$.users[*].name` or `$.users[?(@.role == 'admin')]`
- Run **Show Stats** → see type distribution and depth analysis
- Run **Generate TypeScript Interfaces** → get typed interfaces instantly
- Run **Flatten JSON** → see dot-notation flat map
- Run **Remove Nulls & Empty** → strip all null/empty values

---

## Requirements

- VS Code `^1.85.0`

## Extension ID

`AkshayKale.json-pro`
