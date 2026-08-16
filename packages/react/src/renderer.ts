import type { RanuRenderer, RanuRequestContext, PageRenderTarget } from '@ranu/runtime';
import { isControlSignal, RedirectSignal, NotFoundSignal } from '@ranu/runtime';
import type { ComponentModuleLoader, LayoutModule, PageProps, ResolvedMetadata } from './types.js';
import { resolveHierarchyMetadata } from './metadata.js';
import { composeComponentTree, composeNotFoundTree, composeErrorDocument } from './composition.js';
import { renderReactToStream } from './stream.js';
import { sanitizeRenderError } from './sanitizer.js';

export interface ReactRendererOptions {
  readonly loader: ComponentModuleLoader;
  readonly mode?: 'development' | 'production';
}

function parseSearchParams(url: URL): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const key of url.searchParams.keys()) {
    const values = url.searchParams.getAll(key);
    result[key] = values.length > 1 ? values : values[0];
  }
  return Object.freeze(result);
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
    const pageProps: PageProps = {
      params: Object.freeze({ ...context.params }),
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
      const tree = composeComponentTree({
        page: pageModule,
        layouts: layoutModules,
        loading: loadingModule,
        metadata: resolvedMetadata,
        pageProps,
      });

      // 6. Execute Streaming SSR via React 19 renderToReadableStream
      let postCommitError: unknown;
      const stream = await renderReactToStream(tree, {
        signal: context.signal,
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
    } catch (err: unknown) {
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
    params: Readonly<Record<string, string | string[]>>,
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
      return new Response('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1></body></html>', {
        status: 500,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }
  }
}

/**
 * Factory helper for creating a ReactRenderer instance.
 */
export function createReactRenderer(options: ReactRendererOptions): ReactRenderer {
  return new ReactRenderer(options);
}
