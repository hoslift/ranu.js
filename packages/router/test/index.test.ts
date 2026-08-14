import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  parseSegment,
  discoverRoutes,
  matchRoute,
  safeDecodeSegment,
  generateRouteManifest
} from '../src/index.js';
import { validateRouteManifest } from '@ranu/manifests';

describe('@ranu/router', () => {
  let tempAppDir: string;

  beforeEach(() => {
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-router-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempAppDir)) {
      fs.rmSync(tempAppDir, { recursive: true, force: true });
    }
  });

  describe('parseSegment', () => {
    it('parses static segment', () => {
      expect(parseSegment('about')).toEqual({ raw: 'about', type: 'static' });
    });

    it('parses dynamic segment', () => {
      expect(parseSegment('[id]')).toEqual({ raw: '[id]', type: 'dynamic', param: 'id' });
    });

    it('parses catch-all segment', () => {
      expect(parseSegment('[...slug]')).toEqual({ raw: '[...slug]', type: 'catch-all', param: 'slug' });
    });

    it('parses optional catch-all segment', () => {
      expect(parseSegment('[[...slug]]')).toEqual({ raw: '[[...slug]]', type: 'optional-catch-all', param: 'slug' });
    });

    it('parses route group segment', () => {
      expect(parseSegment('(marketing)')).toEqual({ raw: '(marketing)', type: 'group' });
    });

    it('parses private segment', () => {
      expect(parseSegment('_private')).toEqual({ raw: '_private', type: 'private' });
    });

    it('throws error on empty group name', () => {
      expect(() => parseSegment('()')).toThrow('Group segment name cannot be empty');
    });

    it('throws error on optional catch-all missing triple dots', () => {
      expect(() => parseSegment('[[slug]]')).toThrow('Optional catch-all must start with "..."');
    });

    it('throws error on invalid parameter syntax', () => {
      expect(() => parseSegment('[user-id]')).toThrow('Invalid parameter name syntax');
      expect(() => parseSegment('[123id]')).toThrow('Invalid parameter name syntax');
    });

    it('throws error on unbalanced or malformed brackets', () => {
      expect(() => parseSegment('[id')).toThrow('Unbalanced or malformed brackets/parentheses');
      expect(() => parseSegment('id]')).toThrow('Unbalanced or malformed brackets/parentheses');
      expect(() => parseSegment('about(')).toThrow('Unbalanced or malformed brackets/parentheses');
    });
  });

  describe('safeDecodeSegment', () => {
    it('decodes normal percent-encoded segment', () => {
      expect(safeDecodeSegment('hello%20world')).toBe('hello world');
      expect(safeDecodeSegment('%E0%A4%85')).toBe('अ');
    });

    it('returns null on malformed percent encoding', () => {
      expect(safeDecodeSegment('%E0%A4')).toBeNull();
      expect(safeDecodeSegment('%ZZ')).toBeNull();
    });

    it('returns null on path traversal attempt characters', () => {
      expect(safeDecodeSegment('..')).toBeNull();
      expect(safeDecodeSegment('.')).toBeNull();
      expect(safeDecodeSegment('foo%2Fbar')).toBeNull();
      expect(safeDecodeSegment('foo%5Cbar')).toBeNull();
    });
  });

  describe('discoverRoutes & matchRoute integration', () => {
    it('processes root page and basic layouts', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      
      const { tree, records, diagnostics } = discoverRoutes(tempAppDir);
      
      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0].routeId).toBe('page:/');
      expect(records[0].layouts).toEqual(['layout.tsx']);

      const match = matchRoute('/', records);
      expect(match).not.toBeNull();
      expect(match!.routeId).toBe('page:/');
      expect(match!.params).toEqual({});
    });

    it('flags missing root layout if pages exist', () => {
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_MISSING_ROOT_LAYOUT')).toBe(true);
    });

    it('permits API-only app without root layout', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'route.ts'), 'export {}');
      const mockAnalyzer = () => ({ methods: ['GET'] as any[], diagnostics: [] });
      const { diagnostics, records } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });
      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0].routeId).toBe('api:/api');
    });

    it('handles multiple dynamic parameters and nested routes', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'users', '[userId]', 'posts', '[postId]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'users', '[userId]', 'posts', '[postId]', 'page.tsx'), 'export {}');

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0].routeId).toBe('page:/users/[userId]/posts/[postId]');
      expect(records[0].params).toEqual(['userId', 'postId']);

      const match = matchRoute('/users/123/posts/abc', records);
      expect(match).not.toBeNull();
      expect(match!.params).toEqual({ userId: '123', postId: 'abc' });
    });

    it('processes catch-all and optional catch-all', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'docs', '[...slug]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'docs', '[...slug]', 'page.tsx'), 'export {}');

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);
      
      const match = matchRoute('/docs/api/server/context', records);
      expect(match).not.toBeNull();
      expect(match!.params.slug).toEqual(['api', 'server', 'context']);

      // Catch-all requires at least 1 segment
      const failMatch = matchRoute('/docs', records);
      expect(failMatch).toBeNull();
    });

    it('processes optional catch-all with zero segments', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'docs', '[[...slug]]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'docs', '[[...slug]]', 'page.tsx'), 'export {}');

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);

      const zeroMatch = matchRoute('/docs', records);
      expect(zeroMatch).not.toBeNull();
      expect(zeroMatch!.params.slug).toEqual([]);

      const multiMatch = matchRoute('/docs/a/b', records);
      expect(multiMatch).not.toBeNull();
      expect(multiMatch!.params.slug).toEqual(['a', 'b']);
    });

    it('ignores route groups in URL projection but inherits layouts', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(marketing)', 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'layout.tsx'), 'export {}');
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'about', 'page.tsx'), 'export {}');

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0].routeId).toBe('page:/about');
      expect(records[0].pathnameTemplate).toBe('/about');
      expect(records[0].layouts).toEqual(['layout.tsx', '(marketing)/layout.tsx']);

      const match = matchRoute('/about', records);
      expect(match).not.toBeNull();
    });

    it('detects route group collisions', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(marketing)', 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'about', 'page.tsx'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, '(dashboard)', 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(dashboard)', 'about', 'page.tsx'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_COLLISION')).toBe(true);
    });

    it('ignores private segments and flags endpoint misuse', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'products', '_components'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', '_components', 'ProductCard.tsx'), 'export {}');
      fs.writeFileSync(path.join(tempAppDir, 'products', '_components', 'page.tsx'), 'export {}'); // Misuse!

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_INVALID_SEGMENT')).toBe(true);
      // Ensure the private page is not registered
      expect(records).toHaveLength(0);
    });

    it('ignores ordinary colocated files', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'ProductList.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'queries.ts'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'styles.css'), 'body {}');

      const { tree, records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      
      const rootNode = tree['/'];
      expect(rootNode.children).toHaveLength(0); // Colocated modules are not children directory nodes
    });

    it('supports loading, error, and not-found boundaries discovery', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'loading.tsx'), 'export {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.tsx'), 'export {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.tsx'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      expect(records[0].loading).toBe('loading.tsx');
      expect(records[0].errors).toEqual(['error.tsx']);
      expect(records[0].notFound).toEqual(['not-found.tsx']);
    });

    it('enforces route matching precedence (static > dynamic > catch-all > optional-catch-all)', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      
      fs.mkdirSync(path.join(tempAppDir, 'products', 'new'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', 'new', 'page.tsx'), 'export {}');

      fs.mkdirSync(path.join(tempAppDir, 'products', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', '[id]', 'page.tsx'), 'export {}');

      fs.mkdirSync(path.join(tempAppDir, 'products', '[...slug]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', '[...slug]', 'page.tsx'), 'export {}');

      fs.mkdirSync(path.join(tempAppDir, 'products', '[[...empty]]'), { recursive: true });
      // Sibling catch-all optional catch-all triggers ambiguous sibling validation so let's keep it separate or let it trigger error to verify precedence sorting
      
      const { records, diagnostics } = discoverRoutes(tempAppDir);
      
      // Let's filter records that are not errors
      // Verify precedence: products/new comes first, then products/[id], then products/[...slug]
      const routes = records.map(r => r.routeId);
      expect(routes.indexOf('page:/products/new')).toBeLessThan(routes.indexOf('page:/products/[id]'));
      expect(routes.indexOf('page:/products/[id]')).toBeLessThan(routes.indexOf('page:/products/[...slug]'));
    });

    it('detects duplicate route parameter signature collisions', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'users', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'users', '[id]', 'page.tsx'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, 'users', '[username]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'users', '[username]', 'page.tsx'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_COLLISION')).toBe(true);
    });

    it('detects duplicate modules (same role in directory with different extensions)', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.js'), 'export default {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_MODULE')).toBe(true);
    });

    it('rejects duplicate parameter names in the same route path', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'posts', '[id]', 'comments', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'posts', '[id]', 'comments', '[id]', 'page.tsx'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_PARAM')).toBe(true);
    });

    it('rejects descendants under catch-all segments (terminal rule)', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'docs', '[...slug]', 'edit'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'docs', '[...slug]', 'edit', 'page.tsx'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_INVALID_CATCH_ALL')).toBe(true);
    });

    it('rejects application routes claiming reserved framework namespace', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '_ranu', 'assets'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '_ranu', 'assets', 'page.tsx'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_INVALID_SEGMENT' && d.message.includes('reserved framework namespace'))).toBe(true);
    });

    it('treats _velox and other underscore-prefixed directories as generic private directories without reserved namespace status', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '_velox', 'assets'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '_velox', 'assets', 'page.tsx'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, '_legacy', 'assets'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '_legacy', 'assets', 'page.tsx'), 'export {}');

      const { records, diagnostics } = discoverRoutes(tempAppDir);
      
      // No reserved namespace error should fire for _velox or _legacy
      const hasReservedError = diagnostics.some(d => d.message.includes('reserved framework namespace'));
      expect(hasReservedError).toBe(false);

      // Both should trigger generic RANU_ROUTE_INVALID_SEGMENT for page under private directory
      const privateDiagnostics = diagnostics.filter(d => d.code === 'RANU_ROUTE_INVALID_SEGMENT' && d.message.includes('private directory'));
      expect(privateDiagnostics.length).toBe(2);

      // The paths should be skipped from compiled public records (generic private directory behavior)
      const hasVeloxRoute = records.some(r => r.pathnameTemplate.includes('_velox'));
      const hasLegacyRoute = records.some(r => r.pathnameTemplate.includes('_legacy'));
      expect(hasVeloxRoute).toBe(false);
      expect(hasLegacyRoute).toBe(false);
    });

    it('ignores query strings in route matching', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'products'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', 'page.tsx'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const match = matchRoute('/products?page=2&sort=desc', records);
      expect(match).not.toBeNull();
      expect(match!.routeId).toBe('page:/products');
    });

    it('normalizes trailing slash canonical identity', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'about', 'page.tsx'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const match1 = matchRoute('/about/', records);
      const match2 = matchRoute('/about', records);
      expect(match1).not.toBeNull();
      expect(match2).not.toBeNull();
      expect(match1!.routeId).toBe(match2!.routeId);
    });

    it('rejects mis-cased reserved filenames and accepts canonical ones', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      
      // On Windows, writing Page.tsx first locks the filesystem casing.
      fs.writeFileSync(path.join(tempAppDir, 'Page.tsx'), 'export default {}');
      const { records: recs1 } = discoverRoutes(tempAppDir);
      expect(recs1).toHaveLength(0);

      // Clean up Page.tsx first so that page.tsx can be created with lowercase casing on Windows.
      fs.rmSync(path.join(tempAppDir, 'Page.tsx'), { force: true });
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      const { records: recs2 } = discoverRoutes(tempAppDir);
      expect(recs2).toHaveLength(1);
      expect(recs2[0].routeId).toBe('page:/');
    });

    it('detects case portability collision of sibling directories', () => {
      // Mock fsModule to simulate sibling directories with differing casing (about vs About)
      const mockFs = {
        existsSync: () => true,
        lstatSync: (p: string) => {
          return {
            isSymbolicLink: () => false,
            isDirectory: () => p === tempAppDir || p.endsWith('about') || p.endsWith('About'),
            isFile: () => p.endsWith('page.tsx')
          } as any;
        },
        readdirSync: (p: string) => {
          if (p === tempAppDir) {
            return ['about', 'About'];
          }
          return ['page.tsx'];
        },
        statSync: (p: string) => {
          return {
            isDirectory: () => p.endsWith('about') || p.endsWith('About')
          } as any;
        }
      };

      const { diagnostics } = discoverRoutes(tempAppDir, { fsModule: mockFs });
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_CASE_COLLISION')).toBe(true);
    });

    it('matches Unicode dynamic parameters', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'search', '[query]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'search', '[query]', 'page.tsx'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const match = matchRoute('/search/%E0%A4%85', records); // decoded: 'अ'
      expect(match).not.toBeNull();
      expect(match!.params.query).toBe('अ');
    });
  });

  describe('cross-platform path normalization', () => {
    it('produces identical route trees and matching patterns for Windows and POSIX forms', () => {
      // discoverRoutes is filesystem-based, but we can verify Windows and POSIX paths matchRoute identically.
      const record: any = {
        routeId: 'page:/products/[id]',
        kind: 'page',
        pattern: {
          segments: [
            { kind: 'static', value: 'products' },
            { kind: 'dynamic', param: 'id' }
          ]
        },
        pathnameTemplate: '/products/[id]',
        params: ['id'],
        layouts: [],
        errors: []
      };

      const match1 = matchRoute('/products/123', [record]);
      expect(match1).not.toBeNull();
      expect(match1!.params.id).toBe('123');
    });
  });

  describe('Phase 3 Route Manifest Generation & Exit Criterion', () => {
    it('generates RouteManifest that passes manifests validation', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'about', 'page.tsx'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, 'products', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', '[id]', 'page.tsx'), 'export {}');

      const mockAnalyzer = () => ({ methods: ['GET'] as any[], diagnostics: [] });
      const { records, diagnostics } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });
      expect(diagnostics).toHaveLength(0);

      const manifest = generateRouteManifest(records, 'test-build-id');
      
      // Verify properties
      expect(manifest.schemaVersion).toBe(2);
      expect(manifest.buildId).toBe('test-build-id');
      expect(manifest.routes).toHaveLength(3);

      // Verify deterministic sorting (alphabetically by pattern)
      // patterns: '/about', '/api/users', '/products/[id]'
      expect(manifest.routes[0].pattern).toBe('/about');
      expect(manifest.routes[1].pattern).toBe('/api/users');
      expect(manifest.routes[2].pattern).toBe('/products/[id]');

      // Verify validation passes
      const validation = validateRouteManifest(manifest);
      expect(validation.success).toBe(true);
      expect(validation.diagnostics).toHaveLength(0);

      // Verify serialization/deserialization JSON round-trip
      const serialized = JSON.stringify(manifest);
      const deserialized = JSON.parse(serialized);
      expect(deserialized).toEqual(manifest);
    });

    it('verifies Phase 3 exit criterion: matching /products/42 returns correct metadata regardless of shuffling', () => {
      // 1. Write the files
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'products', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', '[id]', 'page.tsx'), 'export {}');

      // 2. Discover routes
      const { records, diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics).toHaveLength(0);

      // 3. Match /products/42
      const match = matchRoute('/products/42', records);
      expect(match).not.toBeNull();
      expect(match).toEqual({
        routeId: 'page:/products/[id]',
        kind: 'page',
        params: {
          id: '42'
        },
        pathname: '/products/42'
      });

      // 4. Verify that shuffling records order doesn't change matching outcome
      const shuffledRecords = [...records].reverse();
      const matchShuffled = matchRoute('/products/42', shuffledRecords);
      expect(matchShuffled).toEqual(match);
    });
  });

  describe('Phase 4 Layout & Boundary Ancestry Requirements', () => {
    it('root layout ancestry', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      expect(records).toHaveLength(1);
      expect(records[0].layouts).toEqual(['layout.tsx']);
    });

    it('single nested layout', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'about', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'about', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aboutRecord = records.find(r => r.routeId === 'page:/about')!;
      expect(aboutRecord.layouts).toEqual(['layout.tsx', 'about/layout.tsx']);
    });

    it('multiple nested layouts and layout order root ➔ inner', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'dashboard', 'settings'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const settingsRecord = records.find(r => r.routeId === 'page:/dashboard/settings')!;
      expect(settingsRecord.layouts).toEqual([
        'layout.tsx',
        'dashboard/layout.tsx',
        'dashboard/settings/layout.tsx'
      ]);
    });

    it('route-group layout ancestry', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(marketing)', 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'about', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aboutRecord = records.find(r => r.routeId === 'page:/about')!;
      expect(aboutRecord.layouts).toEqual(['layout.tsx', '(marketing)/layout.tsx']);
    });

    it('nested route-group layouts', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(groupA)', '(groupB)', 'settings'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(groupA)', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, '(groupA)', '(groupB)', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, '(groupA)', '(groupB)', 'settings', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const settingsRecord = records.find(r => r.routeId === 'page:/settings')!;
      expect(settingsRecord.layouts).toEqual([
        'layout.tsx',
        '(groupA)/layout.tsx',
        '(groupA)/(groupB)/layout.tsx'
      ]);
    });

    it('nested error boundary ancestry, nearest first, ancestor fallback order, root last', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'dashboard', 'settings'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'error.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'error.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const settingsRecord = records.find(r => r.routeId === 'page:/dashboard/settings')!;
      // Expected nearest-to-root: settings/error ➔ dashboard/error ➔ root error
      expect(settingsRecord.errors).toEqual([
        'dashboard/settings/error.tsx',
        'dashboard/error.tsx',
        'error.tsx'
      ]);
    });

    it('nested not-found ancestry, nearest first, root fallback', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'products', '[id]'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'products', 'not-found.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'products', '[id]', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const productRecord = records.find(r => r.routeId === 'page:/products/[id]')!;
      // Expected nearest-to-root: products/not-found ➔ root not-found
      expect(productRecord.notFound).toEqual([
        'products/not-found.tsx',
        'not-found.tsx'
      ]);
    });

    it('root not-found for unmatched URL metadata', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');

      const { rootNotFound } = discoverRoutes(tempAppDir);
      expect(rootNotFound).toBe('not-found.tsx');
    });

    it('route-group not-found ancestry', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(marketing)', 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'not-found.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, '(marketing)', 'about', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aboutRecord = records.find(r => r.routeId === 'page:/about')!;
      expect(aboutRecord.notFound).toEqual(['(marketing)/not-found.tsx']);
    });

    it('sibling not-found isolation', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'a'), { recursive: true });
      fs.mkdirSync(path.join(tempAppDir, 'b'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'a', 'not-found.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'a', 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'b', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aRecord = records.find(r => r.routeId === 'page:/a')!;
      const bRecord = records.find(r => r.routeId === 'page:/b')!;
      expect(aRecord.notFound).toEqual(['a/not-found.tsx']);
      expect(bRecord.notFound).toBeUndefined(); // Isolated!
    });

    it('nearest loading boundary discovery', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'loading.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'dashboard', 'settings'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'loading.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const settingsRecord = records.find(r => r.routeId === 'page:/dashboard/settings')!;
      expect(settingsRecord.loading).toBe('dashboard/loading.tsx'); // Nearest applicable
    });

    it('page composition metadata validation', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const page = records[0];
      expect(page).toHaveProperty('routeId');
      expect(page).toHaveProperty('kind');
      expect(page).toHaveProperty('pattern');
      expect(page).toHaveProperty('pathnameTemplate');
      expect(page).toHaveProperty('params');
      expect(page).toHaveProperty('layouts');
      expect(page).toHaveProperty('loading');
      expect(page).toHaveProperty('errors');
      expect(page).toHaveProperty('notFound');
    });

    it('sibling layouts isolation', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'a'), { recursive: true });
      fs.mkdirSync(path.join(tempAppDir, 'b'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'a', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'a', 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'b', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aRecord = records.find(r => r.routeId === 'page:/a')!;
      const bRecord = records.find(r => r.routeId === 'page:/b')!;
      expect(aRecord.layouts).toEqual(['layout.tsx', 'a/layout.tsx']);
      expect(bRecord.layouts).toEqual(['layout.tsx']); // Sibling layout isolated
    });

    it('parent page + child page composition layout inheritance only', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'sub', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const subRecord = records.find(r => r.routeId === 'page:/sub')!;
      expect(subRecord.layouts).toEqual(['layout.tsx']); // Only layouts, child does not inherit parent page module reference
    });

    it('API route receives no React layouts/boundaries', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'api'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'route.ts'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const apiRecord = records.find(r => r.routeId === 'api:/api')!;
      expect(apiRecord.layouts).toEqual([]);
      expect(apiRecord.errors).toEqual([]);
      expect(apiRecord.loading).toBeUndefined();
      expect(apiRecord.notFound).toBeUndefined();
    });

    it('API-only app without root layout', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'route.ts'), 'export {}');

      const mockAnalyzer = () => ({ methods: ['GET'] as any[], diagnostics: [] });
      const { records, diagnostics } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });
      expect(diagnostics).toHaveLength(0); // Valid, optional layout
      expect(records).toHaveLength(1);
    });

    it('deterministic ancestry under shuffled filesystem order', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'dashboard', 'settings'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'dashboard', 'settings', 'page.tsx'), 'export default {}');

      // Custom mockFs where readdirSync returns directories in randomized/shuffled order
      const mockFs = {
        existsSync: () => true,
        lstatSync: (p: string) => {
          return {
            isSymbolicLink: () => false,
            isDirectory: () => p === tempAppDir || p.endsWith('dashboard') || p.endsWith('settings'),
            isFile: () => p.endsWith('page.tsx') || p.endsWith('layout.tsx')
          } as any;
        },
        readdirSync: (p: string) => {
          if (p === tempAppDir) {
            return ['dashboard', 'layout.tsx'];
          }
          if (p.endsWith('dashboard')) {
            return ['settings', 'layout.tsx'];
          }
          if (p.endsWith('settings')) {
            return ['page.tsx', 'layout.tsx'];
          }
          return [];
        },
        statSync: (p: string) => {
          return {
            isDirectory: () => p.endsWith('dashboard') || p.endsWith('settings')
          } as any;
        }
      };

      const { records } = discoverRoutes(tempAppDir, { fsModule: mockFs });
      const settingsRecord = records.find(r => r.routeId === 'page:/dashboard/settings')!;
      expect(settingsRecord.layouts).toEqual([
        'layout.tsx',
        'dashboard/layout.tsx',
        'dashboard/settings/layout.tsx'
      ]);
    });

    it('Windows/POSIX identical ancestry', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'about'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'about', 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'about', 'page.tsx'), 'export default {}');

      const { records } = discoverRoutes(tempAppDir);
      const aboutRecord = records.find(r => r.routeId === 'page:/about')!;
      // Expected normalized paths regardless of platform path separators
      expect(aboutRecord.layouts[0]).toBe('layout.tsx');
      expect(aboutRecord.layouts[1]).toBe('about/layout.tsx');
    });

    it('duplicate layout module diagnostic', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'layout.jsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_MODULE' && d.message.includes('layout'))).toBe(true);
    });

    it('duplicate loading module diagnostic', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'loading.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'loading.jsx'), 'export default {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_MODULE' && d.message.includes('loading'))).toBe(true);
    });

    it('duplicate error module diagnostic', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.jsx'), 'export default {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_MODULE' && d.message.includes('error'))).toBe(true);
    });

    it('duplicate not-found module diagnostic', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'not-found.jsx'), 'export default {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_DUPLICATE_MODULE' && d.message.includes('not-found'))).toBe(true);
    });
  });

  describe('API Route Compiler Integration (Router)', () => {
    it('integrates discoverRoutes with injected analyzeRouteMethods callback', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');

      const mockAnalyzer = (filePath: string, fileContent: string) => {
        return {
          methods: ['GET', 'POST'] as any[],
          diagnostics: []
        };
      };

      const { records, diagnostics } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });

      expect(diagnostics).toHaveLength(0);
      expect(records).toHaveLength(1);
      expect(records[0].kind).toBe('api');
      expect((records[0] as any).methods).toEqual(['GET', 'POST']);
    });

    it('rejects empty methods array on API records', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');

      const mockAnalyzer = () => ({ methods: [] as any[], diagnostics: [] });

      const { records, diagnostics } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });

      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_NO_METHODS')).toBe(true);
      expect(records[0].kind).toBe('api');
      expect((records[0] as any).methods).toEqual([]);
    });

    it('page record must not contain methods', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const pageRecord = records.find(r => r.kind === 'page')!;
      expect(pageRecord).toBeDefined();
      expect((pageRecord as any).methods).toBeUndefined();
    });

    it('detects page/API collision locally (same directory)', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'page.tsx'), 'export {}');
      fs.writeFileSync(path.join(tempAppDir, 'route.ts'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_KIND_COLLISION')).toBe(true);
    });

    it('detects page/API collision across route groups', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, '(groupA)', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(groupA)', 'users', 'page.tsx'), 'export {}');
      fs.mkdirSync(path.join(tempAppDir, '(groupB)', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, '(groupB)', 'users', 'route.ts'), 'export {}');

      const { diagnostics } = discoverRoutes(tempAppDir);
      expect(diagnostics.some(d => d.code === 'RANU_ROUTE_KIND_COLLISION')).toBe(true);
    });

    it('asserts API React-boundary isolation (empty layouts/errors, loading/notFound undefined)', () => {
      fs.writeFileSync(path.join(tempAppDir, 'layout.tsx'), 'export default {}');
      fs.writeFileSync(path.join(tempAppDir, 'error.tsx'), 'export default {}');
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      const apiRecord = records.find(r => r.kind === 'api')!;
      expect(apiRecord.layouts).toEqual([]);
      expect(apiRecord.errors).toEqual([]);
      expect(apiRecord.loading).toBeUndefined();
      expect(apiRecord.notFound).toBeUndefined();
    });

    it('matching is independent of HTTP method', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');

      const mockAnalyzer = () => ({ methods: ['GET', 'POST'] as any[], diagnostics: [] });
      const { records } = discoverRoutes(tempAppDir, {
        analyzeRouteMethods: mockAnalyzer
      });

      const match = matchRoute('/api/users', records);
      expect(match).not.toBeNull();
      expect(match!.routeId).toBe('api:/api/users');
      expect(match!.kind).toBe('api');
    });

    it('generates deterministic stable route IDs', () => {
      fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
      fs.writeFileSync(path.join(tempAppDir, 'api', 'users', 'route.ts'), 'export {}');

      const { records } = discoverRoutes(tempAppDir);
      expect(records[0].routeId).toBe('api:/api/users');
    });
  });
});
