function countLeadingCloseBraces(trimmedLine: string): number {
  let inDouble = false;
  let inSingle = false;
  let escape = false;
  let count = 0;
  let i = 0;
  while (i < trimmedLine.length) {
    const c = trimmedLine[i];
    if (inDouble) {
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
      if (c === '"') {
        inDouble = false;
        i++;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
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
      if (c === "'") {
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
    if (c === '}') {
      count++;
      i++;
      while (i < trimmedLine.length && /\s/.test(trimmedLine[i])) {
        i++;
      }
      continue;
    }
    break;
  }
  return count;
}

function lineEndsWithOpenBrace(line: string): boolean {
  let inDouble = false;
  let inSingle = false;
  let escape = false;
  let lastSig: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inDouble) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inDouble = false;
        continue;
      }
      continue;
    }
    if (inSingle) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === "'") {
        inSingle = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inDouble = true;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      continue;
    }
    if (!/\s/.test(c)) {
      lastSig = c;
    }
  }
  return lastSig === '{';
}

export function formatMtsSegment(
  text: string,
  baseLevel: number,
  tabSize: number,
  eol: '\n' | '\r\n',
): [formatted: string, endBraceLevel: number] {
  const lines = text.split(/\r?\n/);
  let level = Math.max(0, baseLevel);
  const out: string[] = [];
  const indentUnit = ' '.repeat(tabSize);

  for (const line of lines) {
    const trimmedRight = line.replace(/\s+$/u, '');
    const trimmed = trimmedRight.trim();
    if (trimmed === '') {
      out.push('');
      continue;
    }

    const leadingClosings = countLeadingCloseBraces(trimmed);
    level = Math.max(0, level - leadingClosings);
    const indent = indentUnit.repeat(level);
    out.push(indent + trimmed);
    if (lineEndsWithOpenBrace(trimmed)) {
      level++;
    }
  }

  const join = eol === '\r\n' ? '\r\n' : '\n';
  return [out.join(join), level];
}
