import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  initialBuildState: null as any,
  coordinators: [] as any[],
  watchers: [] as any[],
  channels: [] as any[],
  rendererOptions: [] as any[],
  runtimeOptions: [] as any[],
  runtimes: [] as any[],
  serveStaticFile: vi.fn(),
  toWebRequest: vi.fn(),
  writeWebResponse: vi.fn(),
  createRuntimeMiddleware: vi.fn(),
}));

vi.mock('../src/coordinator.js', () => ({
  RebuildCoordinator: class MockRebuildCoordinator {
    currentState: any = null;
    readonly options: any;
    readonly triggerRebuild = vi.fn(async () => {
      this.currentState = harness.initialBuildState;
      return harness.initialBuildState;
    });

    constructor(options: any) {
      this.options = options;
      harness.coordinators.push(this);
    }
  },
}));

vi.mock('../src/watcher.js', () => ({
  ProjectWatcher: class MockProjectWatcher {
    readonly options: any;
    readonly close = vi.fn();

    constructor(options: any) {
      this.options = options;
      harness.watchers.push(this);
    }
  },
}));

vi.mock('../src/channel.js', () => ({
  DevReloadChannel: class MockDevReloadChannel {
    readonly handleConnection = vi.fn((_req, res) => res.end('connected'));
    readonly broadcastReload = vi.fn();
    readonly broadcastError = vi.fn();
    readonly close = vi.fn();

    constructor() {
      harness.channels.push(this);
    }
  },
}));

vi.mock('../src/static.js', () => ({
  serveStaticFile: harness.serveStaticFile,
}));

vi.mock('@ranu/react', () => ({
  ReactRenderer: class MockReactRenderer {
    constructor(options: any) {
      harness.rendererOptions.push(options);
    }
  },
}));

vi.mock('@ranu/runtime', () => ({
  RanuServerRuntime: class MockRanuServerRuntime {
    readonly options: any;
    readonly handle = vi.fn(async () => new Response('runtime response'));
    readonly dispose = vi.fn();

    constructor(options: any) {
      this.options = options;
      harness.runtimeOptions.push(options);
      harness.runtimes.push(this);
    }
  },
  createRuntimeMiddleware: harness.createRuntimeMiddleware,
}));

vi.mock('@ranu/runtime-node', () => ({
  toWebRequest: harness.toWebRequest,
  writeWebResponse: harness.writeWebResponse,
}));

import { DevServer, createDevServer, startDevServer } from '../src/server.js';

function makeBuildState(projectRoot: string, overrides: Record<string, unknown> = {}) {
  return {
    generation: 1,
    buildId: 'dev-1-test',
    success: true,
    diagnostics: [],
    outDir: path.join(projectRoot, '.ranu', 'dev'),
    routes: [],
    routeRecords: [],
    timestamp: Date.now(),
    ...overrides,
  } as any;
}

function createHttpDoubles(url = '/', method = 'GET') {
  const req = Object.assign(new EventEmitter(), {
    url,
    method,
    headers: { host: 'localhost' },
  });
  const res = Object.assign(new EventEmitter(), {
    headersSent: false,
    writeHead: vi.fn(function (this: { headersSent: boolean }) {
      this.headersSent = true;
    }),
    end: vi.fn(),
  });
  return { req, res };
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function closeNativeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('DevServer focused coverage', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-server-coverage-'));
    harness.initialBuildState = makeBuildState(tempDir);
    harness.coordinators.length = 0;
    harness.watchers.length = 0;
    harness.channels.length = 0;
    harness.rendererOptions.length = 0;
    harness.runtimeOptions.length = 0;
    harness.runtimes.length = 0;
    harness.serveStaticFile.mockReset().mockReturnValue(false);
    harness.toWebRequest
      .mockReset()
      .mockImplementation((_req, signal) => new Request('http://localhost/', { signal }));
    harness.writeWebResponse.mockReset().mockResolvedValue(undefined);
    harness.createRuntimeMiddleware.mockReset().mockImplementation(() => ({
      run: vi.fn(async () => ({ type: 'next' })),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reloads versioned modules and exercises component and dispatch loaders', async () => {
    const server = createDevServer({ projectRoot: tempDir, watch: false });
    const privateServer = server as any;
    const outDir = path.join(tempDir, '.ranu', 'dev');
    const manifestDir = path.join(outDir, 'manifest');
    const serverDir = path.join(outDir, 'server');
    const layoutsDir = path.join(serverDir, 'layouts');
    const notFoundDir = path.join(serverDir, 'not-found');
    fs.mkdirSync(layoutsDir, { recursive: true });
    fs.mkdirSync(notFoundDir, { recursive: true });

    privateServer.reloadRuntime(makeBuildState(tempDir));
    expect(privateServer.runtime).toBeNull();

    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(path.join(manifestDir, 'routes.json'), '{}');
    fs.writeFileSync(path.join(manifestDir, 'client.json'), JSON.stringify({ assets: ['app.js'] }));
    fs.writeFileSync(path.join(serverDir, 'page.mjs'), 'export default function Page() {}');
    fs.writeFileSync(
      path.join(serverDir, 'api.mjs'),
      'export async function GET() { return new Response("get handler"); }\n' +
        'export default async function fallback() { return new Response("default handler"); }',
    );
    fs.writeFileSync(path.join(serverDir, 'no-handler.mjs'), 'export const value = 1;');
    fs.writeFileSync(
      path.join(serverDir, 'middleware.mjs'),
      'export default function middleware() {}',
    );

    const layoutPath = 'app/layout.tsx';
    const loadingPath = 'app/loading.tsx';
    const errorPath = 'app/error.tsx';
    const notFoundPath = 'app/not-found.tsx';
    const encoded = (value: string) => Buffer.from(value, 'utf8').toString('base64url');
    fs.writeFileSync(
      path.join(layoutsDir, `${encoded(layoutPath)}.mjs`),
      'export default function Layout() {}',
    );

    const state = makeBuildState(tempDir, {
      routes: [
        {
          routeId: 'page',
          sourceFile: path.join(tempDir, 'app', 'page.tsx'),
          outputRelativePath: 'server/page.mjs',
        },
        {
          routeId: 'api',
          sourceFile: path.join(tempDir, 'app', 'route.ts'),
          outputRelativePath: 'server/api.mjs',
        },
        {
          routeId: 'no-handler',
          sourceFile: path.join(tempDir, 'app', 'empty.ts'),
          outputRelativePath: 'server/no-handler.mjs',
        },
      ],
    });

    privateServer.reloadRuntime(state);
    const runtime = harness.runtimes[0];
    const runtimeOptions = harness.runtimeOptions[0];
    const loader = harness.rendererOptions[0].loader;
    const context = { requestId: 'request-1' };

    await runtimeOptions.middleware.run(new Request('http://localhost/'), context);
    await runtimeOptions.middleware.run(new Request('http://localhost/again'), context);
    expect(harness.createRuntimeMiddleware).toHaveBeenCalledOnce();

    expect(runtimeOptions.contextStore.get()).toBeUndefined();
    await runtimeOptions.contextStore.run(context, async () => {
      expect(runtimeOptions.contextStore.get()).toBe(context);
    });
    await expect(loader.loadPage('missing')).rejects.toThrow('not found');
    await expect(loader.loadPage('page')).resolves.toBeDefined();
    await expect(loader.loadPage('page')).resolves.toBeDefined();
    await expect(loader.loadLayout(layoutPath)).resolves.toBeDefined();
    await expect(loader.loadLoading(loadingPath)).resolves.toBeUndefined();
    await expect(loader.loadError(errorPath)).resolves.toBeUndefined();
    await expect(loader.loadNotFound(notFoundPath)).resolves.toBeUndefined();

    fs.writeFileSync(path.join(layoutsDir, `${encoded(loadingPath)}.mjs`), 'export default 1;');
    fs.writeFileSync(path.join(layoutsDir, `${encoded(errorPath)}.mjs`), 'export default 1;');
    fs.writeFileSync(path.join(notFoundDir, `${encoded(notFoundPath)}.mjs`), 'export default 1;');
    await expect(loader.loadLoading(loadingPath)).resolves.toBeDefined();
    await expect(loader.loadError(errorPath)).resolves.toBeDefined();
    await expect(loader.loadNotFound(notFoundPath)).resolves.toBeDefined();

    const requestContext = { requestId: 'api-request' };
    const missing = await runtimeOptions.apiDispatcher.dispatch(
      new Request('http://localhost/api'),
      requestContext,
      { routeId: 'missing' },
    );
    expect(missing.status).toBe(404);
    const methodNotAllowed = await runtimeOptions.apiDispatcher.dispatch(
      new Request('http://localhost/api', { method: 'DELETE' }),
      requestContext,
      { routeId: 'no-handler' },
    );
    expect(methodNotAllowed.status).toBe(405);
    const getResponse = await runtimeOptions.apiDispatcher.dispatch(
      new Request('http://localhost/api'),
      requestContext,
      { routeId: 'api' },
    );
    expect(await getResponse.text()).toBe('get handler');
    const defaultResponse = await runtimeOptions.apiDispatcher.dispatch(
      new Request('http://localhost/api', { method: 'POST' }),
      requestContext,
      { routeId: 'api' },
    );
    expect(await defaultResponse.text()).toBe('default handler');
    const staticResponse = await runtimeOptions.staticDispatcher.dispatch(
      new Request('http://localhost/file'),
      requestContext,
      { routeId: 'static', pathname: '/file' },
    );
    expect(staticResponse.status).toBe(404);

    fs.rmSync(path.join(manifestDir, 'client.json'));
    privateServer.reloadRuntime({ ...state, generation: 2, buildId: 'dev-2-test' });
    expect(runtime.dispose).toHaveBeenCalledOnce();

    await listen(server.httpServer);
    await server.close();
  });

  it('routes internal endpoints, fallbacks, diagnostics, and runtime responses', async () => {
    const server = createDevServer({ projectRoot: tempDir, watch: false });
    const privateServer = server as any;
    const coordinator = harness.coordinators[0];
    const channel = harness.channels[0];

    let doubles = createHttpDoubles('/bad%E0%A4%A');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(doubles.res.writeHead).toHaveBeenCalledWith(400, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    expect(doubles.res.end).toHaveBeenCalledWith('Bad Request');

    doubles = createHttpDoubles('/_ranu/dev-reload');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(channel.handleConnection).toHaveBeenCalled();

    doubles = createHttpDoubles('/_ranu/hmr');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(channel.handleConnection).toHaveBeenCalledTimes(2);

    doubles = createHttpDoubles('/_ranu/dev-client.js');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(doubles.res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'Content-Type': 'text/javascript; charset=utf-8',
      }),
    );

    harness.serveStaticFile.mockReset().mockReturnValueOnce(true);
    doubles = createHttpDoubles('/_ranu/assets/app.js');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(harness.serveStaticFile).toHaveBeenCalledOnce();

    harness.serveStaticFile.mockReset().mockReturnValueOnce(false).mockReturnValueOnce(true);
    doubles = createHttpDoubles('/_ranu/assets/missing.js');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(harness.serveStaticFile).toHaveBeenCalledTimes(2);

    harness.serveStaticFile.mockReset().mockReturnValueOnce(false).mockReturnValueOnce(true);
    doubles = createHttpDoubles('/new-public-file.txt');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(harness.serveStaticFile).toHaveBeenCalledTimes(2);

    harness.serveStaticFile.mockReset().mockReturnValue(false);
    coordinator.currentState = makeBuildState(tempDir, {
      success: false,
      diagnostics: [{ code: 'BROKEN_BUILD', severity: 'error', message: 'broken markup' }],
    });
    doubles = createHttpDoubles('/');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(doubles.res.writeHead).toHaveBeenCalledWith(500, {
      'Content-Type': 'text/html; charset=utf-8',
    });
    expect(doubles.res.end).toHaveBeenCalledWith(expect.stringContaining('BROKEN_BUILD'));

    coordinator.currentState = null;
    doubles = createHttpDoubles('/');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(doubles.res.writeHead).toHaveBeenCalledWith(503, {
      'Content-Type': 'text/plain; charset=utf-8',
    });

    const runtime = { handle: vi.fn() };
    privateServer.runtime = runtime;
    runtime.handle.mockResolvedValueOnce(
      new Response('<html><body>with body</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    doubles = createHttpDoubles('/page');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    let writtenResponse = harness.writeWebResponse.mock.calls.at(-1)?.[0] as Response;
    expect(await writtenResponse.text()).toContain('/_ranu/dev-client.js');
    expect(writtenResponse.headers.get('cache-control')).toContain('no-cache');

    runtime.handle.mockResolvedValueOnce(
      new Response('<main>without body</main>', { headers: { 'Content-Type': 'text/html' } }),
    );
    doubles = createHttpDoubles('/fragment');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    writtenResponse = harness.writeWebResponse.mock.calls.at(-1)?.[0] as Response;
    expect((await writtenResponse.text()).endsWith('/_ranu/dev-client.js"></script>\n')).toBe(true);

    runtime.handle.mockImplementationOnce(async () => {
      doubles.req.emit('aborted');
      return new Response('api response', { headers: { 'Content-Type': 'application/json' } });
    });
    doubles = createHttpDoubles('/api', 'HEAD');
    await privateServer.handleHttpRequest(doubles.req, doubles.res);
    expect(harness.toWebRequest.mock.calls.at(-1)?.[1].aborted).toBe(true);
    expect(harness.writeWebResponse).toHaveBeenLastCalledWith(
      expect.any(Response),
      doubles.res,
      expect.objectContaining({ suppressBody: true }),
    );
  });

  it('broadcasts build results and preserves the runtime when reload fails', () => {
    const server = createDevServer({ projectRoot: tempDir, watch: false });
    const privateServer = server as any;
    const channel = harness.channels[0];
    const reload = vi.spyOn(privateServer, 'reloadRuntime').mockImplementation(() => {});
    const success = makeBuildState(tempDir);

    privateServer.handleBuildComplete(success);
    expect(channel.broadcastReload).toHaveBeenCalledWith({
      buildId: success.buildId,
      generation: success.generation,
      reason: 'rebuild',
    });

    reload.mockImplementationOnce(() => {
      throw new Error('reload failed');
    });
    expect(() => privateServer.handleBuildComplete(success)).not.toThrow();
    expect(channel.broadcastError).toHaveBeenCalledWith([
      expect.objectContaining({ code: 'RANU_DEV_RUNTIME_RELOAD_FAILED' }),
    ]);

    const failure = makeBuildState(tempDir, {
      success: false,
      diagnostics: [{ code: 'BUILD_FAILED', severity: 'error', message: 'failed' }],
    });
    privateServer.handleBuildComplete(failure);
    expect(channel.broadcastError).toHaveBeenCalledWith(failure.diagnostics);
  });

  it('starts watching, rebuilds, and cleans up lifecycle resources', async () => {
    const server = createDevServer({ projectRoot: tempDir });
    const privateServer = server as any;
    vi.spyOn(privateServer, 'reloadRuntime').mockImplementation(() => {});

    const address = await server.start(0, '0.0.0.0');
    expect(address.url).toBe(`http://localhost:${address.port}`);
    expect(harness.watchers).toHaveLength(1);

    const events = [
      { relativePath: 'app/page.tsx', fullPath: 'app/page.tsx', type: 'change', category: 'route' },
    ];
    harness.watchers[0].options.onChange(events);
    await Promise.resolve();
    expect(harness.coordinators[0].triggerRebuild).toHaveBeenCalledWith('app/page.tsx', events);
    await server.rebuild('manual');
    expect(harness.coordinators[0].triggerRebuild).toHaveBeenCalledWith('manual');

    const runtime = { dispose: vi.fn() };
    const socket = { destroy: vi.fn() };
    privateServer.runtime = runtime;
    privateServer.connections.add(socket);
    const failedCopy = path.join(tempDir, 'failed-copy.mjs');
    privateServer.versionedModuleCopies.add(failedCopy);
    const realRmSync = fs.rmSync.bind(fs);
    vi.spyOn(fs, 'rmSync').mockImplementation(((target, options) => {
      if (target === failedCopy) throw new Error('locked');
      return realRmSync(target, options as any);
    }) as typeof fs.rmSync);

    await expect(server.close()).resolves.toBeUndefined();
    await expect(server.close()).resolves.toBeUndefined();
    expect(harness.watchers[0].close).toHaveBeenCalledOnce();
    expect(harness.channels[0].close).toHaveBeenCalledOnce();
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(socket.destroy).toHaveBeenCalledOnce();
  });

  it('cleans watcher resources when listening fails', async () => {
    const occupied = http.createServer();
    await listen(occupied);
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const server = createDevServer({ projectRoot: tempDir });
    vi.spyOn(server as any, 'reloadRuntime').mockImplementation(() => {});

    try {
      await expect(server.start(address.port, '127.0.0.1')).rejects.toMatchObject({
        code: 'EADDRINUSE',
      });
      expect(harness.watchers[0].close).toHaveBeenCalledOnce();
      expect(harness.channels[0].close).toHaveBeenCalledOnce();
    } finally {
      await closeNativeServer(occupied);
    }
  });

  it('propagates native close errors', async () => {
    const server = new DevServer({ projectRoot: tempDir, watch: false });
    vi.spyOn(server.httpServer, 'close').mockImplementation(((
      callback?: (error?: Error) => void,
    ) => {
      callback?.(new Error('close failed'));
      return server.httpServer;
    }) as typeof server.httpServer.close);

    await expect(server.close()).rejects.toThrow('close failed');
  });

  it('returns a 500 response when the request handler rejects', async () => {
    const server = createDevServer({ projectRoot: tempDir, watch: false });
    vi.spyOn(server as any, 'handleHttpRequest').mockRejectedValue(new Error('request exploded'));
    await listen(server.httpServer);
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');

    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('request exploded');

    await server.close();
  });

  it('starts a server through the convenience helper', async () => {
    const result = await startDevServer({
      projectRoot: tempDir,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });

    expect(result.server).toBeInstanceOf(DevServer);
    expect(result.address.port).toBeGreaterThan(0);
    await result.server.close();
  });
});
