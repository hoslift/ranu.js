import { describe, it, expect } from 'vitest';
import { evaluateStaticRoute, isUnsafeSegmentValue } from '../src/index.js';
import type { CompiledRoutePattern } from '@ranu/router';

describe('Phase 15 Stage 15A: Static Route Analysis & generateStaticParams Evaluator', () => {
  describe('isUnsafeSegmentValue', () => {
    it('accepts safe logical segment strings', () => {
      expect(isUnsafeSegmentValue('valid')).toBe(false);
      expect(isUnsafeSegmentValue('valid-segment_123')).toBe(false);
      expect(isUnsafeSegmentValue('hello world')).toBe(false);
      expect(isUnsafeSegmentValue('über-post')).toBe(false);
    });

    it('rejects path traversal, slashes, backslashes, NUL, and drive letters', () => {
      expect(isUnsafeSegmentValue('.')).toBe(true);
      expect(isUnsafeSegmentValue('..')).toBe(true);
      expect(isUnsafeSegmentValue('foo/bar')).toBe(true);
      expect(isUnsafeSegmentValue('foo\\bar')).toBe(true);
      expect(isUnsafeSegmentValue('foo\0bar')).toBe(true);
      expect(isUnsafeSegmentValue('C:file')).toBe(true);
      expect(isUnsafeSegmentValue('d:test')).toBe(true);
      expect(isUnsafeSegmentValue('')).toBe(true);
    });
  });

  describe('evaluateStaticRoute', () => {
    it('ignores non-static routes (renderMode = server)', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [{ kind: 'static', value: 'about' }],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/about',
        pathnameTemplate: '/about',
        pattern,
        params: [],
        renderMode: 'server',
      });

      expect(result.isStatic).toBe(false);
      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });

    it('evaluates literal static route without dynamic parameters directly', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [{ kind: 'static', value: 'contact' }],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/contact',
        pathnameTemplate: '/contact',
        pattern,
        params: [],
        renderMode: 'static',
      });

      expect(result.isStatic).toBe(true);
      expect(result.paths).toEqual([
        {
          pathname: '/contact',
          params: {},
        },
      ]);
      expect(result.diagnostics).toEqual([]);
    });

    it('evaluates root literal static route /', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/',
        pathnameTemplate: '/',
        pattern,
        params: [],
        renderMode: 'static',
      });

      expect(result.isStatic).toBe(true);
      expect(result.paths).toEqual([
        {
          pathname: '/',
          params: {},
        },
      ]);
      expect(result.diagnostics).toEqual([]);
    });

    it('fails with diagnostic when dynamic static route is missing generateStaticParams', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: undefined,
      });

      expect(result.isStatic).toBe(true);
      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_MISSING_GENERATOR');
      expect(result.diagnostics[0]?.message).toContain('missing the required generateStaticParams() export');
    });

    it('evaluates simple dynamic segment with sync or async generator', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      // Async generator
      const asyncResult = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: async () => [{ slug: 'intro' }, { slug: 'getting-started' }],
      });

      expect(asyncResult.isStatic).toBe(true);
      expect(asyncResult.diagnostics).toEqual([]);
      expect(asyncResult.paths).toEqual([
        { pathname: '/blog/getting-started', params: { slug: 'getting-started' } },
        { pathname: '/blog/intro', params: { slug: 'intro' } },
      ]);

      // Sync generator
      const syncResult = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [{ slug: 'post-1' }],
      });

      expect(syncResult.paths).toEqual([
        { pathname: '/blog/post-1', params: { slug: 'post-1' } },
      ]);
    });

    it('evaluates multiple dynamic segments with exact key matching', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'posts' },
          { kind: 'dynamic', param: 'year' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/posts/[year]/[slug]',
        pathnameTemplate: '/posts/[year]/[slug]',
        pattern,
        params: ['year', 'slug'],
        renderMode: 'static',
        generatorFn: () => [
          { year: '2026', slug: 'release' },
          { year: '2025', slug: 'announcement' },
        ],
      });

      expect(result.diagnostics).toEqual([]);
      // Alphabetical sorting by pathname
      expect(result.paths).toEqual([
        { pathname: '/posts/2025/announcement', params: { year: '2025', slug: 'announcement' } },
        { pathname: '/posts/2026/release', params: { year: '2026', slug: 'release' } },
      ]);
    });

    it('evaluates required catch-all segment', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'catch-all', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/docs/[...slug]',
        pathnameTemplate: '/docs/[...slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [
          { slug: ['guide', 'routing'] },
          { slug: ['api', 'v1', 'reference'] },
        ],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.paths).toEqual([
        { pathname: '/docs/api/v1/reference', params: { slug: ['api', 'v1', 'reference'] } },
        { pathname: '/docs/guide/routing', params: { slug: ['guide', 'routing'] } },
      ]);
    });

    it('rejects required catch-all with empty array', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'catch-all', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/docs/[...slug]',
        pathnameTemplate: '/docs/[...slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [{ slug: [] }],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_CATCH_ALL_EMPTY');
    });

    it('evaluates optional catch-all with empty array (root) and nested paths', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'optional-catch-all', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/docs/[[...slug]]',
        pathnameTemplate: '/docs/[[...slug]]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [
          { slug: [] }, // matches /docs
          { slug: ['intro'] }, // matches /docs/intro
        ],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.paths).toEqual([
        { pathname: '/docs', params: { slug: [] } },
        { pathname: '/docs/intro', params: { slug: ['intro'] } },
      ]);
    });

    it('rejects invalid parameter scalar types (number, boolean, null, undefined, object)', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'items' },
          { kind: 'dynamic', param: 'id' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/items/[id]',
        pathnameTemplate: '/items/[id]',
        pattern,
        params: ['id'],
        renderMode: 'static',
        generatorFn: () => [
          { id: 123 },
          { id: true },
          { id: null },
          { id: undefined },
          { id: {} },
        ],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(4);
      expect(result.diagnostics.every(d => d.code === 'RANU_SSG_INVALID_PARAM_VALUE' || d.code === 'RANU_SSG_PARAM_KEY_MISMATCH')).toBe(true);
    });

    it('rejects scalar string for catch-all segment', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'docs' },
          { kind: 'catch-all', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/docs/[...slug]',
        pathnameTemplate: '/docs/[...slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [{ slug: 'invalid-string' }],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_INVALID_PARAM_VALUE');
    });

    it('rejects missing or extra parameter keys', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [
          {}, // missing slug
          { slug: 'valid', extra: 'unexpected' }, // extra key
        ],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(2);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_PARAM_KEY_MISMATCH');
      expect(result.diagnostics[1]?.code).toBe('RANU_SSG_PARAM_KEY_MISMATCH');
    });

    it('protects against forbidden prototype pollution keys (__proto__, constructor, prototype)', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [
          JSON.parse('{"slug": "test", "__proto__": {"polluted": true}}'),
          { slug: 'test', constructor: 'bad' },
          { slug: 'test', prototype: 'bad' },
        ],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
      expect(result.diagnostics.some(d => d.code === 'RANU_SSG_FORBIDDEN_PARAM_KEY')).toBe(true);
    });

    it('rejects path traversal patterns in dynamic parameters', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'files' },
          { kind: 'dynamic', param: 'name' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/files/[name]',
        pathnameTemplate: '/files/[name]',
        pattern,
        params: ['name'],
        renderMode: 'static',
        generatorFn: () => [
          { name: '..' },
          { name: '.' },
          { name: 'sub/dir' },
          { name: 'sub\\dir' },
          { name: 'null\0byte' },
          { name: 'C:secrets' },
        ],
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(6);
      expect(result.diagnostics.every(d => d.code === 'RANU_SSG_UNSAFE_PARAM_VALUE')).toBe(true);
    });

    it('correctly URL-encodes special characters and unicode values without double encoding', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'search' },
          { kind: 'dynamic', param: 'query' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/search/[query]',
        pathnameTemplate: '/search/[query]',
        pattern,
        params: ['query'],
        renderMode: 'static',
        generatorFn: () => [
          { query: 'hello world' },
          { query: '100%' },
          { query: 'café' },
        ],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.paths).toEqual([
        { pathname: '/search/100%25', params: { query: '100%' } },
        { pathname: '/search/caf%C3%A9', params: { query: 'café' } },
        { pathname: '/search/hello%20world', params: { query: 'hello world' } },
      ]);
    });

    it('rejects duplicate concrete pathnames produced by generator', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => [
          { slug: 'post-1' },
          { slug: 'post-1' }, // duplicate!
        ],
      });

      expect(result.paths).toEqual([{ pathname: '/blog/post-1', params: { slug: 'post-1' } }]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_DUPLICATE_PATH');
      expect(result.diagnostics[0]?.message).toContain('Duplicate concrete pathname "/blog/post-1"');
    });

    it('handles empty generator result gracefully (valid, 0 paths)', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'archive' },
          { kind: 'dynamic', param: 'id' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/archive/[id]',
        pathnameTemplate: '/archive/[id]',
        pattern,
        params: ['id'],
        renderMode: 'static',
        generatorFn: () => [],
      });

      expect(result.isStatic).toBe(true);
      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });

    it('converts generator throws and rejected Promises into deterministic diagnostics', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'data' },
          { kind: 'dynamic', param: 'id' },
        ],
      };

      // Throws synchronous Error
      const throwResult = await evaluateStaticRoute({
        routeId: 'page:/data/[id]',
        pathnameTemplate: '/data/[id]',
        pattern,
        params: ['id'],
        renderMode: 'static',
        generatorFn: () => {
          throw new Error('Database connection failed');
        },
      });

      expect(throwResult.paths).toEqual([]);
      expect(throwResult.diagnostics).toHaveLength(1);
      expect(throwResult.diagnostics[0]?.code).toBe('RANU_SSG_GENERATOR_FAILED');
      expect(throwResult.diagnostics[0]?.message).toContain('Database connection failed');

      // Rejects Promise
      const rejectResult = await evaluateStaticRoute({
        routeId: 'page:/data/[id]',
        pathnameTemplate: '/data/[id]',
        pattern,
        params: ['id'],
        renderMode: 'static',
        generatorFn: async () => {
          throw new Error('API fetch timeout');
        },
      });

      expect(rejectResult.paths).toEqual([]);
      expect(rejectResult.diagnostics).toHaveLength(1);
      expect(rejectResult.diagnostics[0]?.code).toBe('RANU_SSG_GENERATOR_FAILED');
      expect(rejectResult.diagnostics[0]?.message).toContain('API fetch timeout');
    });

    it('rejects invalid top-level generator returns (null, number, object)', async () => {
      const pattern: CompiledRoutePattern = {
        segments: [
          { kind: 'static', value: 'blog' },
          { kind: 'dynamic', param: 'slug' },
        ],
      };

      const result = await evaluateStaticRoute({
        routeId: 'page:/blog/[slug]',
        pathnameTemplate: '/blog/[slug]',
        pattern,
        params: ['slug'],
        renderMode: 'static',
        generatorFn: () => ({ slug: 'not-an-array' } as any),
      });

      expect(result.paths).toEqual([]);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('RANU_SSG_INVALID_RETURN');
    });
  });
});
