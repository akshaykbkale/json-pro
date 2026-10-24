/**
 * Shared design system for JSON Pro webviews, modelled on shadcn/ui: a small token set
 * (background, card, muted, border, primary, ring, radius) resolved from VS Code theme
 * variables so every panel follows the user's light/dark theme, plus the component
 * classes the panels compose: btn (default/secondary/outline/ghost/destructive, sm/icon),
 * badge, card, input/textarea/select, switch, table, alert, kbd, progress, separator.
 *
 * Icons are adapted from Lucide (https://lucide.dev, ISC licence).
 */

const ICONS: Record<string, string> = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  diff: '<circle cx="5" cy="6" r="3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/><path d="m15 9-3-3 3-3"/><circle cx="19" cy="18" r="3"/><path d="M12 18H7a2 2 0 0 1-2-2V9"/><path d="m9 15 3 3-3 3"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  braces: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  tree: '<path d="M21 12h-8"/><path d="M21 6H8"/><path d="M21 18h-8"/><path d="M3 6v4c0 1.1.9 2 2 2h3"/><path d="M3 10v6c0 1.1.9 2 2 2h3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  fileJson: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>',
};

/** Inline SVG icon (monochrome, inherits `currentColor`). */
export function icon(name: keyof typeof ICONS | string, size = 14): string {
  const path = ICONS[name] ?? ICONS.alert;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const UI_CSS = /* css */`
  :root {
    --background: var(--vscode-editor-background);
    --foreground: var(--vscode-editor-foreground, var(--vscode-foreground));
    --card: var(--vscode-editorWidget-background, var(--vscode-sideBar-background, var(--background)));
    --card-foreground: var(--foreground);
    --muted: var(--vscode-editorGroupHeader-tabsBackground, rgba(128,128,128,0.08));
    --muted-foreground: var(--vscode-descriptionForeground, rgba(128,128,128,0.95));
    --border: var(--vscode-widget-border, var(--vscode-editorGroup-border, rgba(128,128,128,0.28)));
    --input: var(--vscode-input-border, var(--border));
    --primary: var(--vscode-button-background, #0078d4);
    --primary-foreground: var(--vscode-button-foreground, #fff);
    --primary-hover: var(--vscode-button-hoverBackground, var(--primary));
    --secondary: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.16));
    --secondary-foreground: var(--vscode-button-secondaryForeground, var(--foreground));
    --secondary-hover: var(--vscode-button-secondaryHoverBackground, var(--secondary));
    --accent: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12));
    --accent-foreground: var(--foreground);
    --destructive: var(--vscode-errorForeground, #e05252);
    --success: var(--vscode-testing-iconPassed, #3fb950);
    --warning: var(--vscode-editorWarning-foreground, #d29922);
    --ring: var(--vscode-focusBorder, #0078d4);
    --radius: 6px;
    --radius-lg: 10px;
    --font-sans: var(--vscode-font-family, system-ui, sans-serif);
    --font-mono: var(--vscode-editor-font-family, ui-monospace, monospace);
    --text-xs: 0.85em;
    --text-sm: 0.93em;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.18);
    --shadow: 0 1px 3px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.12);
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body { font-family: var(--font-sans); font-size: var(--vscode-font-size, 13px); line-height: 1.45;
         color: var(--foreground); background: var(--background); -webkit-font-smoothing: antialiased; }
  .icon { flex-shrink: 0; vertical-align: -2px; }
  .mono { font-family: var(--font-mono); }
  .muted { color: var(--muted-foreground); }
  .text-xs { font-size: var(--text-xs); } .text-sm { font-size: var(--text-sm); }
  .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; }
  .row { display: flex; align-items: center; gap: 8px; } .col { display: flex; flex-direction: column; gap: 8px; }
  .spacer { flex: 1; } .wrap { flex-wrap: wrap; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ── Button ── */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;
         height: 30px; padding: 0 12px; border-radius: var(--radius); border: 1px solid transparent;
         font: inherit; font-size: var(--text-sm); font-weight: 500; line-height: 1; cursor: pointer;
         color: var(--foreground); background: transparent; transition: background-color .12s, border-color .12s, color .12s, opacity .12s; }
  .btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring); }
  .btn:disabled { opacity: 0.5; pointer-events: none; }
  .btn-default { background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-sm); }
  .btn-default:hover { background: var(--primary-hover); }
  .btn-secondary { background: var(--secondary); color: var(--secondary-foreground); }
  .btn-secondary:hover { background: var(--secondary-hover); }
  .btn-outline { border-color: var(--input); background: var(--background); box-shadow: var(--shadow-sm); }
  .btn-outline:hover { background: var(--accent); color: var(--accent-foreground); }
  .btn-ghost:hover { background: var(--accent); color: var(--accent-foreground); }
  .btn-destructive { background: var(--destructive); color: #fff; }
  .btn-destructive:hover { filter: brightness(0.92); }
  .btn-sm { height: 26px; padding: 0 9px; font-size: var(--text-xs); border-radius: calc(var(--radius) - 1px); }
  .btn-icon { width: 26px; height: 26px; padding: 0; }
  .btn-icon.btn-xs { width: 22px; height: 22px; }
  .btn-group { display: inline-flex; align-items: center; gap: 2px; }

  /* ── Badge ── */
  .badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; border: 1px solid transparent;
           padding: 1px 9px; font-size: var(--text-xs); font-weight: 600; line-height: 1.5; white-space: nowrap; }
  .badge-default { background: var(--primary); color: var(--primary-foreground); }
  .badge-secondary { background: var(--secondary); color: var(--secondary-foreground); }
  .badge-outline { border-color: var(--border); color: var(--foreground); }
  .badge-muted { background: var(--muted); color: var(--muted-foreground); font-weight: 500; }
  .badge .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .badge.clickable { cursor: pointer; } .badge.clickable:hover { background: var(--accent); }

  /* ── Card ── */
  .card { background: var(--card); color: var(--card-foreground); border: 1px solid var(--border);
          border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; min-width: 0; }
  .card-header { display: flex; flex-direction: column; gap: 3px; padding: 14px 16px 10px; }
  .card-header.row { flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .card-title { font-size: 1em; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; display: flex; align-items: center; gap: 7px; }
  .card-description { font-size: var(--text-xs); color: var(--muted-foreground); }
  .card-content { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; }
  .card-footer { display: flex; align-items: center; gap: 8px; padding: 0 16px 16px; }
  .card.interactive { cursor: pointer; transition: border-color .12s, box-shadow .12s, transform .12s; }
  .card.interactive:hover { border-color: var(--ring); box-shadow: var(--shadow); }
  .card.compact .card-header { padding: 10px 12px 6px; } .card.compact .card-content { padding: 0 12px 12px; }

  /* ── Form controls ── */
  .input, .textarea, .select { width: 100%; font: inherit; font-size: var(--text-sm); color: var(--foreground);
         background: var(--vscode-input-background, transparent); border: 1px solid var(--input); border-radius: var(--radius);
         box-shadow: var(--shadow-sm); transition: border-color .12s, box-shadow .12s; }
  .input, .select { height: 30px; padding: 0 10px; }
  .textarea { padding: 8px 10px; resize: none; line-height: 1.5; }
  .input::placeholder, .textarea::placeholder { color: var(--muted-foreground); opacity: 0.8; }
  .input:focus-visible, .textarea:focus-visible, .select:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 1px var(--ring); }
  .input.invalid, .textarea.invalid { border-color: var(--destructive); box-shadow: 0 0 0 1px var(--destructive); }
  .select { appearance: none; padding-right: 26px; cursor: pointer;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
            background-repeat: no-repeat; background-position: right 8px center; }
  .field-error { display: none; align-items: flex-start; gap: 6px; font-size: var(--text-xs); color: var(--destructive); line-height: 1.4; }
  .field-error.show { display: flex; }
  .input-icon { position: relative; }
  .input-icon .icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted-foreground); pointer-events: none; }
  .input-icon .input { padding-left: 30px; }
  label.field { display: flex; flex-direction: column; gap: 4px; font-size: var(--text-xs); font-weight: 500; color: var(--muted-foreground); }

  /* ── Switch ── */
  .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: var(--text-sm); font-weight: 500; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
  .switch-track { width: 32px; height: 18px; border-radius: 999px; background: var(--input); position: relative; flex-shrink: 0;
                  transition: background-color .15s; border: 1px solid transparent; }
  .switch-thumb { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%;
                  background: var(--background); box-shadow: var(--shadow-sm); transition: transform .15s; }
  .switch input:checked + .switch-track { background: var(--primary); }
  .switch input:checked + .switch-track .switch-thumb { transform: translateX(14px); background: var(--primary-foreground); }
  .switch input:focus-visible + .switch-track { box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--ring); }

  /* ── Table ── */
  .table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .table th { text-align: left; height: 32px; padding: 0 10px; font-weight: 500; color: var(--muted-foreground); border-bottom: 1px solid var(--border); white-space: nowrap; }
  .table td { padding: 7px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .table tbody tr:last-child td { border-bottom: none; }
  .table tbody tr:hover td { background: var(--accent); }
  .table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--muted-foreground); }
  .table .empty-row { text-align: center; color: var(--muted-foreground); padding: 14px; }

  /* ── Alert ── */
  .alert { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--border); border-radius: var(--radius-lg);
           padding: 10px 12px; font-size: var(--text-sm); background: var(--card); }
  .alert .icon { margin-top: 2px; color: var(--muted-foreground); }
  .alert-title { font-weight: 600; margin-bottom: 1px; }
  .alert-description { color: var(--muted-foreground); }
  .alert-destructive { border-color: color-mix(in srgb, var(--destructive) 50%, transparent); color: var(--destructive); }
  .alert-destructive .icon, .alert-destructive .alert-description { color: var(--destructive); }

  /* ── Misc ── */
  kbd { display: inline-flex; align-items: center; height: 18px; padding: 0 5px; border: 1px solid var(--border); border-bottom-width: 2px;
        border-radius: 4px; background: var(--muted); font-family: var(--font-mono); font-size: 0.8em; font-weight: 500; color: var(--muted-foreground); }
  .separator { height: 1px; background: var(--border); border: none; }
  .separator.vertical { width: 1px; height: 18px; }
  .progress { height: 8px; width: 100%; border-radius: 999px; background: color-mix(in srgb, var(--primary) 18%, transparent); overflow: hidden; }
  .progress-indicator { height: 100%; border-radius: 999px; background: var(--primary); transition: width .3s; }
  .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px;
           color: var(--muted-foreground); text-align: center; }
  .empty .icon { opacity: 0.5; }
  .toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 12px; background: var(--card);
             border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .toolbar-title { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; margin-right: 6px; }
  .section-title { font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 10px; }
  pre.code { font-family: var(--font-mono); font-size: var(--text-sm); white-space: pre-wrap; word-break: break-all; padding: 10px 12px;
             border-radius: var(--radius); background: var(--muted); border: 1px solid var(--border); line-height: 1.55; }
  ::-webkit-scrollbar { width: 10px; height: 10px; } ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.3)); border-radius: 5px; }
`;

export interface PageOptions {
  nonce: string;
  title: string;
  /** Panel-specific CSS appended after the design system. */
  css?: string;
  body: string;
  /** Script body (without the <script> tag). Omit for script-less pages. */
  script?: string;
}

/** Assemble a complete webview document with a strict CSP. */
export function renderPage(o: PageOptions): string {
  const scriptSrc = o.script ? ` script-src 'nonce-${o.nonce}';` : '';
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';${scriptSrc} style-src 'unsafe-inline'; img-src data:;">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<style>${UI_CSS}
${o.css ?? ''}</style>
</head>
<body>
${o.body}
${o.script ? `<script nonce="${o.nonce}">${o.script}</script>` : ''}
</body>
</html>`;
}
