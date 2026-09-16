export interface DiffLine {
  type: 'equal' | 'added' | 'removed' | 'changed';
  leftLine: string;
  rightLine: string;
  leftNum: number | null;
  rightNum: number | null;
}

export interface DiffSuccess {
  type: 'success';
  lines: DiffLine[];
  formattedLeft: string;
  formattedRight: string;
  summary: { added: number; removed: number; changed: number; same: number };
}

export interface DiffError {
  type: 'error';
  side: 'left' | 'right' | 'both';
  message: string;
}

/** Upper bound on LCS table cells (after common prefix/suffix trimming) before we refuse. */
const MAX_CELLS = 25_000_000;

/** Parse, normalise and diff two JSON documents line by line. */
export function computeJsonDiff(leftText: string, rightText: string, indent: number | string = 2): DiffSuccess | DiffError {
  let leftFormatted: string;
  let rightFormatted: string;
  try {
    leftFormatted = JSON.stringify(JSON.parse(leftText), null, indent);
  } catch (e) {
    return { type: 'error', side: 'left', message: e instanceof Error ? e.message : String(e) };
  }
  try {
    rightFormatted = JSON.stringify(JSON.parse(rightText), null, indent);
  } catch (e) {
    return { type: 'error', side: 'right', message: e instanceof Error ? e.message : String(e) };
  }

  const leftLines = leftFormatted.split('\n');
  const rightLines = rightFormatted.split('\n');
  const lines = lineDiff(leftLines, rightLines);
  if (!lines) {
    return { type: 'error', side: 'both', message: 'Documents differ too much to diff line by line (limit exceeded).' };
  }

  const summary = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const l of lines) {
    if (l.type === 'added') summary.added++;
    else if (l.type === 'removed') summary.removed++;
    else if (l.type === 'changed') summary.changed++;
    else summary.same++;
  }
  return { type: 'success', lines, formattedLeft: leftFormatted, formattedRight: rightFormatted, summary };
}

type Op = { type: 'equal' | 'added' | 'removed'; li: number; ri: number };

/** Line diff via LCS with common prefix/suffix trimming. Returns null when the input is too large. */
export function lineDiff(leftLines: string[], rightLines: string[]): DiffLine[] | null {
  const ops = diffOps(leftLines, rightLines);
  if (!ops) return null;

  const result: DiffLine[] = [];
  let idx = 0;
  while (idx < ops.length) {
    const op = ops[idx];
    if (op.type === 'equal') {
      result.push({ type: 'equal', leftLine: leftLines[op.li], rightLine: rightLines[op.ri], leftNum: op.li + 1, rightNum: op.ri + 1 });
      idx++;
      continue;
    }
    // Gather one hunk of consecutive non-equal ops
    const removed: Op[] = [];
    const added: Op[] = [];
    while (idx < ops.length && ops[idx].type !== 'equal') {
      (ops[idx].type === 'removed' ? removed : added).push(ops[idx]);
      idx++;
    }
    // Pair removed/added lines that share the same JSON key as 'changed'
    const usedAdded = new Set<number>();
    const pairedRemoved = new Set<number>();
    for (let r = 0; r < removed.length; r++) {
      const lLine = leftLines[removed[r].li];
      const lKey = extractJsonKey(lLine);
      if (lKey === null) continue;
      for (let a = 0; a < added.length; a++) {
        if (usedAdded.has(a)) continue;
        const rLine = rightLines[added[a].ri];
        if (extractJsonKey(rLine) === lKey) {
          result.push({ type: 'changed', leftLine: lLine, rightLine: rLine, leftNum: removed[r].li + 1, rightNum: added[a].ri + 1 });
          pairedRemoved.add(r);
          usedAdded.add(a);
          break;
        }
      }
    }
    for (let r = 0; r < removed.length; r++) {
      if (pairedRemoved.has(r)) continue;
      result.push({ type: 'removed', leftLine: leftLines[removed[r].li], rightLine: '', leftNum: removed[r].li + 1, rightNum: null });
    }
    for (let a = 0; a < added.length; a++) {
      if (usedAdded.has(a)) continue;
      result.push({ type: 'added', leftLine: '', rightLine: rightLines[added[a].ri], leftNum: null, rightNum: added[a].ri + 1 });
    }
  }
  return result;
}

function diffOps(left: string[], right: string[]): Op[] | null {
  const m = left.length;
  const n = right.length;

  // Trim common prefix and suffix — the typical case for edited JSON.
  let prefix = 0;
  while (prefix < m && prefix < n && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < m - prefix && suffix < n - prefix && left[m - 1 - suffix] === right[n - 1 - suffix]) suffix++;

  const lm = m - prefix - suffix;
  const rn = n - prefix - suffix;
  if (lm * rn > MAX_CELLS) return null;

  const ops: Op[] = [];
  for (let i = 0; i < prefix; i++) ops.push({ type: 'equal', li: i, ri: i });

  if (lm > 0 && rn > 0) {
    const width = rn + 1;
    const table = lm * rn < 60_000 ? new Uint16Array((lm + 1) * width) : new Uint32Array((lm + 1) * width);
    for (let i = 1; i <= lm; i++) {
      const lLine = left[prefix + i - 1];
      for (let j = 1; j <= rn; j++) {
        table[i * width + j] = lLine === right[prefix + j - 1]
          ? table[(i - 1) * width + (j - 1)] + 1
          : Math.max(table[(i - 1) * width + j], table[i * width + (j - 1)]);
      }
    }
    const middle: Op[] = [];
    let i = lm;
    let j = rn;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && left[prefix + i - 1] === right[prefix + j - 1]) {
        middle.push({ type: 'equal', li: prefix + i - 1, ri: prefix + j - 1 });
        i--; j--;
      } else if (j > 0 && (i === 0 || table[i * width + (j - 1)] >= table[(i - 1) * width + j])) {
        middle.push({ type: 'added', li: -1, ri: prefix + j - 1 });
        j--;
      } else {
        middle.push({ type: 'removed', li: prefix + i - 1, ri: -1 });
        i--;
      }
    }
    middle.reverse();
    ops.push(...middle);
  } else {
    for (let i = 0; i < lm; i++) ops.push({ type: 'removed', li: prefix + i, ri: -1 });
    for (let j = 0; j < rn; j++) ops.push({ type: 'added', li: -1, ri: prefix + j });
  }

  for (let k = 0; k < suffix; k++) ops.push({ type: 'equal', li: m - suffix + k, ri: n - suffix + k });
  return ops;
}

function extractJsonKey(line: string): string | null {
  const m = line.trim().match(/^"((?:[^"\\]|\\.)*)"\s*:/);
  return m ? m[1] : null;
}
