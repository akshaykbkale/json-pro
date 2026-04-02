import * as vscode from 'vscode';

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      [{ language: 'json' }, { language: 'jsonc' }],
      { provideHover }
    )
  );
}

function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position
): vscode.Hover | null {
  const hovers: string[] = [];

  // ── Check for a quoted string value at cursor ──────────────────────────────
  const strRange = document.getWordRangeAtPosition(position, /"(?:[^"\\]|\\.)*"/);
  if (strRange) {
    const raw = document.getText(strRange);
    const inner = raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // Base64 detection
    if (/^[A-Za-z0-9+/]{8,}={0,2}$/.test(inner) && inner.length % 4 === 0) {
      try {
        const decoded = Buffer.from(inner, 'base64').toString('utf8');
        if (isPrintable(decoded) && decoded !== inner) {
          const preview = decoded.length > 300
            ? decoded.slice(0, 300) + '\u2026'
            : decoded;
          hovers.push(`**Base64 Decoded** (${inner.length} chars → ${decoded.length} chars)\n\`\`\`\n${preview}\n\`\`\``);
        }
      } catch { /* not valid base64 */ }
    }

    // ISO 8601 date string detection
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(inner)) {
      const d = new Date(inner);
      if (!isNaN(d.getTime())) {
        hovers.push(`**ISO Date**  \n${d.toUTCString()}  \n${d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}`);
      }
    }

    // Unix timestamp as string (10 or 13 digit number string)
    if (/^\d{10}$/.test(inner) || /^\d{13}$/.test(inner)) {
      const ms = inner.length === 13 ? parseInt(inner, 10) : parseInt(inner, 10) * 1000;
      const d = new Date(ms);
      if (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) {
        const unit = inner.length === 10 ? 'Unix timestamp (seconds)' : 'Unix timestamp (ms)';
        hovers.push(`**${unit}**  \n${d.toUTCString()}  \n${d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}`);
      }
    }

    if (hovers.length > 0) {
      const md = new vscode.MarkdownString(hovers.join('\n\n---\n\n'));
      md.isTrusted = true;
      return new vscode.Hover(md, strRange);
    }
  }

  // ── Check for a bare number at cursor (unix timestamp) ─────────────────────
  const numRange = document.getWordRangeAtPosition(position, /\b\d{10,13}\b/);
  if (numRange) {
    const raw = document.getText(numRange);
    if (/^\d{10}$/.test(raw) || /^\d{13}$/.test(raw)) {
      const ms = raw.length === 13 ? parseInt(raw, 10) : parseInt(raw, 10) * 1000;
      const d = new Date(ms);
      if (d.getFullYear() >= 1970 && d.getFullYear() <= 2100) {
        const unit = raw.length === 10 ? 'Unix timestamp (seconds)' : 'Unix timestamp (ms)';
        const md = new vscode.MarkdownString(
          `**${unit}**  \n${d.toUTCString()}  \n${d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}`
        );
        md.isTrusted = true;
        return new vscode.Hover(md, numRange);
      }
    }
  }

  return null;
}

function isPrintable(s: string): boolean {
  // Allow printable ASCII + whitespace
  return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(s);
}
