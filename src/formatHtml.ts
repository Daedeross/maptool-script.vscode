import { getLanguageService } from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

const htmlService = getLanguageService();

const formatUri = 'file:///embedded/mapToolFragment.html';

export function formatHtmlFragment(
  html: string,
  tabSize: number,
  insertSpaces: boolean,
  eol: '\n' | '\r\n',
): string {
  const doc = TextDocument.create(formatUri, 'html', 1, html);
  const edits = htmlService.format(doc, undefined, {
    tabSize,
    insertSpaces,
    endWithNewline: false,
    preserveNewLines: true,
  });
  if (!edits.length) {
    return normalizeEol(html, eol);
  }
  const sorted = [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  );
  let out = doc.getText();
  for (const e of sorted) {
    const start = doc.offsetAt(e.range.start);
    const end = doc.offsetAt(e.range.end);
    out = out.slice(0, start) + e.newText + out.slice(end);
  }
  return normalizeEol(out, eol);
}

function normalizeEol(s: string, eol: '\n' | '\r\n'): string {
  if (eol === '\n') {
    return s.replace(/\r\n/g, '\n');
  }
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}
