import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createProductionServer,
  serveStaticFile,
  isPathContained,
  type NodeServer,
} from '@ranu/runtime-node';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';
import { runBuildCommand } from './build.js';

export interface PreviewCommandArgs extends ParsedCliArgs {
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly build?: boolean | undefined;
  readonly open?: boolean | undefined;
}

/**
 * Starts the production preview simulation server and waits for a termination signal.
 *
 * @param args - CLI options configuring host, port, build trigger, and output format.
 * @param logger - CLI logger instance for user messages.
 * @returns Exit code 0 upon graceful shutdown or 1 on configuration/build failure.
 */
export async function runPreviewCommand(args: PreviewCommandArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  const buildDir = path.join(ctx.projectRoot, '.ranu', 'build');
  const serverEntry = path.join(buildDir, 'server', 'entry.mjs');
  const buildJson = path.join(buildDir, 'build.json');
  const staticDir = path.join(buildDir, 'static');

  // 1. Build Artifact Verification & Auto-Build Trigger
  const isBuildMissing = !fs.existsSync(serverEntry) || !fs.existsSync(buildJson);
  if (isBuildMissing || args.build) {
    if (isBuildMissing && !args.build) {
      logger.error(
        `No valid production build found at "${buildDir}". Run "ranu build" first before starting the preview server, or pass "--build".`,
      );
      return 1;
    }

    if (args.build) {
      if (!args.json) {
        logger.info(
          isBuildMissing
            ? 'No production build found. Executing "ranu build" first (--build specified)...'
            : 'Executing "ranu build" before starting preview server (--build specified)...',
        );
      }
      const buildExitCode = await runBuildCommand(args, logger);
      if (buildExitCode !== 0) {
        logger.error('Pre-preview build failed. Aborting preview server.');
        return buildExitCode;
      }
    }
  }

  // 2. Port & Host Precedence (CLI flag -> Environment -> Default 4173 / 127.0.0.1)
  let envPort: number | undefined;
  if (process.env.PORT !== undefined && process.env.PORT.trim() !== '') {
    const parsed = Number(process.env.PORT.trim());
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
      envPort = parsed;
    }
  }
  const envHost = process.env.HOST?.trim() || undefined;

  const port = args.port ?? envPort ?? 4173;
  const host = args.host ?? envHost ?? '127.0.0.1';

  // 3. Dynamic import of the production server runtime entrypoint
  if (fs.existsSync(serverEntry)) {
    try {
      await import(pathToFileURL(serverEntry).href);
    } catch {
      // Gracefully continue if mock or already loaded
    }
  }

  // 4. Instantiate framework production server
  const server: NodeServer = await createProductionServer({
    projectRoot: ctx.projectRoot,
    buildDir,
    port,
    host,
    trustProxy: ctx.config.server.trustProxy,
  });

  // 5. Wrap Request Handler:
  //    - Serve static assets from .ranu/build/static with immutable cache headers
  //    - Route non-static requests to production server runtime entrypoint
  if (typeof (server as any).setRequestHandler === 'function') {
    const dynamicHandler = (server as any).requestHandler as (
      req: IncomingMessage,
      res: ServerResponse,
    ) => Promise<void>;

    server.setRequestHandler(async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (res.writableEnded || res.destroyed) {
        return;
      }

      const rawUrl = req.url ?? '/';
      const rawLower = rawUrl.toLowerCase();

      // 1. Comprehensive Path Traversal Guard on Raw Request URL
      if (
        rawLower.includes('..') ||
        rawLower.includes('%2e%2e') ||
        rawLower.includes('%2f') ||
        rawLower.includes('%5c') ||
        rawUrl.includes('\\')
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden: Path traversal is prohibited');
        return;
      }

      // 2. Decode Raw URL and Verify Traversal Invariants
      let decodedRaw: string;
      try {
        decodedRaw = decodeURIComponent(rawUrl);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      const decodedLower = decodedRaw.toLowerCase();
      if (
        decodedLower.includes('..') ||
        decodedLower.includes('\\') ||
        decodedLower.includes('%2e%2e') ||
        decodedLower.includes('%2f') ||
        decodedLower.includes('%5c')
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden: Path traversal is prohibited');
        return;
      }

      // 3. WHATWG URL Parsing & Path Normalization
      const parsedUrl = new URL(rawUrl, 'http://localhost');
      let pathname: string;
      try {
        pathname = decodeURIComponent(parsedUrl.pathname);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      const normalizedPath = path.posix.normalize(pathname);
      if (
        pathname.includes('..') ||
        normalizedPath.includes('..') ||
        pathname.includes('\\') ||
        normalizedPath.startsWith('/../') ||
        normalizedPath === '/..'
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden: Path traversal is prohibited');
        return;
      }

      // Static Asset Serving from .ranu/build/static
      if (fs.existsSync(staticDir)) {
        const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
        const staticAssetsDir = path.join(staticDir, 'assets');

        // 5a. Hashed Framework Assets: /_ranu/assets/<path>
        if (pathname.startsWith('/_ranu/assets/')) {
          const relPath = pathname.slice('/_ranu/assets/'.length);
          const targetFile = path.resolve(staticAssetsDir, '.' + path.sep + relPath);
          const relCheck = path.relative(staticAssetsDir, targetFile);
          if (
            relCheck.startsWith('..') ||
            path.isAbsolute(relCheck) ||
            !isPathContained(targetFile, staticAssetsDir)
          ) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden: Path traversal is prohibited');
            return;
          }
          if (serveStaticFile(targetFile, staticAssetsDir, req, res, IMMUTABLE_CACHE)) {
            return;
          }
        }

        // 5b. Direct Static Prefix: /static/<path>
        if (pathname.startsWith('/static/')) {
          const relPath = pathname.slice('/static/'.length);
          const targetFile = path.resolve(staticDir, '.' + path.sep + relPath);
          const relCheck = path.relative(staticDir, targetFile);
          if (
            relCheck.startsWith('..') ||
            path.isAbsolute(relCheck) ||
            !isPathContained(targetFile, staticDir)
          ) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden: Path traversal is prohibited');
            return;
          }
          if (serveStaticFile(targetFile, staticDir, req, res, IMMUTABLE_CACHE)) {
            return;
          }
        }

        // 5c. Root-Relative Static Assets (e.g., /favicon.ico, /assets/*)
        if (pathname !== '/' && !pathname.endsWith('.html')) {
          const relPath = pathname.replace(/^\/+/, '');
          const targetFile = path.resolve(staticDir, '.' + path.sep + relPath);
          if (
            isPathContained(targetFile, staticDir) &&
            fs.existsSync(targetFile) &&
            fs.statSync(targetFile).isFile()
          ) {
            if (serveStaticFile(targetFile, staticDir, req, res, IMMUTABLE_CACHE)) {
              return;
            }
          }
        }
      }

      // Dynamic Request Routing: Forward to Production Runtime Handler
      if (dynamicHandler) {
        await dynamicHandler(req, res);
      }
    });
  }

  // 6. Bind Server & Output Status
  let address;
  try {
    address = await server.listen(port, host);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. Try passing "--port <another-port>".`);
      return 1;
    }
    throw err;
  }

  const displayHost =
    address.host === '::' || address.host === '0.0.0.0' || address.host === ''
      ? '127.0.0.1'
      : address.host;

  const previewUrl = `http://${displayHost}:${address.port}`;

  if (args.json) {
    logger.json({
      status: 'ready',
      url: previewUrl,
      mode: 'preview',
      root: ctx.projectRoot,
      port: address.port,
      host: address.host,
    });
  } else {
    logger.log('');
    logger.success('Ranu.js production preview server listening');
    logger.log(`  \x1b[1mURL:\x1b[0m     \x1b[36m${previewUrl}\x1b[0m`);
    logger.log('  \x1b[1mMode:\x1b[0m    preview (production simulation)');
    logger.log(`  \x1b[1mRoot:\x1b[0m    ${ctx.projectRoot}`);
    logger.log('');
  }

  // 7. Handle Termination Signals (SIGINT / SIGTERM)
  return new Promise<number>((resolve) => {
    let isExiting = false;

    const cleanup = async () => {
      if (isExiting) return;
      isExiting = true;
      if (!args.json) {
        logger.log('\nShutting down Ranu.js production preview server...');
      }
      await server.close();
      resolve(0);
    };

    process.once('SIGINT', () => void cleanup());
    process.once('SIGTERM', () => void cleanup());
  });
}
