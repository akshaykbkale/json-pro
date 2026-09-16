export interface JsonStats {
  totalKeys: number;
  totalValues: number;
  maxDepth: number;
  fileSize: number;
  prettySize: number;
  minifiedSize: number;
  types: { object: number; array: number; string: number; number: number; boolean: number; null: number };
  largestArrays: Array<{ path: string; size: number }>;
  deepestPaths: Array<{ path: string; depth: number }>;
  longestStrings: Array<{ path: string; length: number; preview: string }>;
}

const TOP_N = 8;

/** Compute structural statistics for a JSON document. Throws on invalid JSON. */
export function computeStats(text: string, parsed: unknown = JSON.parse(text)): JsonStats {
  const encoder = new TextEncoder();
  const stats: JsonStats = {
    totalKeys: 0, totalValues: 0, maxDepth: 0,
    fileSize: encoder.encode(text).length,
    prettySize: encoder.encode(JSON.stringify(parsed, null, 2)).length,
    minifiedSize: encoder.encode(JSON.stringify(parsed)).length,
    types: { object: 0, array: 0, string: 0, number: 0, boolean: 0, null: 0 },
    largestArrays: [], deepestPaths: [], longestStrings: [],
  };

  const arrays: Array<{ path: string; size: number }> = [];
  const leaves: Array<{ path: string; depth: number }> = [];
  const strings: Array<{ path: string; length: number; preview: string }> = [];

  // Iterative walk so deeply nested documents cannot overflow the call stack.
  const work: Array<{ value: unknown; path: string; depth: number }> = [{ value: parsed, path: '$', depth: 0 }];
  while (work.length > 0) {
    const { value, path, depth } = work.pop()!;
    stats.maxDepth = Math.max(stats.maxDepth, depth);

    if (value === null) { stats.types.null++; stats.totalValues++; leaves.push({ path, depth }); continue; }
    if (typeof value === 'boolean') { stats.types.boolean++; stats.totalValues++; leaves.push({ path, depth }); continue; }
    if (typeof value === 'number') { stats.types.number++; stats.totalValues++; leaves.push({ path, depth }); continue; }
    if (typeof value === 'string') {
      stats.types.string++; stats.totalValues++;
      leaves.push({ path, depth });
      strings.push({ path, length: value.length, preview: value.slice(0, 60) + (value.length > 60 ? '…' : '') });
      continue;
    }
    if (Array.isArray(value)) {
      stats.types.array++;
      arrays.push({ path, size: value.length });
      for (let i = value.length - 1; i >= 0; i--) work.push({ value: value[i], path: `${path}[${i}]`, depth: depth + 1 });
      continue;
    }
    if (typeof value === 'object') {
      stats.types.object++;
      const entries = Object.entries(value as Record<string, unknown>);
      stats.totalKeys += entries.length;
      for (let i = entries.length - 1; i >= 0; i--) {
        const [k, v] = entries[i];
        work.push({ value: v, path: `${path}.${k}`, depth: depth + 1 });
      }
    }
  }

  stats.largestArrays = arrays.sort((a, b) => b.size - a.size).slice(0, TOP_N);
  stats.deepestPaths = leaves.sort((a, b) => b.depth - a.depth).slice(0, TOP_N);
  stats.longestStrings = strings.sort((a, b) => b.length - a.length).slice(0, TOP_N);
  return stats;
}
