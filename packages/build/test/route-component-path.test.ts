import { describe, expect, it } from 'vitest';
import { getRouteComponentEntryName } from '../src/pipeline/stage-routes.js';

describe('route component entry names', () => {
  it('keeps distinct component paths collision-free', () => {
    const flatPath = getRouteComponentEntryName('app/foo-bar/layout.tsx');
    const nestedPath = getRouteComponentEntryName('app/foo/bar/layout.tsx');

    expect(flatPath).not.toBe(nestedPath);
    expect(flatPath).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(nestedPath).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('normalizes platform path separators', () => {
    expect(getRouteComponentEntryName('app\\foo\\layout.tsx')).toBe(
      getRouteComponentEntryName('app/foo/layout.tsx')
    );
  });
});
