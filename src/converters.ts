import * as vscode from 'vscode';

/** Open generated content in a new untitled editor beside the current one. */
export async function openInNewTab(content: string, language: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
}
