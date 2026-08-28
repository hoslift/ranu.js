import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  RanuServerRuntime,
  type RanuRequestContext,
  type StaticDispatcher,
  type StaticRouteRecord,
  type RouteComponentModule,
} from '@ranu/runtime';
import {
  compileRoutes,
  type CompiledRouteRecord,
} from '@ranu/router';
import { ReactRenderer } from '@ranu/react';
import { createRuntimeMiddleware } from '@ranu/middleware';
import type {
  BuildDescriptor,
  RouteManifest,
  ServerManifest,
  StaticManifest,
} from '@ranu/manifests';
import {
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
  NodeServer,
  createNodeRequestHandler,
  type NodeServerOptions,
} from './index.js';

export interface ProductionRuntimeOptions {
  projectRoot?: string | undefined;
  buildDir?: string | undefined;
  config?: Record<string, unknown> | undefined;
}

export interface ProductionRequestHandlerOptions extends Partial<NodeServerOptions> {
  buildDir?: string | undefined;
  projectRoot?: string | undefined;
}

export interface ProductionServerOptions extends Partial<NodeServerOptions> {
  projectRoot?: string | undefined;
  buildDir?: string | undefined;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
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

  let realFile: string;
  let realRoot: string;
  try {
    realFile = fs.realpathSync(normalizedFile);
    realRoot = fs.realpathSync(normalizedRoot);
  } catch {
    return false;
  }

  if (!isPathContained(realFile, realRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden: Path traversal is prohibited');
    return true;
  }

  const stat = fs.statSync(realFile);
  if (!stat.isFile()) {
    return false;
  }

  const mimeType = getMimeType(realFile);
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

  const stream = fs.createReadStream(realFile);
  stream.pipe(res);
  return true;
}

/**
 * Creates the production runtime instance from build manifests and compiled server modules.
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

  const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
  const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
  const clientManifestPath = path.resolve(buildDir, buildDescriptor.manifests.client);
  const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);

  if (!fs.existsSync(routesManifestPath) || !fs.existsSync(serverManifestPath)) {
    throw new Error(`Corrupt build at "${buildDir}": missing required route or server manifests.`);
  }

  const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
  const serverManifest: ServerManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
  const staticManifest: StaticManifest = fs.existsSync(staticManifestPath)
    ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
    : { schemaVersion: 1, buildId: buildDescriptor.buildId, routes: [] };

  // 1. Compile Route Records
  const compiledRouter = compileRoutes({
    routes: routeManifest.routes as any,
  });

  const routeRecords: CompiledRouteRecord[] = compiledRouter.records;

  // 2. Server Component Module Loader
  const serverRoutesMap = new Map<string, string>();
  for (const sRoute of serverManifest.routes) {
    serverRoutesMap.set(sRoute.routeId, sRoute.serverEntry);
  }

  const loadedModulesCache = new Map<string, unknown>();

  const loadModuleByPath = async (relPath: string): Promise<unknown> => {
    if (loadedModulesCache.has(relPath)) {
      return loadedModulesCache.get(relPath);
    }
    const fullPath = path.resolve(buildDir, relPath);
    const mod = await import(pathToFileURL(fullPath).href);
    loadedModulesCache.set(relPath, mod);
    return mod;
  };

  const componentModuleLoader = {
    async loadComponent(entryKey: string): Promise<RouteComponentModule> {
      const relPath = serverRoutesMap.get(entryKey);
      if (!relPath) {
        throw new Error(`No server entry registered for route "${entryKey}".`);
      }
      const mod = (await loadModuleByPath(relPath)) as RouteComponentModule;
      return mod;
    },
  };

  // 3. SSR React Renderer
  const renderer = new ReactRenderer({
    componentLoader: componentModuleLoader,
    clientManifestPath: fs.existsSync(clientManifestPath) ? clientManifestPath : undefined,
    basePath: (options.config as any)?.routing?.basePath,
  });

  // 4. API Route Dispatcher
  const apiDispatcher = new NodeApiEndpointDispatcher({
    loadModule: async (routeId: string) => {
      const relPath = serverRoutesMap.get(routeId);
      if (!relPath) {
        throw new Error(`No API module found for route "${routeId}".`);
      }
      return (await loadModuleByPath(relPath)) as any;
    },
  });

  // 5. Pre-rendered Static Pages Dispatcher
  const staticRoutesMap = new Map<string, StaticRouteRecord>();
  for (const st of staticManifest.routes) {
    staticRoutesMap.set(st.pathname, st);
  }

  const staticPagesDir = path.join(buildDir, 'static', 'pages');

  const staticDispatcher: StaticDispatcher = {
    async dispatch(
      req: Request,
      _ctx: RanuRequestContext,
      match: { pathname: string; routeId: string; params: Record<string, string> },
    ): Promise<Response | null> {
      const record = staticRoutesMap.get(match.pathname);
      if (!record) {
        return null;
      }
      const htmlFile = path.resolve(buildDir, record.file);
      if (!isPathContained(htmlFile, staticPagesDir) || !fs.existsSync(htmlFile)) {
        return null;
      }
      const htmlContent = fs.readFileSync(htmlFile, 'utf8');
      return new Response(htmlContent, {
        status: record.status ?? 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      });
    },
  };

  // 6. Request Context Store (AsyncLocalStorage)
  const contextStore = new NodeRequestContextStore();

  // 7. Middleware Loader
  let middleware: ReturnType<typeof createRuntimeMiddleware> | undefined;
  const middlewarePath = path.resolve(buildDir, 'server/middleware.mjs');
  if (fs.existsSync(middlewarePath)) {
    try {
      const mwModule = await import(pathToFileURL(middlewarePath).href);
      middleware = createRuntimeMiddleware(mwModule);
    } catch (err: unknown) {
      // Failed to load compiled middleware
    }
  }

  return new RanuServerRuntime({
    routeRecords,
    contextStore,
    apiDispatcher,
    staticDispatcher,
    renderer,
    middleware,
    config: {
      mode: 'production',
      basePath: (options.config as any)?.routing?.basePath,
      trailingSlash: (options.config as any)?.routing?.trailingSlash ?? 'ignore',
    },
  });
}

/**
 * Creates the production request handler for Node.js HTTP servers.
 * Intercepts immutable static framework assets and static pages, delegating dynamic requests to RanuServerRuntime.
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
    const parsedUrl = new URL(rawUrl, 'http://localhost');
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
    if (pathname !== '/') {
      const relPath = pathname.replace(/^\//, '');
      const targetFile = path.join(staticAssetsDir, relPath);
      if (isPathContained(targetFile, staticAssetsDir) && fs.existsSync(targetFile)) {
        const served = serveStaticFile(
          targetFile,
          staticAssetsDir,
          req,
          res,
          'public, max-age=3600',
        );
        if (served) return;
      }
    }

    // 3. Project-local public directory (fallback if present)
    const publicDir = path.join(projectRoot, 'public');
    if (fs.existsSync(publicDir) && pathname !== '/') {
      const relPath = pathname.replace(/^\//, '');
      const targetFile = path.join(publicDir, relPath);
      if (isPathContained(targetFile, publicDir) && fs.existsSync(targetFile)) {
        const served = serveStaticFile(
          targetFile,
          publicDir,
          req,
          res,
          'public, max-age=3600',
        );
        if (served) return;
      }
    }

    // 4. Delegate to Ranu Node Server Runtime
    await nodeHandler(req, res);
  };
}

/**
 * Creates a ready-to-listen production NodeServer instance.
 */
export async function createProductionServer(
  options: Partial<ProductionServerOptions> = {},
): Promise<NodeServer> {
  const runtime = await createProductionRuntime(options);
  const requestHandler = createProductionRequestHandler(runtime, options);

  const server = new NodeServer({
    runtime,
    port: options.port ?? 3000,
    host: options.host ?? '0.0.0.0',
    trustProxy: options.trustProxy ?? false,
    shutdownTimeout: options.shutdownTimeout ?? 10000,
    bodyLimit: options.bodyLimit,
  });

  // Attach custom production request handler to the underlying HTTP server
  const httpServer = (server as any).httpServer;
  if (httpServer) {
    httpServer.removeAllListeners('request');
    httpServer.on('request', requestHandler);
  }

  return server;
}
