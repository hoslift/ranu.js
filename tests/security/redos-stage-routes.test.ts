import { describe, it, expect } from 'vitest';
import { getRouteOutputRelativePath } from '@ranu/build';

describe('Security: Route Output Path ReDoS & Identifier Sanitization (CWE-1333)', () => {
  it('correctly transforms standard, catch-all, and optional catch-all route identifiers', () => {
    expect(getRouteOutputRelativePath('page:/')).toBe('server/routes/page-root.mjs');
    expect(getRouteOutputRelativePath('page:/items/[id]')).toBe('server/routes/page-items-id.mjs');
    expect(getRouteOutputRelativePath('page:/docs/[...slug]')).toBe(
      'server/routes/page-docs-catchall-slug.mjs',
    );
    expect(getRouteOutputRelativePath('page:/docs/[[...slug]]')).toBe(
      'server/routes/page-docs-optcatchall-slug.mjs',
    );
    expect(getRouteOutputRelativePath('api:/api/v1/auth')).toBe(
      'server/routes/api-api-v1-auth.mjs',
    );
  });

  it('resists polynomial ReDoS attack from pathological unclosed or repetitive route identifiers', () => {
    const maliciousRoute = 'page:/' + '[...'.repeat(25000);
    const startTime = Date.now();
    const result = getRouteOutputRelativePath(maliciousRoute);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
    expect(result).toBeDefined();
    expect(result.startsWith('server/routes/page-')).toBe(true);
  });

  it('resists polynomial ReDoS attack on nested brackets without closing brackets', () => {
    const maliciousRoute = 'page:/' + '[[...'.repeat(20000);
    const startTime = Date.now();
    const result = getRouteOutputRelativePath(maliciousRoute);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
    expect(result).toBeDefined();
  });
});
