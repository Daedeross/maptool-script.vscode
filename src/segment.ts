export type SegmentKind = 'mts' | 'html_raw' | 'html_in_string';

export interface Segment {
  start: number;
  end: number;
  kind: SegmentKind;
}

export interface SegmentOptions {
  htmlInSingleQuotedStrings: boolean;
  htmlInDoubleQuotedStrings: boolean;
}

function isHtmlTagContentStart(text: string, i: number): boolean {
  if (text[i] !== '<') return false;
  if (text.startsWith('<!--', i)) return true;
  const after = text[i + 1];
  if (!after) return false;
  return /[a-zA-Z/!?]/.test(after);
}

function isRawHtmlStart(text: string, i: number): boolean {
  if (!isHtmlTagContentStart(text, i)) return false;
  const lineStart = text.lastIndexOf('\n', i - 1) + 1;
  for (let k = lineStart; k < i; k++) {
    const ch = text[k];
    if (ch !== ' ' && ch !== '\t') return false;
  }
  return true;
}

/** Exclusive end index per TextMate `embedded-html-fragment`: before `]` or before line that is only ws + `[`. */
function findRawHtmlEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === ']') {
      return i;
    }
    if (text[i] === '\n') {
      const lineStart = i + 1;
      let j = lineStart;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) {
        j++;
      }
      if (j < text.length && text[j] === '[') {
        return i;
      }
    }
    i++;
  }
  return text.length;
}

function findHtmlInStringEnd(text: string, start: number, quoteChar: '"' | "'"): number {
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === quoteChar) {
      return i;
    }
    i++;
  }
  return text.length;
}

function flushMts(segments: Segment[], segStart: number, end: number): number {
  if (end > segStart) {
    segments.push({ start: segStart, end, kind: 'mts' });
  }
  return end;
}

export function segmentDocument(text: string, options: SegmentOptions): Segment[] {
  const segments: Segment[] = [];
  let segStart = 0;
  let i = 0;
  const n = text.length;

  let inDouble = false;
  let inSingle = false;
  let escape = false;

  while (i < n) {
    const c = text[i];

    if (inDouble || inSingle) {
      const fromDouble = inDouble;
      const allowHtml = fromDouble
        ? options.htmlInDoubleQuotedStrings
        : options.htmlInSingleQuotedStrings;

      if (allowHtml && !escape && c === '<' && isHtmlTagContentStart(text, i)) {
        segStart = flushMts(segments, segStart, i);
        const q: '"' | "'" = fromDouble ? '"' : "'";
        const htmlEnd = findHtmlInStringEnd(text, i, q);
        segments.push({ start: i, end: htmlEnd, kind: 'html_in_string' });
        segStart = htmlEnd;
        i = htmlEnd;
        continue;
      }

      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (c === '\\') {
        escape = true;
        i++;
        continue;
      }
      if (fromDouble && c === '"') {
        inDouble = false;
        i++;
        continue;
      }
      if (!fromDouble && c === "'") {
        inSingle = false;
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (c === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      i++;
      continue;
    }

    if (c === '<' && isRawHtmlStart(text, i)) {
      segStart = flushMts(segments, segStart, i);
      const htmlEnd = findRawHtmlEnd(text, i);
      segments.push({ start: i, end: htmlEnd, kind: 'html_raw' });
      segStart = htmlEnd;
      i = htmlEnd;
      continue;
    }

    i++;
  }

  flushMts(segments, segStart, n);
  return segments;
}
