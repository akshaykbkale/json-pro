// Must be imported before anything that imports 'vscode'.
import Module = require('module');
import { vscode } from './vscodeStub';

const originalLoad = (Module as any)._load as (request: string, ...rest: unknown[]) => unknown;
(Module as any)._load = function (request: string, ...rest: unknown[]): unknown {
  return request === 'vscode' ? vscode : originalLoad.call(this, request, ...rest);
};
