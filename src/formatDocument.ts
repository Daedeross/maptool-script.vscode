import * as vscode from 'vscode';
import { formatHtmlFragment } from './formatHtml';
import { formatMtsSegment } from './formatMts';
import { segmentDocument, SegmentOptions } from './segment';

export function formatWholeDocument(
  doc: vscode.TextDocument,
  segmentOptions: SegmentOptions,
  tabSize: number,
  insertSpaces: boolean,
): string {
  const text = doc.getText();
  const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const segments = segmentDocument(text, segmentOptions);
  let braceLevel = 0;
  const parts: string[] = [];

  for (const seg of segments) {
    const chunk = text.slice(seg.start, seg.end);
    if (seg.kind === 'mts') {
      const [fmt, nextLevel] = formatMtsSegment(chunk, braceLevel, tabSize, eol);
      braceLevel = nextLevel;
      parts.push(fmt);
    } else {
      parts.push(formatHtmlFragment(chunk, tabSize, insertSpaces, eol));
    }
  }

  return parts.join('');
}
