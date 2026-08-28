import { describe, it, expect } from 'vitest';
import {
  MANIFEST_SCHEMA_VERSION,
  validateBuildDescriptor,
  validateRouteManifest,
  validateServerManifest,
  validateClientManifest,
  validateStaticManifest,
  isAbsolutePath,
  type BuildDescriptor,
  type RouteManifest,
  type ServerManifest,
  type ClientManifest,
  type StaticManifest,
} from '../src/index.js';

describe('@ranu/manifests', () => {
  it('exports correct MANIFEST_SCHEMA_VERSION', () => {
    expect(MANIFEST_SCHEMA_VERSION).toBe(1);
  });

  describe('isAbsolutePath helper', () => {
    it('detects Unix and Windows absolute paths', () => {
      expect(isAbsolutePath('/usr/bin')).toBe(true);
      expect(isAbsolutePath('\\server\\share')).toBe(true);
      expect(isAbsolutePath('C:\\project\\src')).toBe(true);
      expect(isAbsolutePath('d:/project/src')).toBe(true);
      expect(isAbsolutePath('./relative/path')).toBe(false);
      expect(isAbsolutePath('relative/path')).toBe(false);
    });
  });

  describe('BuildDescriptor validation', () => {
    it('passes for a valid BuildDescriptor', () => {
      const desc: BuildDescriptor = {
        schemaVersion: 1,
        buildId: 'build_123',
        frameworkVersion: '0.0.0',
        runtime: 'node',
        manifests: {
          routes: './routes.json',
          server: './server.json',
          client: './client.json',
          static: './static.json',
        },
      };
      const result = validateBuildDescriptor(desc);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('rejects invalid schema version', () => {
      const desc = {
        schemaVersion: 99,
        buildId: 'build_123',
        frameworkVersion: '0.0.0',
        runtime: 'node',
        manifests: {
          routes: './routes.json',
          server: './server.json',
          client: './client.json',
          static: './static.json',
        },
      };
      const result = validateBuildDescriptor(desc);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_SERVER_MANIFEST_VERSION');
    });

    it('rejects unsupported runtimes', () => {
      const desc = {
        schemaVersion: 1,
        buildId: 'build_123',
        frameworkVersion: '0.0.0',
        runtime: 'vercel', // Unsupported provider target in core
        manifests: {
          routes: './routes.json',
          server: './server.json',
          client: './client.json',
          static: './static.json',
        },
      };
      const result = validateBuildDescriptor(desc as any);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('Unsupported build runtime target');
    });

    it('rejects absolute paths inside descriptor', () => {
      const desc = {
        schemaVersion: 1,
        buildId: 'build_123',
        frameworkVersion: '0.0.0',
        runtime: 'node',
        manifests: {
          routes: '/absolute/routes.json',
          server: './server.json',
          client: './client.json',
          static: './static.json',
        },
      };
      const result = validateBuildDescriptor(desc);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('cannot be an absolute path');
    });
  });

  describe('RouteManifest validation', () => {
    it('passes for valid sorted RouteManifest', () => {
      const manifest: RouteManifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          { id: 'page:/about', kind: 'page', pattern: '/about', renderMode: 'static', params: [] },
          {
            id: 'api:/api/users',
            kind: 'api',
            pattern: '/api/users',
            params: [],
            methods: ['GET', 'POST'],
          },
          {
            id: 'page:/products/[id]',
            kind: 'page',
            pattern: '/products/[id]',
            renderMode: 'server',
            params: ['id'],
          },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('validates page component metadata paths', () => {
      const valid = validateRouteManifest({
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [{
          id: 'page:/about',
          kind: 'page',
          pattern: '/about',
          params: [],
          layouts: ['app/layout.tsx'],
          loading: 'app/loading.tsx',
          errors: ['app/error.tsx'],
          notFound: ['app/not-found.tsx'],
        }],
      });
      expect(valid.success).toBe(true);

      const invalid = validateRouteManifest({
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [{
          id: 'page:/about',
          kind: 'page',
          pattern: '/about',
          params: [],
          layouts: ['../outside-layout.tsx'],
          loading: '/absolute/loading.tsx',
          errors: 'app/error.tsx',
          notFound: [42],
        }],
      });
      expect(invalid.success).toBe(false);
      expect(invalid.diagnostics).toHaveLength(4);
      expect(invalid.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
        'invalid or uncontained',
      );
    });

    it('legacy V1 page manifest accepted', () => {
      const manifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [
          { id: 'page:/about', kind: 'page', pattern: '/about', renderMode: 'static', params: [] },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('legacy V1 API manifest without methods accepted', () => {
      const manifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [{ id: 'api:/api/users', kind: 'api', pattern: '/api/users', params: [] }],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('V2 API manifest without methods rejected', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          { id: 'api:/api/users', kind: 'api', pattern: '/api/users', params: [] }, // missing methods
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('missing required "methods" array in V2');
    });

    it('V2 valid API methods accepted', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'api:/api/users',
            kind: 'api',
            pattern: '/api/users',
            params: [],
            methods: ['DELETE', 'GET', 'POST'],
          },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('V2 API entry with empty methods rejected', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          { id: 'api:/api/users', kind: 'api', pattern: '/api/users', params: [], methods: [] },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('empty "methods" array in V2');
    });

    it('V2 API entry with duplicate methods rejected', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'api:/api/users',
            kind: 'api',
            pattern: '/api/users',
            params: [],
            methods: ['GET', 'GET'],
          },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('duplicate method: "GET"');
    });

    it('V2 API entry with non-alphabetical methods rejected', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'api:/api/users',
            kind: 'api',
            pattern: '/api/users',
            params: [],
            methods: ['POST', 'GET'],
          },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('are not ordered alphabetically in V2');
    });

    it('V2 page methods rejected', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          { id: 'page:/about', kind: 'page', pattern: '/about', params: [], methods: ['GET'] }, // forbidden methods
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain(
        'contains forbidden "methods" property in V2',
      );
    });

    it('accepts valid page component metadata', () => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'page:/about',
            kind: 'page',
            pattern: '/about',
            params: [],
            layouts: ['app/layout.tsx'],
            loading: 'app/loading.tsx',
            errors: ['app/error.tsx'],
            notFound: ['app/not-found.tsx'],
          },
        ],
      };

      expect(validateRouteManifest(manifest)).toEqual({ success: true, diagnostics: [] });
    });

    it.each([
      ['loading', 42],
      ['layouts', 'app/layout.tsx'],
      ['errors', 'app/error.tsx'],
      ['notFound', 'app/not-found.tsx'],
    ])('rejects invalid page %s scalar values', (field, value) => {
      const manifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'page:/about',
            kind: 'page',
            pattern: '/about',
            params: [],
            [field]: value,
          },
        ],
      };

      expect(validateRouteManifest(manifest).success).toBe(false);
    });

    it.each(['layouts', 'errors', 'notFound'])(
      'rejects non-string elements in page %s arrays',
      (field) => {
        const manifest = {
          schemaVersion: 2,
          buildId: 'build_123',
          routes: [
            {
              id: 'page:/about',
              kind: 'page',
              pattern: '/about',
              params: [],
              [field]: ['valid.tsx', 42],
            },
          ],
        };

        expect(validateRouteManifest(manifest).success).toBe(false);
      },
    );

    it('future manifest version rejected', () => {
      const manifest = {
        schemaVersion: 3, // unknown version
        buildId: 'build_123',
        routes: [],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_SERVER_MANIFEST_VERSION');
    });

    it('rejects mismatched build ID', () => {
      const manifest: RouteManifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [],
      };
      const result = validateRouteManifest(manifest, 'expected_id');
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('Build ID mismatch');
    });

    it('rejects non-deterministic ordering', () => {
      const manifest: RouteManifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'page:/products/[id]',
            kind: 'page',
            pattern: '/products/[id]',
            renderMode: 'server',
            params: ['id'],
          },
          { id: 'page:/about', kind: 'page', pattern: '/about', renderMode: 'static', params: [] },
        ],
      };
      const result = validateRouteManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('ordered deterministically');
    });

    it('manifest JSON round-trip', () => {
      const manifest: RouteManifest = {
        schemaVersion: 2,
        buildId: 'build_123',
        routes: [
          {
            id: 'api:/api/users',
            kind: 'api',
            pattern: '/api/users',
            params: [],
            methods: ['GET', 'POST'],
          },
        ],
      };
      const serialized = JSON.stringify(manifest);
      const parsed = JSON.parse(serialized);
      const result = validateRouteManifest(parsed);
      expect(result.success).toBe(true);
      expect(parsed.routes[0].methods).toEqual(['GET', 'POST']);
    });
  });

  describe('ServerManifest validation', () => {
    it('passes for valid sorted ServerManifest', () => {
      const manifest: ServerManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [
          { routeId: 'api:/api/users', serverEntry: './dist/api/users.js' },
          { routeId: 'page:/about', serverEntry: './dist/about.js' },
        ],
      };
      const result = validateServerManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects absolute paths in server entries', () => {
      const manifest: ServerManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [{ routeId: 'page:/about', serverEntry: '/absolute/dist/about.js' }],
      };
      const result = validateServerManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('contains an absolute path');
    });

    it('rejects server routes that are not ordered alphabetically by routeId', () => {
      const manifest: ServerManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [
          { routeId: 'page:/about', serverEntry: './dist/about.js' },
          { routeId: 'api:/api/users', serverEntry: './dist/api/users.js' },
        ],
      };

      const result = validateServerManifest(manifest);

      expect(result.success).toBe(false);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'RANU_BUILD_MANIFEST_INVALID',
          message:
            'ServerManifest routes are not ordered deterministically (alphabetically by routeId).',
        }),
      );
    });
  });

  describe('ClientManifest validation', () => {
    it.each([undefined, null])('returns diagnostics for a %s manifest', (manifest) => {
      const result = validateClientManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('passes for valid ClientManifest', () => {
      const manifest: ClientManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        assets: {
          'page:/about': {
            js: ['./dist/about.chunk.js'],
            css: ['./dist/about.chunk.css'],
          },
        },
      };
      const result = validateClientManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects absolute paths in client assets', () => {
      const manifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        assets: {
          'page:/about': {
            js: ['/absolute/about.chunk.js'],
            css: ['./dist/about.chunk.css'],
          },
        },
      };
      const result = validateClientManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('contains an absolute path');
    });
  });

  describe('StaticManifest validation', () => {
    it('passes for valid StaticManifest', () => {
      const manifest: StaticManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [
          { pathname: '/about', routeId: 'page:/about', file: './static/pages/about.html' },
          {
            pathname: '/docs/routing',
            routeId: 'page:/docs/[slug]',
            file: './static/pages/routing.html',
          },
        ],
      };
      const result = validateStaticManifest(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects out-of-order paths', () => {
      const manifest: StaticManifest = {
        schemaVersion: 1,
        buildId: 'build_123',
        routes: [
          {
            pathname: '/docs/routing',
            routeId: 'page:/docs/[slug]',
            file: './static/pages/routing.html',
          },
          { pathname: '/about', routeId: 'page:/about', file: './static/pages/about.html' },
        ],
      };
      const result = validateStaticManifest(manifest);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].message).toContain('ordered deterministically');
    });
  });
});
