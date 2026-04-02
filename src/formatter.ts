import * as vscode from 'vscode';

function getIndent(): string | number {
  const config = vscode.workspace.getConfiguration('jsonPro');
  if (config.get<boolean>('useTabs')) {
    return '\t';
  }
  return config.get<number>('indentSize') ?? 2;
}

export function formatJson(text: string): string {
  const parsed: unknown = JSON.parse(text);
  return JSON.stringify(parsed, null, getIndent());
}

export function minifyJson(text: string): string {
  const parsed: unknown = JSON.parse(text);
  return JSON.stringify(parsed);
}

export function sortKeysJson(text: string): string {
  const parsed: unknown = JSON.parse(text);
  const sorted = sortValue(parsed);
  return JSON.stringify(sorted, null, getIndent());
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}
