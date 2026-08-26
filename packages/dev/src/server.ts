import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Socket } from 'node:net';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientManifest } from '@ranu/manifests';
import type { ApiDispatchTarget, RuntimeMiddleware } from '@ranu/runtime';
import { RanuServerRuntime, createRuntimeMiddleware, type RanuRequestContext } from '@ranu/runtime';
import { toWebRequest, writeWebResponse } from '@ranu/runtime-node';
import {
  ReactRenderer,
  type ComponentModuleLoader,
  type PageModule,
  type LayoutModule,
  type LoadingModule,
  type ErrorModule,
  type NotFoundModule,
} from '@ranu/react';
import { PluginManager } from '@ranu/plugin';
import type { DevServerOptions, DevServerAddress, DevBuildState } from './types.js';
import { ProjectWatcher } from './watcher.js';
import { RebuildCoordinator } from './coordinator.js';
import { DevReloadChannel } from './channel.js';
import { DEV_CLIENT_SCRIPT } from './client.js';
import { serveStaticFile } from './static.js';

class DevRequestContextStore {
  private readonly storage = new AsyncLocalStorage<RanuRequestContext>();

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(context, callback);
  }

  get(): RanuRequestContext | undefined {
    return this.storage.getStore();
  }
}

function getCompiledComponentEntryName(componentPath: string): string {
  return Buffer.from(componentPath.replace(/\\/g, '/'), 'utf8').toString('base64url');
}

export class DevServer {
  readonly httpServer: http.Server;
  private readonly options: DevServerOptions;
  private readonly projectRoot: string;
  private readonly outDir: string;
  private readonly staticOutDir: string;
  private readonly serverOutDir: string;

  private watcher: ProjectWatcher | null = null;
  readonly coordinator: RebuildCoordinator;
  readonly reloadChannel: DevReloadChannel;
  readonly pluginManager: PluginManager;
  private runtime: RanuServerRuntime | null = null;
  private readonly connections = new Set<Socket>();
  private readonly versionedModuleCopies = new Set<string>();
  private isShuttingDown = false;
  private previousBuildSuccess = true;

  constructor(options: DevServerOptions) {
    this.options = options;
    this.projectRoot = path.resolve(options.projectRoot);
    this.outDir = path.resolve(options.outDir ?? path.join(this.projectRoot, '.ranu', 'dev'));
    this.staticOutDir = path.join(this.outDir, 'static');
    this.serverOutDir = path.join(this.outDir, 'server');

    this.reloadChannel = new DevReloadChannel();
    this.pluginManager = new PluginManager(options.plugins ?? [], {
      mode: 'development',
      command: 'dev',
      projectRoot: this.projectRoot,
    });
    this.coordinator = new RebuildCoordinator({
      options,
      onBuildComplete: (state) => this.handleBuildComplete(state),
    });

    this.httpServer = http.createServer((req, res) => {
      this.handleHttpRequest(req, res).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Internal Dev Server Error: ${(err as Error).message ?? String(err)}`);
        }
      });
    });

    // Track active connection sockets for graceful shutdown
    this.httpServer.on('connection', (socket: Socket) => {
      this.connections.add(socket);
      socket.once('close', () => {
        this.connections.delete(socket);
      });
    });
  }

  private importCompiledModule<T>(fullPath: string, generation: number): Promise<T> {
    const parsed = path.parse(fullPath);
    const versionedPath = path.join(
      parsed.dir,
      `${parsed.name}.ranu-dev-${process.pid}-${generation}${parsed.ext}`,
    );
    if (!fs.existsSync(versionedPath)) {
      fs.copyFileSync(fullPath, versionedPath);
      this.versionedModuleCopies.add(versionedPath);
    }
    return import(/* @vite-ignore */ pathToFileURL(versionedPath).href) as Promise<T>;
  }

  private handleBuildComplete(state: DevBuildState): void {
    if (!state.success) {
      this.previousBuildSuccess = false;
      this.reloadChannel.broadcastError(state.diagnostics);
      return;
    }

    try {
      this.reloadRuntime(state);
    } catch (error: unknown) {
      this.previousBuildSuccess = false;
      this.reloadChannel.broadcastError([
        {
          code: 'RANU_DEV_RUNTIME_RELOAD_FAILED',
          severity: 'error',
          message: `Failed to activate rebuilt runtime: ${(error as Error).message ?? String(error)}`,
        },
      ]);
      return;
    }

    if (!this.previousBuildSuccess) {
      this.reloadChannel.broadcastRecovered({
        buildId: state.buildId,
        generation: state.generation,
      });
    }
    this.previousBuildSuccess = true;

    if (
      state.hmrAnalysis?.canHotUpdate &&
      !state.hmrAnalysis.requiresReload &&
      state.hmrAnalysis.updates.length > 0
    ) {
      this.reloadChannel.broadcastUpdate({
        buildId: state.buildId,
        generation: state.generation,
        updates: state.hmrAnalysis.updates,
        affectedRoutes: state.hmrAnalysis.affectedRoutes,
      });
    } else {
      this.reloadChannel.broadcastReload({
        buildId: state.buildId,
        generation: state.generation,
        reason: state.hmrAnalysis?.reason ?? 'rebuild',
      });
    }
  }

  private reloadRuntime(state: DevBuildState): void {
    const routeManifestPath = path.join(this.outDir, 'manifest', 'routes.json');
    const clientManifestPath = path.join(this.outDir, 'manifest', 'client.json');

    if (!fs.existsSync(routeManifestPath)) {
      return;
    }

    const clientManifest: ClientManifest | undefined = fs.existsSync(clientManifestPath)
      ? JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'))
      : undefined;

    const loader: ComponentModuleLoader = {
      loadPage: async (routeId: string) => {
        const route = state.routes.find((r) => r.routeId === routeId);
        if (!route?.sourceFile) {
          throw new Error(`Page source for route "${routeId}" not found.`);
        }
        const compiledRel = route.outputRelativePath.replace(/^server[/\\]/, '');
        const fullPath = path.join(this.serverOutDir, compiledRel);
        return this.importCompiledModule<PageModule>(fullPath, state.generation);
      },
      loadLayout: async (layoutPath: string) => {
        const compiledRel = path.join(
          'layouts',
          `${getCompiledComponentEntryName(layoutPath)}.mjs`,
        );
        const fullPath = path.join(this.serverOutDir, compiledRel);
        return this.importCompiledModule<LayoutModule>(fullPath, state.generation);
      },
      loadLoading: async (loadingPath: string) => {
        const compiledRel = path.join(
          'layouts',
          `${getCompiledComponentEntryName(loadingPath)}.mjs`,
        );
        const fullPath = path.join(this.serverOutDir, compiledRel);
        if (!fs.existsSync(fullPath)) return undefined;
        return this.importCompiledModule<LoadingModule>(fullPath, state.generation);
      },
      loadError: async (errorPath: string) => {
        const compiledRel = path.join('layouts', `${getCompiledComponentEntryName(errorPath)}.mjs`);
        const fullPath = path.join(this.serverOutDir, compiledRel);
        if (!fs.existsSync(fullPath)) return undefined;
        return this.importCompiledModule<ErrorModule>(fullPath, state.generation);
      },
      loadNotFound: async (notFoundPath: string) => {
        const compiledRel = path.join(
          'not-found',
          `${getCompiledComponentEntryName(notFoundPath)}.mjs`,
        );
        const fullPath = path.join(this.serverOutDir, compiledRel);
        if (!fs.existsSync(fullPath)) return undefined;
        return this.importCompiledModule<NotFoundModule>(fullPath, state.generation);
      },
    };

    const renderer = new ReactRenderer({
      loader,
      mode: 'development',
      buildId: state.buildId,
      clientAssets: clientManifest?.assets,
      publicEnv: this.options.publicEnv,
    });

    const apiDispatcher = {
      dispatch: async (_req: Request, _ctx: RanuRequestContext, target: ApiDispatchTarget) => {
        const route = state.routes.find((r) => r.routeId === target.routeId);
        if (!route?.sourceFile) {
          return new Response('Not Found', { status: 404 });
        }
        const compiledRel = route.outputRelativePath.replace(/^server[/\\]/, '');
        const fullPath = path.join(this.serverOutDir, compiledRel);
        const mod = await this.importCompiledModule<Record<string, unknown>>(
          fullPath,
          state.generation,
        );

        const method = _req.method.toUpperCase();
        const handler = mod[method] ?? mod.default;
        if (typeof handler !== 'function') {
          return new Response('Method Not Allowed', { status: 405 });
        }
        return handler(_req, _ctx);
      },
    };

    const staticDispatcher = {
      dispatch: (
        _req: Request,
        _ctx: RanuRequestContext,
        _target: { routeId: string; pathname: string },
      ) => Promise.resolve(new Response('Not Found', { status: 404 })),
    };

    let middleware: RuntimeMiddleware | undefined;
    const middlewarePath = path.join(this.serverOutDir, 'middleware.mjs');
    if (fs.existsSync(middlewarePath)) {
      let runtimeMiddlewarePromise: Promise<RuntimeMiddleware> | undefined;
      middleware = {
        run: async (req, ctx) => {
          runtimeMiddlewarePromise ??= this.importCompiledModule<unknown>(
            middlewarePath,
            state.generation,
          ).then((mod) => createRuntimeMiddleware(mod));
          const runtimeMw = await runtimeMiddlewarePromise;
          return runtimeMw.run(req, ctx);
        },
      };
    }

    const replacementRuntime = new RanuServerRuntime({
      routeRecords: [...(state.routeRecords ?? [])],
      contextStore: new DevRequestContextStore(),
      apiDispatcher,
      staticDispatcher,
      renderer,
      ...(middleware ? { middleware } : {}),
      config: { mode: 'development' },
    });

    const previousRuntime = this.runtime;
    this.runtime = replacementRuntime;
    previousRuntime?.dispose();
  }

  private async handleHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const rawUrl = req.url ?? '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. Browser Reload Channel (SSE)
    if (pathname === '/_ranu/dev-reload' || pathname === '/_ranu/hmr') {
      const buildId = this.coordinator.currentState?.buildId ?? 'dev-init';
      const generation = this.coordinator.currentState?.generation ?? 0;
      this.reloadChannel.handleConnection(req, res, buildId, generation);
      return;
    }

    // 2. Browser Dev Client Script
    if (pathname === '/_ranu/dev-client.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(DEV_CLIENT_SCRIPT);
      return;
    }

    // 3. Static framework assets (/_ranu/assets/*)
    if (pathname.startsWith('/_ranu/assets/')) {
      const relPath = pathname.slice('/_ranu/assets/'.length);
      const targetFile = path.join(this.staticOutDir, 'assets', relPath);
      const served = serveStaticFile(targetFile, path.join(this.staticOutDir, 'assets'), req, res);
      if (served) return;
    }

    // 4. Public directory files (e.g. /favicon.ico, /images/banner.png)
    const publicTarget = path.join(this.staticOutDir, pathname);
    if (serveStaticFile(publicTarget, this.staticOutDir, req, res)) {
      return;
    }

    // Direct public/ fallback
    const rawPublicTarget = path.join(this.projectRoot, 'public', pathname);
    if (serveStaticFile(rawPublicTarget, path.join(this.projectRoot, 'public'), req, res)) {
      return;
    }

    // 5. Handle build diagnostics error view if build failed and no runtime exists
    const currentState = this.coordinator.currentState;
    if (currentState && !currentState.success && !this.runtime) {
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Build Error — Ranu.js Dev Server</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }
    h1 { color: #f43f5e; font-size: 1.5rem; }
    pre { background: #1e293b; padding: 1rem; border-radius: 8px; overflow-x: auto; color: #cbd5e1; }
    .diag { margin-bottom: 1rem; border-left: 4px solid #f43f5e; padding-left: 1rem; }
  </style>
</head>
<body>
  <h1>Development Build Error</h1>
  ${currentState.diagnostics.map((d) => `<div class="diag"><strong>[${d.code}]</strong> ${d.message}</div>`).join('')}
  <script src="/_ranu/dev-client.js"></script>
</body>
</html>`;
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(errorHtml);
      return;
    }

    // 6. Dispatch through active RanuServerRuntime
    if (!this.runtime) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Dev server is initializing...');
      return;
    }

    const abortController = new AbortController();
    const abortRequest = () => abortController.abort();
    req.once('aborted', abortRequest);
    res.once('close', abortRequest);

    try {
      const request = toWebRequest(req, abortController.signal, {
        defaultHost: this.options.host ?? 'localhost',
      });

      const response = await this.runtime.handle(request);

      // In dev mode, inject dev client script into HTML responses
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html')) {
        let html = await response.text();
        const devScriptTag = '\n<script src="/_ranu/dev-client.js"></script>\n';
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${devScriptTag}</body>`);
        } else {
          html += devScriptTag;
        }

        const headers = new Headers(response.headers);
        headers.set('Content-Length', String(Buffer.byteLength(html, 'utf8')));
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');

        const injectedResponse = new Response(html, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });

        await writeWebResponse(injectedResponse, res, {
          signal: abortController.signal,
          suppressBody: req.method?.toUpperCase() === 'HEAD',
        });
        return;
      }

      await writeWebResponse(response, res, {
        signal: abortController.signal,
        suppressBody: req.method?.toUpperCase() === 'HEAD',
      });
    } finally {
      req.off('aborted', abortRequest);
      res.off('close', abortRequest);
    }
  }

  /**
   * Starts the development server, executes initial build, and starts project watching.
   */
  async start(port?: number, host?: string): Promise<DevServerAddress> {
    // 1. Execute initial dev build
    const initialState = await this.coordinator.triggerRebuild('initial');
    if (initialState.success && !this.runtime) {
      this.reloadRuntime(initialState);
    }

    // 2. Start file watching if enabled
    if (this.options.watch !== false) {
      this.watcher = new ProjectWatcher({
        projectRoot: this.projectRoot,
        debounceMs: this.options.debounceMs,
        onChange: (events) => {
          void this.coordinator.triggerRebuild(
            events.map((e) => e.relativePath).join(', '),
            events,
          );
        },
      });
    }

    // 3. Bind HTTP server
    const targetPort = port ?? this.options.port ?? 3000;
    const targetHost = host ?? this.options.host ?? 'localhost';

    const address = await new Promise<DevServerAddress>((resolve, reject) => {
      const onError = (err: Error) => {
        this.httpServer.off('listening', onListening);
        if (this.watcher) {
          this.watcher.close();
          this.watcher = null;
        }
        this.reloadChannel.close();
        reject(err);
      };

      const onListening = () => {
        this.httpServer.off('error', onError);
        const addr = this.httpServer.address();
        let boundPort = targetPort;
        let boundHost = targetHost;

        if (addr && typeof addr === 'object') {
          boundPort = addr.port;
          boundHost = addr.address;
        }

        const url = `http://${boundHost === '::' || boundHost === '0.0.0.0' ? 'localhost' : boundHost}:${boundPort}`;
        resolve({
          port: boundPort,
          host: boundHost,
          url,
        });
      };

      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);

      this.httpServer.listen(targetPort, targetHost);
    });

    // Plugin Hook: devStart
    try {
      await this.pluginManager.runDevStart({
        pluginName: '',
        mode: 'development',
        command: 'dev',
        projectRoot: this.projectRoot,
        logger: (this.pluginManager as any).setupContext.logger,
        port: address.port,
        host: address.host,
      });
    } catch (error: unknown) {
      try {
        await this.close();
      } catch {
        // Preserve the startup hook error after best-effort resource cleanup.
      }
      throw error;
    }

    return address;
  }

  /** Triggers an explicit development rebuild. */
  rebuild(reason: string): Promise<DevBuildState> {
    return this.coordinator.triggerRebuild(reason);
  }

  /**
   * Gracefully shuts down the development server, watcher, reload channel, and sockets.
   */
  async close(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Plugin Hook: devEnd
    try {
      await this.pluginManager.runDevEnd({
        pluginName: '',
        mode: 'development',
        command: 'dev',
        projectRoot: this.projectRoot,
        logger: (this.pluginManager as any).setupContext.logger,
      });
    } catch {
      // Tolerate error during shutdown
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.reloadChannel.close();

    if (this.runtime) {
      this.runtime.dispose();
      this.runtime = null;
    }

    for (const moduleCopy of this.versionedModuleCopies) {
      try {
        fs.rmSync(moduleCopy, { force: true });
      } catch {
        // Ignore cleanup errors for development-only module copies.
      }
    }
    this.versionedModuleCopies.clear();

    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    return new Promise<void>((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export function createDevServer(options: DevServerOptions): DevServer {
  return new DevServer(options);
}

export async function startDevServer(
  options: DevServerOptions,
): Promise<{ server: DevServer; address: DevServerAddress }> {
  const server = createDevServer(options);
  const address = await server.start(options.port, options.host);
  return { server, address };
}
