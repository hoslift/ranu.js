import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as buildModule from '@ranu/build';
import * as nodeServerModule from '@ranu/runtime-node';
import { runPreviewCommand } from '../src/commands/preview.js';
import { createCliLogger } from '../src/logger.js';

describe('runPreviewCommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-preview-test-'));
    fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupBuildDir(options: { withStatic?: boolean } = {}) {
    const buildDir = path.join(tempDir, '.ranu', 'build');
    const serverDir = path.join(buildDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'entry.mjs'), 'export default {};');
    fs.writeFileSync(path.join(buildDir, 'build.json'), '{}');

    if (options.withStatic) {
      const staticAssets = path.join(buildDir, 'static', 'assets');
      fs.mkdirSync(staticAssets, { recursive: true });
      fs.writeFileSync(path.join(staticAssets, 'bundle.js'), 'console.log("hello");');
      fs.writeFileSync(path.join(buildDir, 'static', 'favicon.ico'), 'icon-data');
    }

    return buildDir;
  }

  function createMockResponseStream(): ServerResponse & {
    headers: Record<string, string>;
    body: () => string;
    getHeader: (key: string) => string | undefined;
    statusCode: number;
  } {
    const stream = new PassThrough();
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let body = '';

    (stream as any).headers = headers;
    (stream as any).writeHead = vi.fn((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          headers[k.toLowerCase()] = v;
        }
      }
    });
    (stream as any).setHeader = vi.fn((key: string, val: string) => {
      headers[key.toLowerCase()] = val;
    });
    (stream as any).getHeader = (key: string) => headers[key.toLowerCase()];
    Object.defineProperty(stream, 'statusCode', {
      get() {
        return statusCode;
      },
      set(val) {
        statusCode = val;
      },
    });
    stream.on('data', (chunk) => {
      body += chunk.toString();
    });
    (stream as any).body = () => body;

    return stream as unknown as ServerResponse & {
      headers: Record<string, string>;
      body: () => string;
      getHeader: (key: string) => string | undefined;
      statusCode: number;
    };
  }

  it('exits with 1 when production build is missing and --build is not passed', async () => {
    const logger = createCliLogger({ quiet: true });
    const errorSpy = vi.spyOn(logger, 'error');

    const exitCode = await runPreviewCommand({ args: [], root: tempDir }, logger);
    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Run "ranu build" first before starting the preview server, or pass "--build".'),
    );
  });

  it('triggers build when production build is missing and --build is passed', async () => {
    const buildSpy = vi.spyOn(buildModule, 'build').mockImplementation(async () => {
      setupBuildDir();
      return {
        success: true,
        buildId: 'test-build',
        outDir: path.join(tempDir, '.ranu', 'build'),
        duration: 50,
        diagnostics: [],
      };
    });

    const serverMock = {
      listen: vi.fn().mockImplementation(async () => {
        setTimeout(() => process.emit('SIGINT'), 20);
        return { host: '127.0.0.1', port: 4173 };
      }),
      close: vi.fn().mockResolvedValue(undefined),
      setRequestHandler: vi.fn(),
    };
    const nodeServerSpy = vi
      .spyOn(nodeServerModule, 'createProductionServer')
      .mockResolvedValue(serverMock as any);

    const logger = createCliLogger({ quiet: true });
    const promise = runPreviewCommand({ args: [], root: tempDir, build: true }, logger);

    const exitCode = await promise;
    expect(exitCode).toBe(0);
    expect(buildSpy).toHaveBeenCalledOnce();
    expect(nodeServerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 4173,
        host: '127.0.0.1',
      }),
    );
  });

  it('aborts preview when auto-build fails', async () => {
    vi.spyOn(buildModule, 'build').mockResolvedValue({
      success: false,
      buildId: 'test-build',
      outDir: path.join(tempDir, '.ranu', 'build'),
      duration: 50,
      diagnostics: [
        {
          code: 'RANU_BUILD_ERROR',
          message: 'Syntax error',
          category: 'syntax',
          severity: 'error',
        },
      ],
    });

    const logger = createCliLogger({ quiet: true });
    const errorSpy = vi.spyOn(logger, 'error');

    const exitCode = await runPreviewCommand({ args: [], root: tempDir, build: true }, logger);
    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('Pre-preview build failed. Aborting preview server.');
  });

  it('defaults to port 4173 and host 127.0.0.1', async () => {
    setupBuildDir();

    const serverMock = {
      listen: vi.fn().mockImplementation(async () => {
        setTimeout(() => process.emit('SIGTERM'), 20);
        return { host: '127.0.0.1', port: 4173 };
      }),
      close: vi.fn().mockResolvedValue(undefined),
      setRequestHandler: vi.fn(),
    };
    const nodeServerSpy = vi
      .spyOn(nodeServerModule, 'createProductionServer')
      .mockResolvedValue(serverMock as any);

    const logger = createCliLogger({ quiet: true });
    const jsonSpy = vi.spyOn(logger, 'json');

    const promise = runPreviewCommand({ args: [], root: tempDir, json: true }, logger);

    const exitCode = await promise;
    expect(exitCode).toBe(0);
    expect(nodeServerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 4173,
        host: '127.0.0.1',
      }),
    );
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready',
        url: 'http://127.0.0.1:4173',
        mode: 'preview',
      }),
    );
  });

  it('respects CLI overrides --port and --host, and environment variables', async () => {
    setupBuildDir();

    const serverMock = {
      listen: vi.fn().mockImplementation(async () => {
        setTimeout(() => process.emit('SIGINT'), 20);
        return { host: '0.0.0.0', port: 8080 };
      }),
      close: vi.fn().mockResolvedValue(undefined),
      setRequestHandler: vi.fn(),
    };
    const nodeServerSpy = vi
      .spyOn(nodeServerModule, 'createProductionServer')
      .mockResolvedValue(serverMock as any);

    const logger = createCliLogger({ quiet: true });

    // Test CLI flags override
    let promise = runPreviewCommand(
      { args: [], root: tempDir, port: 8080, host: '0.0.0.0' },
      logger,
    );
    let code = await promise;
    expect(code).toBe(0);
    expect(nodeServerSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ port: 8080, host: '0.0.0.0' }),
    );

    // Test environment variables
    const prevPort = process.env.PORT;
    const prevHost = process.env.HOST;
    process.env.PORT = '5555';
    process.env.HOST = 'env.host.local';

    try {
      serverMock.listen.mockImplementation(async () => {
        setTimeout(() => process.emit('SIGINT'), 20);
        return { host: 'env.host.local', port: 5555 };
      });
      promise = runPreviewCommand({ args: [], root: tempDir }, logger);
      code = await promise;
      expect(code).toBe(0);
      expect(nodeServerSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ port: 5555, host: 'env.host.local' }),
      );
    } finally {
      if (prevPort === undefined) delete process.env.PORT;
      else process.env.PORT = prevPort;
      if (prevHost === undefined) delete process.env.HOST;
      else process.env.HOST = prevHost;
    }
  });

  it('handles EADDRINUSE error gracefully', async () => {
    setupBuildDir();

    const err = new Error('bind EADDRINUSE 127.0.0.1:4173');
    (err as any).code = 'EADDRINUSE';

    const serverMock = {
      listen: vi.fn().mockRejectedValue(err),
      close: vi.fn().mockResolvedValue(undefined),
      setRequestHandler: vi.fn(),
    };
    vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

    const logger = createCliLogger({ quiet: true });
    const errorSpy = vi.spyOn(logger, 'error');

    const exitCode = await runPreviewCommand({ args: [], root: tempDir }, logger);
    expect(exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port 4173 is already in use. Try passing "--port <another-port>".'),
    );
  });

  it('serves static assets with immutable Cache-Control and routes dynamic requests', async () => {
    setupBuildDir({ withStatic: true });

    let wrappedHandler: any = null;
    const dynamicMock = vi.fn().mockImplementation((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Dynamic Page</h1>');
    });

    const serverMock = {
      listen: vi.fn().mockImplementation(async () => {
        setTimeout(() => process.emit('SIGINT'), 20);
        return { host: '127.0.0.1', port: 4173 };
      }),
      close: vi.fn().mockResolvedValue(undefined),
      requestHandler: dynamicMock,
      setRequestHandler: vi.fn((handler) => {
        wrappedHandler = handler;
      }),
    };
    vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

    const logger = createCliLogger({ quiet: true });
    const promise = runPreviewCommand({ args: [], root: tempDir }, logger);
    await promise;

    expect(wrappedHandler).toBeDefined();

    // 1. Framework hashed asset: /_ranu/assets/bundle.js
    const reqHashed = { url: '/_ranu/assets/bundle.js', method: 'GET' } as IncomingMessage;
    const resHashed = createMockResponseStream();
    await wrappedHandler(reqHashed, resHashed);
    expect(resHashed.getHeader('cache-control')).toBe('public, max-age=31536000, immutable');
    await new Promise<void>((resolve) => {
      resHashed.on('finish', resolve);
      resHashed.on('close', resolve);
      setTimeout(resolve, 50);
    });

    // 2. Traversal attempt: /_ranu/assets/../../secret.txt
    const reqTraversal = { url: '/_ranu/assets/../../secret.txt', method: 'GET' } as IncomingMessage;
    const resTraversal = createMockResponseStream();
    await wrappedHandler(reqTraversal, resTraversal);
    expect(resTraversal.statusCode).toBe(403);

    // 3. Root-relative file: /favicon.ico
    const reqFavicon = { url: '/favicon.ico', method: 'GET' } as IncomingMessage;
    const resFavicon = createMockResponseStream();
    await wrappedHandler(reqFavicon, resFavicon);
    expect(resFavicon.getHeader('cache-control')).toBe('public, max-age=31536000, immutable');
    await new Promise<void>((resolve) => {
      resFavicon.on('finish', resolve);
      resFavicon.on('close', resolve);
      setTimeout(resolve, 50);
    });

    // 4. Dynamic request: /about
    const reqDynamic = { url: '/about', method: 'GET' } as IncomingMessage;
    const resDynamic = createMockResponseStream();
    await wrappedHandler(reqDynamic, resDynamic);
    expect(dynamicMock).toHaveBeenCalledWith(reqDynamic, resDynamic);
  });
});
