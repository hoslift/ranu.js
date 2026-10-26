import type { DiffLine } from './types.js';

/**
 * Computes a line-by-line diff between original and modified text using
 * an optimized Longest Common Subsequence (LCS) algorithm with common prefix
 * and suffix trimming. Zero external dependencies.
 */
export function computeLineDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.length > 0 ? original.split(/\r?\n/) : [];
  const modLines = modified.length > 0 ? modified.split(/\r?\n/) : [];

  if (origLines.length === 0 && modLines.length === 0) {
    return [];
  }

  if (origLines.length === 0) {
    return modLines.map((content, idx) => ({
      type: 'added',
      content,
      modifiedLineNumber: idx + 1,
    }));
  }

  if (modLines.length === 0) {
    return origLines.map((content, idx) => ({
      type: 'removed',
      content,
      originalLineNumber: idx + 1,
    }));
  }

  // 1. Trim common prefix
  let start = 0;
  while (
    start < origLines.length &&
    start < modLines.length &&
    origLines[start] === modLines[start]
  ) {
    start++;
  }

  // 2. Trim common suffix
  let origEnd = origLines.length - 1;
  let modEnd = modLines.length - 1;
  while (
    origEnd >= start &&
    modEnd >= start &&
    origLines[origEnd] === modLines[modEnd]
  ) {
    origEnd--;
    modEnd--;
  }

  const results: DiffLine[] = [];

  // Emit common prefix
  for (let k = 0; k < start; k++) {
    results.push({
      type: 'unchanged',
      content: origLines[k]!,
      originalLineNumber: k + 1,
      modifiedLineNumber: k + 1,
    });
  }

  // Emit middle diff
  const N = origEnd - start + 1;
  const M = modEnd - start + 1;

  if (N > 0 && M === 0) {
    for (let k = 0; k < N; k++) {
      results.push({
        type: 'removed',
        content: origLines[start + k]!,
        originalLineNumber: start + k + 1,
      });
    }
  } else if (M > 0 && N === 0) {
    for (let k = 0; k < M; k++) {
      results.push({
        type: 'added',
        content: modLines[start + k]!,
        modifiedLineNumber: start + k + 1,
      });
    }
  } else if (N > 0 && M > 0) {
    const dp = new Int32Array((N + 1) * (M + 1));
    const stride = M + 1;

    for (let i = 1; i <= N; i++) {
      const origLine = origLines[start + i - 1];
      for (let j = 1; j <= M; j++) {
        if (origLine === modLines[start + j - 1]) {
          dp[i * stride + j] = dp[(i - 1) * stride + (j - 1)]! + 1;
        } else {
          const up = dp[(i - 1) * stride + j]!;
          const left = dp[i * stride + (j - 1)]!;
          dp[i * stride + j] = up >= left ? up : left;
        }
      }
    }

    const middleEdits: DiffLine[] = [];
    let i = N;
    let j = M;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origLines[start + i - 1] === modLines[start + j - 1]) {
        middleEdits.push({
          type: 'unchanged',
          content: origLines[start + i - 1]!,
          originalLineNumber: start + i,
          modifiedLineNumber: start + j,
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i * stride + (j - 1)]! >= dp[(i - 1) * stride + j]!)) {
        middleEdits.push({
          type: 'added',
          content: modLines[start + j - 1]!,
          modifiedLineNumber: start + j,
        });
        j--;
      } else if (i > 0) {
        middleEdits.push({
          type: 'removed',
          content: origLines[start + i - 1]!,
          originalLineNumber: start + i,
        });
        i--;
      }
    }

    middleEdits.reverse();
    results.push(...middleEdits);
  }

  // Emit common suffix
  const suffixLen = origLines.length - 1 - origEnd;
  for (let k = 0; k < suffixLen; k++) {
    const origLineNum = origEnd + 1 + k + 1;
    const modLineNum = modEnd + 1 + k + 1;
    results.push({
      type: 'unchanged',
      content: origLines[origEnd + 1 + k]!,
      originalLineNumber: origLineNum,
      modifiedLineNumber: modLineNum,
    });
  }

  return results;
}

/**
 * Computes a concise summary string of patch additions and deletions for a given file.
 */
export function computePatchSummary(filePath: string, original: string, modified: string): string {
  const diff = computeLineDiff(original, modified);
  let additions = 0;
  let deletions = 0;

  for (const line of diff) {
    if (line.type === 'added') additions++;
    else if (line.type === 'removed') deletions++;
  }

  return `${filePath}: +${additions} -${deletions} lines`;
}
