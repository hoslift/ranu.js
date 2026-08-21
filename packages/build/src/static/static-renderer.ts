import { AsyncLocalStorage } from 'node:async_hooks';
import type { RanuRequestContext, PageRenderTarget } from '@ranu/runtime';
import { registerRequestContextStore } from '@ranu/runtime';
import { ReactRenderer, type ComponentModuleLoader } from '@ranu/react';
import type { StaticParamRecord } from '@ranu/core';
import { deriveStaticOutputPath, writeStaticPage } from './output.js';

export interface StaticRouteArtifact {
  readonly pathname: string;
  readonly routeId: string;
  readonly params: StaticParamRecord;
  readonly file: string;
  readonly status: 200 | 404;
}

export interface RenderStaticRouteOptions {
  readonly routeId: string;
  readonly pathname: string;
  readonly params: StaticParamRecord;
  readonly target: PageRenderTarget;
  readonly loader: ComponentModuleLoader;
  readonly buildId: string;
  readonly outputDir: string;
  readonly trailingSlash?: 'never' | 'always' | undefined;
}

/**
 * Deterministic build-time RequestContextStore using AsyncLocalStorage.
 */
class BuildTimeRequestContextStore {
  private readonly storage = new AsyncLocalStorage<RanuRequestContext>();

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(context, callback);
  }

  get(): RanuRequestContext | undefined {
    return this.storage.getStore();
  }
}

const buildContextStore = new BuildTimeRequestContextStore();
registerRequestContextStore(buildContextStore);

let staticSequence = 0;

/**
 * Pre-renders a single static route with its evaluated concrete pathname and parameters.
 * Reuses the authoritative ReactRenderer to produce standalone static HTML.
 */
export async function renderStaticRoute(
  options: RenderStaticRouteOptions
): Promise<StaticRouteArtifact> {
  const {
    routeId,
    pathname,
    params,
    target,
    loader,
    buildId,
    outputDir,
    trailingSlash = 'never',
  } = options;

  // 1. Construct deterministic build-time Request
  const deterministicUrl = new URL(`http://localhost${pathname}`);
  const request = new Request(deterministicUrl.toString(), {
    method: 'GET',
    headers: new Headers(),
  });

  // 2. Construct deterministic build-time RanuRequestContext
  const sanitizedRouteId = routeId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const seq = ++staticSequence;
  const requestId = `build-ssg-${sanitizedRouteId}-${seq}`;

  const locals = new Map<string, unknown>();
  // Guard flag: Server helpers (cookies, headers, getRequestContext) throw RANU_SSG_DYNAMIC_ACCESS when active
  locals.set('__ranu_ssg__', true);

  const contextParams: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(params)) {
    contextParams[k] = Array.isArray(v) ? [...v] : v;
  }

  const context: RanuRequestContext = {
    requestId,
    request,
    url: deterministicUrl,
    params: contextParams,
    locals,
    signal: request.signal,
    responseCookies: [],
    depth: seq,
  };

  // 3. Render through the authoritative ReactRenderer within the isolated request context
  const renderer = new ReactRenderer({
    loader,
    mode: 'production',
  });

  const response = await buildContextStore.run(context, async () => {
    return renderer.render(request, context, target);
  });

  // 4. Handle Redirection: Dynamic redirects are unsupported during SSG
  if (response.status === 307 || response.status === 308 || response.headers.has('Location')) {
    const location = response.headers.get('Location') ?? 'unknown';
    const error: any = new Error(
      `Static page "${routeId}" at pathname "${pathname}" triggered redirect() to "${location}". Dynamic redirects are unsupported during static site generation.`
    );
    error.code = 'RANU_SSG_REDIRECT_UNSUPPORTED';
    throw error;
  }

  // 5. Determine artifact HTTP status (200 for normal static page, 404 if notFound was called)
  const status: 200 | 404 = response.status === 404 ? 404 : 200;

  // 6. Read stream to complete HTML string
  const htmlContent = await response.text();

  // 7. Derive canonical output relative path
  const relativeFilePath = deriveStaticOutputPath(pathname, trailingSlash);

  // 8. Write static HTML file into output directory
  writeStaticPage(outputDir, relativeFilePath, htmlContent);

  return {
    pathname,
    routeId,
    params,
    file: './' + relativeFilePath.replace(/\\/g, '/'),
    status,
  };
}

/**
 * Renders multiple static routes concurrently in bounded batches (default concurrency: 8).
 * Guarantees context isolation and deterministic pathname sorting in the returned artifacts.
 */
export async function renderStaticRoutesInBatch(
  routes: readonly RenderStaticRouteOptions[],
  concurrency = 8
): Promise<StaticRouteArtifact[]> {
  if (routes.length === 0) {
    return [];
  }

  const results: StaticRouteArtifact[] = [];
  const limit = Math.max(1, Math.min(concurrency, 32));

  // Process in chunks of `limit`
  for (let i = 0; i < routes.length; i += limit) {
    const chunk = routes.slice(i, i + limit);
    const chunkResults = await Promise.all(
      chunk.map(routeOptions => renderStaticRoute(routeOptions))
    );
    results.push(...chunkResults);
  }

  // Sort deterministically by pathname
  results.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return results;
}
