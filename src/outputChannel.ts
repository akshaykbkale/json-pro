import * as vscode from 'vscode';

// Single shared output channel for the entire extension
let _channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel('JSON Pro');
  }
  return _channel;
}
