import { describe, it, expect, vi } from 'vitest';
import {
  createRouteLoader,
  isTrustedAssetUrl,
  validateRouteModule,
} from '../src/index.js';
import type { ClientRouteAssetRegistry } from '../src/types.js';

describe('Phase 14 Stage 14C: Route Module Loader & Trusted Asset Security', () => {
  const sampleRegistry: ClientRouteAssetRegistry = {
    buildId: 'b_test_14c',
    assets: {
      'page:/': {
        js: ['/_ranu/assets/home.js'],
        css: ['/_ranu/assets/home.css'],
      },
      'page:/dashboard': {
        js: ['/_ranu/assets/dashboard.js'],
        css: [],
      },
      'page:/malformed': {
        js: ['/evil/external.js'],
        css: [],
      },
    },
  };

  describe('isTrustedAssetUrl', () => {
    it('accepts valid public framework assets starting with /_ranu/', () => {
      expect(isTrustedAssetUrl('/_ranu/assets/main.js')).toBe(true);
      expect(isTrustedAssetUrl('./_ranu/assets/main.js')).toBe(true);
    });

    it('rejects relative path traversal, backslashes, or arbitrary endpoints', () => {
      expect(isTrustedAssetUrl('/_ranu/../secrets.js')).toBe(false);
      expect(isTrustedAssetUrl('/_ranu\\assets\\bad.js')).toBe(false);
      expect(isTrustedAssetUrl('/api/user/data.js')).toBe(false);
      expect(isTrustedAssetUrl('https://evil.com/payload.js')).toBe(false);
      expect(isTrustedAssetUrl('')).toBe(false);
    });
  });

  describe('validateRouteModule', () => {
    it('accepts module objects with a function default export', () => {
      const mod = { default: () => null };
      expect(validateRouteModule(mod, 'page:/test')).toBe(mod);
    });

    it('throws when module is null or primitive', () => {
      expect(() => validateRouteModule(null, 'page:/test')).toThrow('not a valid module object');
      expect(() => validateRouteModule('string', 'page:/test')).toThrow('not a valid module object');
    });

    it('throws when default export is invalid type (e.g. number)', () => {
      expect(() => validateRouteModule({ default: 123 }, 'page:/test')).toThrow(
        'default export is neither a valid React component nor a page object'
      );
    });
  });

  describe('createRouteLoader', () => {
    it('loads trusted route module and caches result for subsequent requests', async () => {
      const mockImport = vi.fn().mockResolvedValue({
        default: () => 'Dashboard Component',
      });

      const loader = createRouteLoader({
        registry: sampleRegistry,
        importFn: mockImport,
      });

      const mod1 = await loader.loadRouteModule('page:/dashboard');
      expect(mod1.default).toBeDefined();
      expect(mockImport).toHaveBeenCalledTimes(1);
      expect(mockImport).toHaveBeenCalledWith('/_ranu/assets/dashboard.js');

      // Second call reuses cached promise
      const mod2 = await loader.loadRouteModule('page:/dashboard');
      expect(mod2).toBe(mod1);
      expect(mockImport).toHaveBeenCalledTimes(1);
    });

    it('rejects when routeId is missing from registry', async () => {
      const loader = createRouteLoader({
        registry: sampleRegistry,
      });

      await expect(loader.loadRouteModule('page:/nonexistent')).rejects.toThrow(
        'No client assets found in registry for route "page:/nonexistent"'
      );
    });

    it('rejects when asset URL is untrusted / malicious', async () => {
      const loader = createRouteLoader({
        registry: sampleRegistry,
      });

      await expect(loader.loadRouteModule('page:/malformed')).rejects.toThrow(
        'Untrusted or invalid client asset URL'
      );
    });

    it('evicts failed loads from cache to permit retry', async () => {
      let callCount = 0;
      const mockImport = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network offline'));
        }
        return Promise.resolve({ default: () => 'Recovered' });
      });

      const loader = createRouteLoader({
        registry: sampleRegistry,
        importFn: mockImport,
      });

      // First attempt fails
      await expect(loader.loadRouteModule('page:/dashboard')).rejects.toThrow('Network offline');

      // Second attempt retries and succeeds
      const recovered = await loader.loadRouteModule('page:/dashboard');
      expect(recovered.default).toBeDefined();
      expect(mockImport).toHaveBeenCalledTimes(2);
    });

    it('returns route assets metadata via getRouteAssets', () => {
      const loader = createRouteLoader({
        registry: sampleRegistry,
      });

      expect(loader.getRouteAssets('page:/')).toEqual({
        js: ['/_ranu/assets/home.js'],
        css: ['/_ranu/assets/home.css'],
      });
      expect(loader.getRouteAssets('page:/unknown')).toBeUndefined();
    });
  });
});
