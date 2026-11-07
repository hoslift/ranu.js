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

describe('Adversarial Stress Harness: ranu preview subcommand', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-adversarial-preview-'));
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
      fs.writeFileSync(path.join(staticAssets, 'app.js'), 'console.log("ranu app");');
      fs.writeFileSync(path.join(buildDir, 'static', 'favicon.ico'), 'icon-bytes');
      fs.writeFileSync(path.join(buildDir, 'static', 'logo.png'), 'png-bytes');
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

  describe('1. Directory Traversal Security Hardening', () => {
    it('strictly returns 403 Forbidden for all directory traversal attack payloads', async () => {
      setupBuildDir({ withStatic: true });

      let wrappedHandler: any = null;
      const dynamicMock = vi.fn().mockImplementation((_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('dynamic-fallback');
      });

      const serverMock = {
        listen: vi.fn().mockImplementation(async () => {
          setTimeout(() => process.emit('SIGINT'), 20);
          return { host: '127.0.0.1', port: 4173 };
        }),
        close: vi.fn().mockResolvedValue(undefined),
        requestHandler: dynamicMock,
        setRequestHandler: vi.fn((h) => {
          wrappedHandler = h;
        }),
      };
      vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      await runPreviewCommand({ args: [], root: tempDir }, logger);

      expect(wrappedHandler).toBeDefined();

      const traversalPayloads = [
        '/_ranu/assets/../../package.json',
        '/_ranu/assets/..\\..\\package.json',
        '/_ranu/assets/%2e%2e/%2e%2e/package.json',
        '/_ranu/assets/..%2f..%2fpackage.json',
        '/_ranu/assets/%2e%2e%2f%2e%2e%2fpackage.json',
        '/static/../../package.json',
        '/static/%2e%2e/%2e%2e/package.json',
        '/static/..\\..\\package.json',
        '/%2e%2e/package.json',
        '/..\\package.json',
        '/../package.json',
        '/..',
      ];

      for (const payload of traversalPayloads) {
        const req = { url: payload, method: 'GET' } as IncomingMessage;
        const res = createMockResponseStream();

        await wrappedHandler(req, res);

        expect(
          res.statusCode,
          `Expected 403 Forbidden for traversal payload: "${payload}", but received ${res.statusCode}`,
        ).toBe(403);
      }
    });
  });

  describe('2. Production Build Fallback', () => {
    it('exits with code 1 and error message when .ranu/build is missing and --build is omitted', async () => {
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');

      const exitCode = await runPreviewCommand({ args: [], root: tempDir }, logger);
      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Run "ranu build" first before starting the preview server, or pass "--build".'),
      );
    });

    it('triggers build when --build is specified and successfully starts preview server', async () => {
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
      vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      const exitCode = await runPreviewCommand({ args: [], root: tempDir, build: true }, logger);

      expect(exitCode).toBe(0);
      expect(buildSpy).toHaveBeenCalledOnce();
      expect(serverMock.listen).toHaveBeenCalledOnce();
    });

    it('cleanly aborts with exit code 1 when --build triggers a failing build', async () => {
      vi.spyOn(buildModule, 'build').mockResolvedValue({
        success: false,
        buildId: 'failed-build',
        outDir: path.join(tempDir, '.ranu', 'build'),
        duration: 40,
        diagnostics: [
          {
            code: 'RANU_BUILD_ERROR',
            message: 'Type error in layout',
            category: 'build',
            severity: 'error',
          },
        ],
      });

      const serverSpy = vi.spyOn(nodeServerModule, 'createProductionServer');
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');

      const exitCode = await runPreviewCommand({ args: [], root: tempDir, build: true }, logger);

      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith('Pre-preview build failed. Aborting preview server.');
      expect(serverSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Immutable Static Cache Headers & Dynamic Routing', () => {
    it('attaches Cache-Control: public, max-age=31536000, immutable to all static files', async () => {
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
        setRequestHandler: vi.fn((h) => {
          wrappedHandler = h;
        }),
      };
      vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      await runPreviewCommand({ args: [], root: tempDir }, logger);

      // 1. Framework hashed asset
      const resHashed = createMockResponseStream();
      await wrappedHandler({ url: '/_ranu/assets/app.js', method: 'GET' } as IncomingMessage, resHashed);
      expect(resHashed.getHeader('cache-control')).toBe('public, max-age=31536000, immutable');
      await new Promise<void>((resolve) => {
        resHashed.on('finish', resolve);
        resHashed.on('close', resolve);
        setTimeout(resolve, 60);
      });

      // 2. Direct static file: /favicon.ico
      const resFavicon = createMockResponseStream();
      await wrappedHandler({ url: '/favicon.ico', method: 'GET' } as IncomingMessage, resFavicon);
      expect(resFavicon.getHeader('cache-control')).toBe('public, max-age=31536000, immutable');
      await new Promise<void>((resolve) => {
        resFavicon.on('finish', resolve);
        resFavicon.on('close', resolve);
        setTimeout(resolve, 60);
      });

      // 3. Dynamic request does NOT receive immutable static headers
      const resDynamic = createMockResponseStream();
      await wrappedHandler({ url: '/dashboard', method: 'GET' } as IncomingMessage, resDynamic);
      expect(dynamicMock).toHaveBeenCalled();
      expect(resDynamic.getHeader('cache-control')).not.toBe('public, max-age=31536000, immutable');
    });
  });

  describe('4. Port & Host Binding and EADDRINUSE Resilience', () => {
    it('binds to custom --port and --host flags correctly', async () => {
      setupBuildDir();

      const serverMock = {
        listen: vi.fn().mockImplementation(async () => {
          setTimeout(() => process.emit('SIGINT'), 20);
          return { host: '0.0.0.0', port: 9999 };
        }),
        close: vi.fn().mockResolvedValue(undefined),
        setRequestHandler: vi.fn(),
      };
      const nodeServerSpy = vi
        .spyOn(nodeServerModule, 'createProductionServer')
        .mockResolvedValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      const exitCode = await runPreviewCommand(
        { args: [], root: tempDir, port: 9999, host: '0.0.0.0' },
        logger,
      );

      expect(exitCode).toBe(0);
      expect(nodeServerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ port: 9999, host: '0.0.0.0' }),
      );
    });

    it('catches EADDRINUSE error gracefully and exits with code 1', async () => {
      setupBuildDir();

      const addrErr = new Error('listen EADDRINUSE: address already in use 127.0.0.1:4173');
      (addrErr as any).code = 'EADDRINUSE';

      const serverMock = {
        listen: vi.fn().mockRejectedValue(addrErr),
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
  });
});
