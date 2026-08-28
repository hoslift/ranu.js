import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  RanuServerRuntime,
  createRuntimeMiddleware,
  type ApiDispatchTarget,
  type RanuRequestContext,
  type StaticDispatchTarget,
} from '@ranu/runtime';
import {
  ReactRenderer,
  type ComponentModuleLoader,
  type PageModule,
  type LayoutModule,
  type LoadingModule,
  type ErrorModule,
  type NotFoundModule,
} from '@ranu/react';
import type {
  BuildDescriptor,
  RouteManifest,
  ServerManifest,
  ClientManifest,
  StaticManifest,
} from '@ranu/manifests';
import { parseRouteSegments, type CompiledRouteRecord } from '@ranu/router';
import { NodeRequestContextStore } from './context.js';
import { createNodeRequestHandler } from './handler.js';
import { NodeServer, type NodeServerOptions } from './server.js';
import { toWebRequest, type ToWebRequestOptions } from './request.js';
import { writeWebResponse } from './response.js';

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function serveStaticFile(
  fullPath: string,
  authorizedRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  cacheControl = 'public, max-age=3600',
): boolean {
  const normalizedFile = path.resolve(fullPath);
  const normalizedRoot = path.resolve(authorizedRoot);

  if (!isPathContained(normalizedFile, normalizedRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden: Path traversal is prohibited');
    return true;
  }

  if (!fs.existsSync(normalizedFile)) {
    return false;
  }

  const stat = fs.statSync(normalizedFile);
  if (!stat.isFile()) {
    return false;
  }

  const mimeType = getMimeType(normalizedFile);
  const isHead = req.method?.toUpperCase() === 'HEAD';

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });

  if (isHead) {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(normalizedFile);
  stream.on('error', (error) => {
    res.destroy(error);
  });
  stream.pipe(res);
  return true;
}

export interface ProductionRuntimeOptions {
  projectRoot?: string | undefined;
  buildDir?: string | undefined;
  config?: any;
  contextStore?: NodeRequestContextStore | undefined;
}

/**
 * Creates an initialized RanuServerRuntime from a production build artifact (.ranu/build).
 */
export async function createProductionRuntime(
  options: ProductionRuntimeOptions = {},
): Promise<RanuServerRuntime> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const buildDir = path.resolve(options.buildDir ?? path.join(projectRoot, '.ranu', 'build'));

  const buildDescriptorPath = path.join(buildDir, 'build.json');
  if (!fs.existsSync(buildDescriptorPath)) {
    throw new Error(
      `No production build found at "${buildDir}". Run "ranu build" first before starting the production server.`,
    );
  }

  const buildDescriptor: BuildDescriptor = JSON.parse(
    fs.readFileSync(buildDescriptorPath, 'utf8'),
  );
  const buildId = buildDescriptor.buildId;

  const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
  const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
  const clientManifestPath = path.resolve(buildDir, buildDescriptor.manifests.client);
  const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);

  const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
  const serverManifest: ServerManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
  const clientManifest: ClientManifest = fs.existsSync(clientManifestPath)
    ? JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'))
    : { schemaVersion: 1, buildId, assets: {} };
  const staticManifest: StaticManifest = fs.existsSync(staticManifestPath)
    ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
    : { schemaVersion: 1, buildId, routes: [] };

  const serverOutDir = path.join(buildDir, 'server');
  const staticPagesDir = path.join(buildDir, 'static', 'pages');

  // 1. Component Module Loader for compiled server components
  const loader: ComponentModuleLoader = {
    loadPage: async (routeId: string) => {
      const entry = serverManifest.routes.find((r) => r.routeId === routeId);
      if (!entry) {
        throw new Error(`Route "${routeId}" not found in server manifest.`);
      }
      const fullPath = path.resolve(buildDir, entry.serverEntry);
      return (await import(pathToFileURL(fullPath).href)) as PageModule;
    },
    loadLayout: async (layoutPath: string) => {
      const entryName = Buffer.from(layoutPath.replace(/\\/g, '/'), 'utf8').toString('base64url');
      const fullPath = path.join(serverOutDir, 'layouts', `${entryName}.mjs`);
      if (fs.existsSync(fullPath)) {
        return (await import(pathToFileURL(fullPath).href)) as LayoutModule;
      }
      const rawPath = path.resolve(projectRoot, layoutPath);
      if (fs.existsSync(rawPath)) {
        return (await import(pathToFileURL(rawPath).href)) as LayoutModule;
      }
      return undefined;
    },
    loadLoading: async (loadingPath: string) => {
      const entryName = Buffer.from(loadingPath.replace(/\\/g, '/'), 'utf8').toString('base64url');
      const fullPath = path.join(serverOutDir, 'layouts', `${entryName}.mjs`);
      if (fs.existsSync(fullPath)) {
        return (await import(pathToFileURL(fullPath).href)) as LoadingModule;
      }
      const rawPath = path.resolve(projectRoot, loadingPath);
      if (fs.existsSync(rawPath)) {
        return (await import(pathToFileURL(rawPath).href)) as LoadingModule;
      }
      return undefined;
    },
    loadError: async (errorPath: string) => {
      const entryName = Buffer.from(errorPath.replace(/\\/g, '/'), 'utf8').toString('base64url');
      const fullPath = path.join(serverOutDir, 'layouts', `${entryName}.mjs`);
      if (fs.existsSync(fullPath)) {
        return (await import(pathToFileURL(fullPath).href)) as ErrorModule;
      }
      const rawPath = path.resolve(projectRoot, errorPath);
      if (fs.existsSync(rawPath)) {
        return (await import(pathToFileURL(rawPath).href)) as ErrorModule;
      }
      return undefined;
    },
    loadNotFound: async (notFoundPath: string) => {
      const entryName = Buffer.from(notFoundPath.replace(/\\/g, '/'), 'utf8').toString('base64url');
      const fullPath = path.join(serverOutDir, 'not-found', `${entryName}.mjs`);
      if (fs.existsSync(fullPath)) {
        return (await import(pathToFileURL(fullPath).href)) as NotFoundModule;
      }
      const rawPath = path.resolve(projectRoot, notFoundPath);
      if (fs.existsSync(rawPath)) {
        return (await import(pathToFileURL(rawPath).href)) as NotFoundModule;
      }
      return undefined;
    },
  };

  // 2. React Renderer
  const renderer = new ReactRenderer({
    loader,
    mode: 'production',
    buildId,
    clientAssets: clientManifest.assets,
  });

  // 3. API Dispatcher
  const apiDispatcher = {
    dispatch: async (req: Request, ctx: RanuRequestContext, target: ApiDispatchTarget) => {
      const entry = serverManifest.routes.find((r) => r.routeId === target.routeId);
      if (!entry) {
        return new Response('Not Found', { status: 404 });
      }
      const fullPath = path.resolve(buildDir, entry.serverEntry);
      const mod = (await import(pathToFileURL(fullPath).href)) as Record<string, unknown>;

      const method = req.method.toUpperCase();
      const handler = mod[method] ?? mod.default;
      if (typeof handler !== 'function') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return (handler as (request: Request, context: RanuRequestContext) => Promise<Response> | Response)(
        req,
        ctx,
      );
    },
  };

  // 4. Static Dispatcher (pre-rendered static HTML routes)
  const staticDispatcher = {
    dispatch: async (
      _req: Request,
      _ctx: RanuRequestContext,
      target: StaticDispatchTarget,
    ): Promise<Response> => {
      const staticEntry = staticManifest.routes.find((r) => r.pathname === target.pathname);
      if (!staticEntry) {
        return new Response('Not Found', { status: 404 });
      }
      const staticFilePath = path.resolve(buildDir, staticEntry.file);
      if (!fs.existsSync(staticFilePath)) {
        // Fallback check in static/pages
        const directPath = path.join(
          staticPagesDir,
          target.pathname === '/' ? 'index.html' : `${target.pathname.replace(/^\//, '')}.html`,
        );
        if (fs.existsSync(directPath)) {
          const html = fs.readFileSync(directPath, 'utf8');
          return new Response(html, {
            status: staticEntry.status ?? 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }

      const html = fs.readFileSync(staticFilePath, 'utf8');
      return new Response(html, {
        status: staticEntry.status ?? 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    },
  };

  // 5. Middleware loading
  let middleware: ReturnType<typeof createRuntimeMiddleware> | undefined;
  const compiledMiddlewarePath = path.join(serverOutDir, 'middleware.mjs');
  if (fs.existsSync(compiledMiddlewarePath)) {
    const middlewareModule = await import(pathToFileURL(compiledMiddlewarePath).href);
    middleware = createRuntimeMiddleware(middlewareModule);
  }

  // 6. Build route records from route manifest
  const routeRecords: CompiledRouteRecord[] = routeManifest.routes.map((r) => {
    const patternSegments = parseRouteSegments(r.pattern);
    return {
      routeId: r.id,
      kind: r.kind,
      pattern: patternSegments,
      pathnameTemplate: r.pattern,
      params: r.params,
      methods: r.methods ?? (r.kind === 'page' ? ['GET', 'HEAD'] : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
      layouts: [],
      errors: [],
      ...(r.kind === 'page' && r.renderMode ? { renderMode: r.renderMode } : {}),
    };
  });

  const contextStore = options.contextStore ?? new NodeRequestContextStore();

  return new RanuServerRuntime({
    routeRecords,
    renderer,
    apiDispatcher,
    staticDispatcher,
    staticManifest,
    contextStore,
    middleware,
    config: options.config ?? { mode: 'production' },
  });
}

export interface ProductionRequestHandlerOptions extends ToWebRequestOptions {
  projectRoot?: string | undefined;
  buildDir?: string | undefined;
}

/**
 * Creates a Node.js production request handler that serves static assets from .ranu/build/static
 * and dispatches all other requests to the RanuServerRuntime pipeline.
 */
export function createProductionRequestHandler(
  runtime: RanuServerRuntime,
  options: ProductionRequestHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const buildDir = path.resolve(options.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
  const staticDir = path.join(buildDir, 'static');
  const staticAssetsDir = path.join(staticDir, 'assets');

  const nodeHandler = createNodeRequestHandler(runtime, options);

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    const rawUrl = req.url ?? '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
    let pathname: string;
    try {
      pathname = decodeURIComponent(parsedUrl.pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    // 1. Immutable static framework assets (/_ranu/assets/*)
    if (pathname.startsWith('/_ranu/assets/')) {
      const relPath = pathname.slice('/_ranu/assets/'.length);
      const targetFile = path.join(staticAssetsDir, relPath);
      const served = serveStaticFile(
        targetFile,
        staticAssetsDir,
        req,
        res,
        'public, max-age=31536000, immutable',
      );
      if (served) return;
    }

    // 2. Public static assets in static/assets/
    const assetTarget = path.join(staticAssetsDir, pathname.replace(/^\//, ''));
    if (fs.existsSync(assetTarget) && fs.statSync(assetTarget).isFile()) {
      if (serveStaticFile(assetTarget, staticAssetsDir, req, res)) {
        return;
      }
    }

    // 3. Fallback check for files directly under project public/ directory
    const publicTarget = path.join(projectRoot, 'public', pathname.replace(/^\//, ''));
    if (fs.existsSync(publicTarget) && fs.statSync(publicTarget).isFile()) {
      if (serveStaticFile(publicTarget, path.join(projectRoot, 'public'), req, res)) {
        return;
      }
    }

    // 4. Delegate to RanuServerRuntime pipeline for dynamic SSR, SSG, and API route dispatch
    await nodeHandler(req, res);
  };
}

export interface ProductionServerOptions extends NodeServerOptions {
  projectRoot?: string | undefined;
  buildDir?: string | undefined;
}

/**
 * Creates a ready-to-run NodeServer for production deployment.
 */
export async function createProductionServer(
  options: Partial<ProductionServerOptions> = {},
): Promise<NodeServer> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const buildDir = path.resolve(options.buildDir ?? path.join(projectRoot, '.ranu', 'build'));

  const runtime = await createProductionRuntime({
    projectRoot,
    buildDir,
  });

  const handler = createProductionRequestHandler(runtime, {
    projectRoot,
    buildDir,
    defaultHost: options.defaultHost,
    trustProxy: options.trustProxy,
    bodyLimit: options.bodyLimit,
  });

  const server = new NodeServer({
    runtime,
    port: options.port ?? 3000,
    host: options.host ?? '0.0.0.0',
    trustProxy: options.trustProxy,
    requestTimeout: options.requestTimeout,
    shutdownTimeout: options.shutdownTimeout,
    bodyLimit: options.bodyLimit,
    defaultHost: options.defaultHost,
  });

  // Re-bind the request listener to use the production handler with static file support
  server.httpServer.removeAllListeners('request');
  server.httpServer.on('request', handler);

  return server;
}
