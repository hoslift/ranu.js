import type { RanuRenderer, RanuRequestContext, PageRenderTarget } from '@ranu/runtime';
import { isControlSignal, RedirectSignal, NotFoundSignal } from '@ranu/runtime';
import type {
  ComponentModuleLoader,
  LayoutModule,
  PageProps,
  RanuHydrationPayload,
  ResolvedMetadata,
  RouteClientAssets,
  RouteParams,
} from './types.js';
import { resolveHierarchyMetadata } from './metadata.js';
import {
  composeComponentTree,
  composeNotFoundTree,
  composeErrorDocument,
  wrapRouteParams,
} from './composition.js';
import { renderReactToStream } from './stream.js';
import { sanitizeRenderError } from './sanitizer.js';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import {
  assertFlightSerializable,
  FlightSerializationError,
  FLIGHT_SERIALIZATION_ERROR_CODE,
} from './flight-assertions.js';

export interface ReactRendererOptions {
  readonly loader: ComponentModuleLoader;
  readonly mode?: 'development' | 'production';
  readonly buildId?: string | undefined;
  readonly publicEnv?: Readonly<Record<string, string>> | undefined;
  readonly clientAssets?: Readonly<Record<string, RouteClientAssets>> | undefined;
}

function parseSearchParams(url: URL): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }
  return Object.freeze(result);
}

/** Combines route and bootstrap asset groups without emitting duplicate URLs. */
function mergeClientAssets(
  routeAssets: RouteClientAssets,
  bootstrapAssets: RouteClientAssets,
): RouteClientAssets {
  return Object.freeze({
    js: Object.freeze([...new Set([...routeAssets.js, ...bootstrapAssets.js])]),
    css: Object.freeze([...new Set([...routeAssets.css, ...bootstrapAssets.css])]),
  });
}

/**
 * Authoritative React 19 Server Renderer implementing the provider-neutral RanuRenderer contract.
 */
export class ReactRenderer implements RanuRenderer {
  constructor(private readonly options: ReactRendererOptions) {}

  async render(
    request: Request,
    context: RanuRequestContext,
    target: PageRenderTarget,
  ): Promise<Response> {
    const mode = this.options.mode ?? 'production';
    const searchParams = parseSearchParams(context.url);
    const rawParams = Object.freeze({ ...context.params });
    const pageProps: PageProps = {
      params: wrapRouteParams(rawParams),
      searchParams,
    };

    try {
      // 1. Load Page Module
      const pageModule = await this.options.loader.loadPage(target.routeId);

      // 2. Load Layout Modules in order (Root Layout -> Nested Layouts)
      const layoutModules: LayoutModule[] = [];
      for (const layoutPath of target.layouts) {
        const layoutModule = await this.options.loader.loadLayout(layoutPath);
        layoutModules.push(layoutModule);
      }

      // 3. Load Loading Module if defined for this segment
      const loadingModule = target.loading
        ? await this.options.loader.loadLoading(target.loading)
        : undefined;

      // 4. Resolve Metadata across hierarchy
      let resolvedMetadata: ResolvedMetadata | undefined;
      try {
        resolvedMetadata = await resolveHierarchyMetadata(layoutModules, pageModule, pageProps);
      } catch (err: unknown) {
        if (isControlSignal(err)) {
          throw err;
        }
        throw err;
      }

      // 5. Compose Component Tree
      let resolvedClientAssets: RouteClientAssets | undefined;
      const rawRouteAssets = this.options.clientAssets?.[target.routeId];
      const rawBootstrapAssets = this.options.clientAssets?.['bootstrap'];
      if (rawRouteAssets || rawBootstrapAssets) {
        resolvedClientAssets = mergeClientAssets(
          rawRouteAssets ?? { js: [], css: [] },
          rawBootstrapAssets ?? { js: [], css: [] },
        );
      }

      let hydrationPayload: RanuHydrationPayload | undefined;
      if (pageModule.render === 'client') {
        if (mode === 'development') {
          assertFlightSerializable(rawParams, 'params', pageModule.default?.name || 'ClientPage');
          assertFlightSerializable(
            pageProps.searchParams,
            'searchParams',
            pageModule.default?.name || 'ClientPage',
          );
        }

        const buildId = this.options.buildId?.trim();
        if (!buildId) {
          throw new Error(
            `Client route "${target.routeId}" requires a build ID for browser bootstrap.`,
          );
        }

        const routeAssets = this.options.clientAssets?.[target.routeId];
        if (!routeAssets) {
          throw new Error(
            `Client assets for route "${target.routeId}" were not provided to ReactRenderer.`,
          );
        }

        const bootstrapAssets = this.options.clientAssets?.['bootstrap'];
        if (!bootstrapAssets) {
          throw new Error('The client bootstrap asset was not provided to ReactRenderer.');
        }

        hydrationPayload = Object.freeze({
          buildId,
          routeId: target.routeId,
          pathname: context.url.pathname,
          params: rawParams,
          searchParams: pageProps.searchParams,
          publicEnv: Object.freeze({ ...(this.options.publicEnv ?? {}) }),
          assets: resolvedClientAssets!,
          renderMode: 'client',
        });
      }

      const tree = composeComponentTree({
        page: pageModule,
        layouts: layoutModules,
        loading: loadingModule,
        metadata: resolvedMetadata,
        pageProps,
        hydrationPayload,
        renderMode: pageModule?.render,
        clientAssets: resolvedClientAssets,
      });

      // 6. Execute Streaming SSR via React 19 renderToReadableStream
      let postCommitError: unknown;
      const stream = await renderReactToStream(tree, {
        signal: context.signal,
        mode,
        onError(err: unknown) {
          postCommitError = err;
          if (mode === 'development') {
            console.error(`[Ranu SSR Error] Request ID: ${context.requestId}`, err);
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (err: any) {
      // Handle Pre-Stream Control Signals
      if (isControlSignal(err)) {
        if (err instanceof RedirectSignal) {
          return new Response(null, {
            status: err.status,
            headers: {
              Location: err.url,
            },
          });
        }

        if (err instanceof NotFoundSignal) {
          return this.renderNotFound(context, target, pageProps.params, mode);
        }
      }

      // Handle Development Streaming Serialization Errors
      if (
        mode === 'development' &&
        (err instanceof FlightSerializationError ||
          err?.code === FLIGHT_SERIALIZATION_ERROR_CODE ||
          (err instanceof TypeError && /hydration payload|cannot serialize/i.test(err.message)))
      ) {
        return this.renderSerializationErrorResponse(err, context, target, mode);
      }

      // Pre-Stream Error: Render safe 500 error response
      return this.renderErrorResponse(err, context, mode);
    }
  }

  /**
   * Renders the nearest not-found boundary preserving parent layout hierarchy.
   */
  private async renderNotFound(
    context: RanuRequestContext,
    target: PageRenderTarget,
    params: RouteParams,
    mode: 'development' | 'production',
  ): Promise<Response> {
    try {
      // Select nearest available not-found module
      let notFoundModule;
      if (target.notFound && target.notFound.length > 0) {
        for (const nfPath of target.notFound) {
          notFoundModule = await this.options.loader.loadNotFound(nfPath);
          if (notFoundModule) break;
        }
      }

      // Load preserved parent layouts
      const layoutModules: LayoutModule[] = [];
      for (const layoutPath of target.layouts) {
        try {
          const layoutModule = await this.options.loader.loadLayout(layoutPath);
          layoutModules.push(layoutModule);
        } catch {
          // Fallback if layout fails to load
        }
      }

      const notFoundTree = composeNotFoundTree({
        notFound: notFoundModule,
        layouts: layoutModules,
        metadata: { title: '404 - Page Not Found' },
        params,
      });

      const stream = await renderReactToStream(notFoundTree, {
        signal: context.signal,
      });

      return new Response(stream, {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (fallbackErr: unknown) {
      return this.renderErrorResponse(fallbackErr, context, mode);
    }
  }

  /**
   * Renders a development mode HTTP 500 error response with structured diagnostic overlay for serialization errors.
   */
  private async renderSerializationErrorResponse(
    err: Error & { hint?: string },
    context: RanuRequestContext,
    target: PageRenderTarget,
    mode: 'development' | 'production',
  ): Promise<Response> {
    const diagnostic: RanuDiagnostic = {
      code: FLIGHT_SERIALIZATION_ERROR_CODE,
      severity: 'error',
      message: err.message || 'Cannot pass non-serializable prop across streaming boundary.',
      location: { file: target.routeId },
      routeId: target.routeId,
      hint:
        err.hint ??
        'Move event handlers and stateful logic inside the Client Component ("use client"), or pass plain JSON-serializable data.',
    };

    console.error(`[Ranu SSR Serialization Error] Request ID: ${context.requestId}`, err.message);

    const sanitized = sanitizeRenderError(err, mode, context.requestId);
    const errorTree = composeErrorDocument({
      message: `${sanitized.message}\n[${diagnostic.code}] Hint: ${diagnostic.hint}`,
      requestId: sanitized.requestId,
      stack: sanitized.stack,
    });

    const overlayScript = `
<script>
  window.__ranu_serialization_error__ = ${JSON.stringify(diagnostic)};
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ranu:serialization-error', {
      detail: { diagnostic: ${JSON.stringify(diagnostic)} }
    }));
  }
</script>
`;

    try {
      const stream = await renderReactToStream(errorTree, {
        signal: context.signal,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder('utf-8');
      const encoder = new TextEncoder();
      let html = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();

      if (html.includes('</body>')) {
        html = html.replace('</body>', `${overlayScript}</body>`);
      } else {
        html += overlayScript;
      }

      return new Response(encoder.encode(html), {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Ranu-Diagnostic-Code': diagnostic.code,
        },
      });
    } catch {
      return new Response(
        `<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>${diagnostic.message}</p>${overlayScript}</body></html>`,
        {
          status: 500,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Ranu-Diagnostic-Code': diagnostic.code,
          },
        },
      );
    }
  }

  /**
   * Renders a safe HTTP 500 error response with production sanitization.
   */
  private async renderErrorResponse(
    err: unknown,
    context: RanuRequestContext,
    mode: 'development' | 'production',
  ): Promise<Response> {
    const sanitized = sanitizeRenderError(err, mode, context.requestId);
    const errorTree = composeErrorDocument({
      message: sanitized.message,
      requestId: sanitized.requestId,
      stack: sanitized.stack,
    });

    try {
      const stream = await renderReactToStream(errorTree, {
        signal: context.signal,
      });

      return new Response(stream, {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch {
      // Ultimate fallback if React rendering itself is completely corrupted
      return new Response(
        '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1></body></html>',
        {
          status: 500,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        },
      );
    }
  }
}

/**
 * Factory helper for creating a ReactRenderer instance.
 */
export function createReactRenderer(options: ReactRendererOptions): ReactRenderer {
  return new ReactRenderer(options);
}
