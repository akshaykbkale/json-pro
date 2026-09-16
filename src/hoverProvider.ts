import * as vscode from 'vscode';

export function registerHoverProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider([{ language: 'json' }, { language: 'jsonc' }], { provideHover })
  );
}

function provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
  // Quoted string at cursor
  const strRange = document.getWordRangeAtPosition(position, /"(?:[^"\\]|\\.)*"/);
  if (strRange) {
    let inner: string;
    try { inner = JSON.parse(document.getText(strRange)) as string; }
    catch { return null; }

    const hovers: string[] = [];
    const b64 = describeBase64(inner);
    if (b64) hovers.push(b64);
    const iso = describeIsoDate(inner);
    if (iso) hovers.push(iso);
    const ts = describeTimestamp(inner);
    if (ts) hovers.push(ts);
    if (inner.length >= 40) hovers.push(`**String length:** ${inner.length} characters`);

    return hovers.length > 0 ? new vscode.Hover(markdown(hovers.join('\n\n---\n\n')), strRange) : null;
  }

  // Bare number at cursor
  const numRange = document.getWordRangeAtPosition(position, /\b\d{10,13}\b/);
  if (numRange) {
    const ts = describeTimestamp(document.getText(numRange));
    if (ts) return new vscode.Hover(markdown(ts), numRange);
  }
  return null;
}

function markdown(text: string): vscode.MarkdownString {
  const md = new vscode.MarkdownString(text);
  md.isTrusted = false; // content is derived from the document, never execute command links
  return md;
}

function describeBase64(s: string): string | null {
  if (!/^[A-Za-z0-9+/]{8,}={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  try {
    const decoded = Buffer.from(s, 'base64').toString('utf8');
    if (!isPrintable(decoded) || decoded === s) return null;
    const preview = decoded.length > 300 ? decoded.slice(0, 300) + '…' : decoded;
    return `**Base64 decoded** (${s.length} → ${decoded.length} chars)\n\`\`\`text\n${preview.replace(/```/g, '`​``')}\n\`\`\``;
  } catch {
    return null;
  }
}

function describeIsoDate(s: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return `**ISO 8601 date**  \n${d.toUTCString()}  \n${d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}  \nUnix: ${Math.floor(d.getTime() / 1000)}`;
}

function describeTimestamp(s: string): string | null {
  if (!/^\d{10}$/.test(s) && !/^\d{13}$/.test(s)) return null;
  const ms = s.length === 13 ? parseInt(s, 10) : parseInt(s, 10) * 1000;
  const d = new Date(ms);
  if (d.getFullYear() < 1980 || d.getFullYear() > 2100) return null;
  const unit = s.length === 10 ? 'Unix timestamp (seconds)' : 'Unix timestamp (milliseconds)';
  return `**${unit}**  \n${d.toUTCString()}  \n${d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}  \nISO: ${d.toISOString()}`;
}

function isPrintable(s: string): boolean {
  return /^[\x09\x0A\x0D\x20-\x7E -￿]*$/.test(s) && !/�/.test(s);
}
