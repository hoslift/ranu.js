import type {
  LoadedRouteModule,
  RouteClientAssets,
  ClientRouteAssetRegistry,
  RouteLoader,
} from '../types.js';

export interface CreateRouteLoaderOptions {
  readonly registry: ClientRouteAssetRegistry;
  readonly importFn?: ((url: string) => Promise<unknown>) | undefined;
}

/**
 * Validates that an asset URL is a trusted framework public asset.
 */
export function isTrustedAssetUrl(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  // Must be a relative public asset path under /_ranu/ or relative asset URL without traversal
  if (url.includes('..') || url.includes('\\')) return false;
  if (url.startsWith('/_ranu/') || url.startsWith('./_ranu/')) return true;
  return false;
}

/**
 * Injects a stylesheet into document.head if not already present.
 */
export function injectStylesheet(href: string): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
  if (existing) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // Non-fatal for graceful degradation
    document.head.appendChild(link);
  });
}

/**
 * Validates that a dynamically imported module has a valid export shape.
 */
export function validateRouteModule(module: unknown, routeId: string): LoadedRouteModule {
  if (!module || (typeof module !== 'object' && typeof module !== 'function')) {
    throw new Error(`Loaded route module for "${routeId}" is not a valid module object or function.`);
  }

  const mod = module as Record<string, unknown>;
  const defaultExport = mod.default;

  if (defaultExport !== undefined && typeof defaultExport !== 'function' && typeof defaultExport !== 'object') {
    throw new Error(`Route module "${routeId}" default export is neither a valid React component nor a page object.`);
  }

  return mod as LoadedRouteModule;
}

/**
 * Creates a browser RouteLoader backed exclusively by trusted build metadata.
 * Prevents user hrefs from becoming direct dynamic import specifiers.
 */
export function createRouteLoader(options: CreateRouteLoaderOptions): RouteLoader {
  const { registry, importFn } = options;
  const moduleCache = new Map<string, Promise<LoadedRouteModule>>();

  const defaultImporter = async (url: string): Promise<unknown> => {
    if (importFn) {
      return importFn(url);
    }
    // Browser dynamic import
    return import(/* @vite-ignore */ url);
  };

  return {
    getRouteAssets(routeId: string): RouteClientAssets | undefined {
      if (!routeId || typeof routeId !== 'string') return undefined;
      return registry.assets[routeId];
    },

    async loadRouteModule(routeId: string): Promise<LoadedRouteModule> {
      if (!routeId || typeof routeId !== 'string') {
        throw new Error('Cannot load route module: routeId must be a non-empty string.');
      }

      const existing = moduleCache.get(routeId);
      if (existing) {
        return existing;
      }

      const assets = registry.assets[routeId];
      if (!assets || !Array.isArray(assets.js) || assets.js.length === 0) {
        throw new Error(`No client assets found in registry for route "${routeId}".`);
      }

      const primaryJs = assets.js[0];
      if (!primaryJs || !isTrustedAssetUrl(primaryJs)) {
        throw new Error(`Untrusted or invalid client asset URL for route "${routeId}": "${primaryJs ?? 'null'}".`);
      }

      const loadPromise = (async () => {
        try {
          // Preload route stylesheets if any
          if (assets.css && Array.isArray(assets.css)) {
            await Promise.all(
              assets.css.filter(isTrustedAssetUrl).map(injectStylesheet)
            );
          }

          const rawModule = await defaultImporter(primaryJs);
          return validateRouteModule(rawModule, routeId);
        } catch (err: unknown) {
          // Evict from cache on failure so future attempts may retry
          moduleCache.delete(routeId);
          throw err;
        }
      })();

      moduleCache.set(routeId, loadPromise);
      return loadPromise;
    },
  };
}
