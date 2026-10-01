import { describe, expect, it } from 'vitest';
import {
  getRouteComponentEntryName,
  getRouteOutputRelativePath,
} from '../src/pipeline/stage-routes.js';

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
      getRouteComponentEntryName('app/foo/layout.tsx'),
    );
  });
});

describe('getRouteOutputRelativePath', () => {
  it('correctly maps static and dynamic route IDs to file-safe paths', () => {
    expect(getRouteOutputRelativePath('page:/')).toBe('server/routes/page-root.mjs');
    expect(getRouteOutputRelativePath('page:/products')).toBe('server/routes/page-products.mjs');
    expect(getRouteOutputRelativePath('page:/products/[id]')).toBe(
      'server/routes/page-products-id.mjs',
    );
    expect(getRouteOutputRelativePath('page:/blog/[...slug]')).toBe(
      'server/routes/page-blog-catchall-slug.mjs',
    );
    expect(getRouteOutputRelativePath('page:/docs/[[...slug]]')).toBe(
      'server/routes/page-docs-optcatchall-slug.mjs',
    );
    expect(getRouteOutputRelativePath('api:/api/users')).toBe('server/routes/api-api-users.mjs');
  });

  it('resists ReDoS attacks from malicious unclosed bracket sequences', () => {
    const maliciousInput = 'page:/' + '[...'.repeat(25000);
    const startTime = Date.now();
    const result = getRouteOutputRelativePath(maliciousInput);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
    expect(typeof result).toBe('string');
  });
});
