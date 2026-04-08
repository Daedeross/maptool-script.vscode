import * as vscode from 'vscode';
import { formatWholeDocument } from './formatDocument';

const MTS_SELECTOR: vscode.DocumentSelector = { language: 'mts' };

function readSegmentOptions(doc: vscode.TextDocument) {
  const cfg = vscode.workspace.getConfiguration('maptoolScript', doc.uri);
  return {
    htmlInSingleQuotedStrings: cfg.get<boolean>('format.htmlInSingleQuotedStrings', true),
    htmlInDoubleQuotedStrings: cfg.get<boolean>('format.htmlInDoubleQuotedStrings', false),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document, options) {
      const cfg = vscode.workspace.getConfiguration('maptoolScript', document.uri);
      if (!cfg.get<boolean>('format.enable', true)) {
        return [];
      }

      const segmentOptions = readSegmentOptions(document);
      const tabSize = options.tabSize ?? 4;
      const insertSpaces = options.insertSpaces ?? true;
      const next = formatWholeDocument(document, segmentOptions, tabSize, insertSpaces);
      const fullRange = document.validateRange(
        new vscode.Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
      );
      if (next === document.getText()) {
        return [];
      }
      return [vscode.TextEdit.replace(fullRange, next)];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(MTS_SELECTOR, provider),
  );
}

export function deactivate(): void {}
