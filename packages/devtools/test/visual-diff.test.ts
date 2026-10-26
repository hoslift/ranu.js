import { describe, it, expect } from 'vitest';
import { computeLineDiff, computePatchSummary } from '../src/diff.js';

describe('Zero-dependency Visual Diff Engine', () => {
  it('returns empty array for empty inputs', () => {
    const diff = computeLineDiff('', '');
    expect(diff).toEqual([]);
    expect(computePatchSummary('test.ts', '', '')).toBe('test.ts: +0 -0 lines');
  });

  it('computes pure additions when original is empty', () => {
    const modified = 'import React from "react";\nexport const x = 1;';
    const diff = computeLineDiff('', modified);

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      type: 'added',
      content: 'import React from "react";',
      modifiedLineNumber: 1,
    });
    expect(diff[1]).toEqual({
      type: 'added',
      content: 'export const x = 1;',
      modifiedLineNumber: 2,
    });

    const summary = computePatchSummary('src/x.ts', '', modified);
    expect(summary).toBe('src/x.ts: +2 -0 lines');
  });

  it('computes pure removals when modified is empty', () => {
    const original = 'const a = 1;\nconst b = 2;';
    const diff = computeLineDiff(original, '');

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      type: 'removed',
      content: 'const a = 1;',
      originalLineNumber: 1,
    });
    expect(diff[1]).toEqual({
      type: 'removed',
      content: 'const b = 2;',
      originalLineNumber: 2,
    });

    const summary = computePatchSummary('src/x.ts', original, '');
    expect(summary).toBe('src/x.ts: +0 -2 lines');
  });

  it('computes unchanged diff when original and modified are identical', () => {
    const code = 'function hello() {\n  return "world";\n}';
    const diff = computeLineDiff(code, code);

    expect(diff).toHaveLength(3);
    for (let i = 0; i < diff.length; i++) {
      expect(diff[i]?.type).toBe('unchanged');
      expect(diff[i]?.originalLineNumber).toBe(i + 1);
      expect(diff[i]?.modifiedLineNumber).toBe(i + 1);
    }

    const summary = computePatchSummary('app/hello.ts', code, code);
    expect(summary).toBe('app/hello.ts: +0 -0 lines');
  });

  it('identifies single line replacements with correct deletion and addition', () => {
    const original = 'const title = "Welcome";';
    const modified = 'const title = "Welcome to Ranu";';
    const diff = computeLineDiff(original, modified);

    expect(diff).toHaveLength(2);
    expect(diff[0]).toEqual({
      type: 'removed',
      content: 'const title = "Welcome";',
      originalLineNumber: 1,
    });
    expect(diff[1]).toEqual({
      type: 'added',
      content: 'const title = "Welcome to Ranu";',
      modifiedLineNumber: 1,
    });

    const summary = computePatchSummary('app/title.ts', original, modified);
    expect(summary).toBe('app/title.ts: +1 -1 lines');
  });

  it('accurately computes diffs with common prefix and suffix', () => {
    const original = [
      '// header',
      'function sum(a, b) {',
      '  return a + b;',
      '}',
      '// footer',
    ].join('\n');

    const modified = [
      '// header',
      'function sum(a: number, b: number): number {',
      '  return a + b;',
      '}',
      '// footer',
    ].join('\n');

    const diff = computeLineDiff(original, modified);

    expect(diff).toHaveLength(6);
    expect(diff[0]?.type).toBe('unchanged');
    expect(diff[0]?.content).toBe('// header');
    expect(diff[0]?.originalLineNumber).toBe(1);
    expect(diff[0]?.modifiedLineNumber).toBe(1);

    expect(diff[1]?.type).toBe('removed');
    expect(diff[1]?.content).toBe('function sum(a, b) {');
    expect(diff[1]?.originalLineNumber).toBe(2);

    expect(diff[2]?.type).toBe('added');
    expect(diff[2]?.content).toBe('function sum(a: number, b: number): number {');
    expect(diff[2]?.modifiedLineNumber).toBe(2);

    expect(diff[3]?.type).toBe('unchanged');
    expect(diff[3]?.content).toBe('  return a + b;');

    expect(diff[4]?.type).toBe('unchanged');
    expect(diff[4]?.content).toBe('}');

    expect(diff[5]?.type).toBe('unchanged');
    expect(diff[5]?.content).toBe('// footer');

    const summary = computePatchSummary('utils/math.ts', original, modified);
    expect(summary).toBe('utils/math.ts: +1 -1 lines');
  });

  it('handles multi-line additions in the middle of a file', () => {
    const original = 'start\nend';
    const modified = 'start\nmiddle 1\nmiddle 2\nend';
    const diff = computeLineDiff(original, modified);

    expect(diff).toHaveLength(4);
    expect(diff[0]?.type).toBe('unchanged');
    expect(diff[1]?.type).toBe('added');
    expect(diff[1]?.content).toBe('middle 1');
    expect(diff[1]?.modifiedLineNumber).toBe(2);
    expect(diff[2]?.type).toBe('added');
    expect(diff[2]?.content).toBe('middle 2');
    expect(diff[2]?.modifiedLineNumber).toBe(3);
    expect(diff[3]?.type).toBe('unchanged');
    expect(diff[3]?.content).toBe('end');
    expect(diff[3]?.originalLineNumber).toBe(2);
    expect(diff[3]?.modifiedLineNumber).toBe(4);

    expect(computePatchSummary('file.txt', original, modified)).toBe('file.txt: +2 -0 lines');
  });

  it('handles CRLF line endings transparently', () => {
    const original = 'line 1\r\nline 2\r\nline 3';
    const modified = 'line 1\r\nline 2 modified\r\nline 3';
    const diff = computeLineDiff(original, modified);

    expect(diff).toHaveLength(4);
    expect(diff[0]?.type).toBe('unchanged');
    expect(diff[1]?.type).toBe('removed');
    expect(diff[1]?.content).toBe('line 2');
    expect(diff[2]?.type).toBe('added');
    expect(diff[2]?.content).toBe('line 2 modified');
    expect(diff[3]?.type).toBe('unchanged');
  });

  it('handles complex multi-hunk diffs cleanly', () => {
    const original = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].join('\n');
    const modified = ['A', 'B_mod', 'C', 'D', 'E_new', 'E', 'G'].join('\n');

    const diff = computeLineDiff(original, modified);
    const adds = diff.filter((d) => d.type === 'added').length;
    const rems = diff.filter((d) => d.type === 'removed').length;
    const unchanged = diff.filter((d) => d.type === 'unchanged').length;

    expect(adds).toBe(2); // B_mod, E_new
    expect(rems).toBe(2); // B, F
    expect(unchanged).toBe(5); // A, C, D, E, G
    expect(computePatchSummary('hunk.ts', original, modified)).toBe('hunk.ts: +2 -2 lines');
  });
});
