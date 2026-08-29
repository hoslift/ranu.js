import { describe, it, expect } from 'vitest';
import { generateBuildId, isValidBuildId } from '../src/build-id.js';

describe('build-id', () => {
  it('generates a non-empty string ID with expected length and charset', () => {
    const id = generateBuildId();
    expect(typeof id).toBe('string');
    expect(id.length).toBe(29);
    expect(/^[a-z0-9]+$/i.test(id)).toBe(true);
  });

  it('generates unique build IDs on subsequent calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = generateBuildId();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it('generates time-sortable IDs (monotonic timestamp prefix)', async () => {
    const id1 = generateBuildId();
    await new Promise(resolve => setTimeout(resolve, 5));
    const id2 = generateBuildId();
    expect(id1.localeCompare(id2)).toBeLessThan(0);
  });

  it('validates build ID format correctly', () => {
    expect(isValidBuildId(generateBuildId())).toBe(true);
    expect(isValidBuildId('valid-id_123')).toBe(true);
    expect(isValidBuildId('')).toBe(false);
    expect(isValidBuildId('invalid id with spaces')).toBe(false);
    expect(isValidBuildId('../traversal/path')).toBe(false);
    expect(isValidBuildId('id/with/slashes')).toBe(false);
  });
});
