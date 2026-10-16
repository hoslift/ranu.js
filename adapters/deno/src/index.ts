import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import type {
  RanuDeploymentAdapter,
  DeploymentCapabilities,
  DeploymentAdapterContext,
  DeploymentResult,
} from '@ranu/core';
import type {
  BuildDescriptor,
  RouteManifest,
  ServerManifest,
  StaticManifest,
} from '@ranu/manifests';

export const adapterName = 'deno';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for native Deno runtime deployment target.
 */
export const DENO_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'deno',
  ssr: true,
  apiRoutes: true,
  middleware: false,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'temporary',
  longLivedProcess: true,
  supportsWaitUntil: false,
};

export interface DenoAdapterOptions {
  /** Output directory for standalone Deno production distribution (default: 'dist' or 'dist-deno') */
  outputDir?: string | undefined;
  /** Default host interface to bind (default: '0.0.0.0') */
  host?: string | undefined;
  /** Default port to bind (default: 3000) */
  port?: number | undefined;
  /** Trust reverse proxy headers (X-Forwarded-For, X-Forwarded-Proto) (default: true) */
  trustProxy?: boolean | undefined;
  /** Request body size limit in bytes (default: 10485760 / 10MB) */
  bodyLimit?: number | undefined;
  /** Maximum grace period in milliseconds for in-flight requests during shutdown (default: 5000) */
  shutdownTimeout?: number | undefined;
  /** Generate deno.json configuration with least privilege sandbox permissions (default: true) */
  denoConfig?: boolean | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
  /** Bundle standalone server.mjs with esbuild (default: true) */
  bundle?: boolean | undefined;
  /** Additional external module specifiers excluded from bundling */
  external?: string[] | undefined;
}

export interface DenoConfigOptions {
  entrypoint?: string | undefined;
}

/**
 * Generates standard deno.json configuration with least privilege sandbox permissions.
 */
export function generateDenoConfig(options: DenoConfigOptions = {}): string {
  const entrypoint = options.entrypoint ?? 'server.mjs';

  const config = {
    tasks: {
      start: `deno run --allow-net --allow-read --allow-env ${entrypoint}`,
    },
    compilerOptions: {
      lib: ['deno.window', 'dom'],
    },
  };

  return JSON.stringify(config, null, 2) + '\n';
}

/**
 * Checks whether childPath is strictly contained inside parentDir (path traversal prevention).
 */
export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Asserts that destination or any parent directory is not a symbolic link.
 */
export function assertNoDestinationSymlink(destination: string, authorizedRoot: string): void {
  let current = path.resolve(destination);
  const root = path.resolve(authorizedRoot);

  while (isPathContained(current, root)) {
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Refusing to copy through symbolic link "${current}".`);
    }
    if (current === root) break;
    current = path.dirname(current);
  }
}

/**
 * Recursively copies a directory while safely skipping forbidden/sensitive files.
 */
export function copyDirectorySafe(
  srcDir: string,
  destDir: string,
  authorizedRoot: string,
  forbiddenNames: readonly string[] = [],
): string[] {
  const copiedFiles: string[] = [];
  if (!fs.existsSync(srcDir)) return copiedFiles;

  assertNoDestinationSymlink(destDir, authorizedRoot);
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    const isForbidden = forbiddenNames.some((forbidden) => {
      if (forbidden.startsWith('.')) {
        return entry.name.startsWith(forbidden) || entry.name.endsWith(forbidden);
      }
      return (
        entry.name.startsWith(forbidden) ||
        entry.name.endsWith(forbidden) ||
        entry.name === forbidden
      );
    });

    if (isForbidden) {
      continue;
    }

    if (!isPathContained(destPath, authorizedRoot)) {
      throw new Error(`Path traversal attempt detected when copying to "${destPath}".`);
    }

    if (entry.isDirectory()) {
      const nested = copyDirectorySafe(srcPath, destPath, authorizedRoot, forbiddenNames);
      copiedFiles.push(...nested);
    } else if (entry.isFile()) {
      assertNoDestinationSymlink(destPath, authorizedRoot);
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(destPath);
    }
  }

  return copiedFiles;
}

/**
 * Creates a native Deno production deployment adapter instance for Ranu.js.
 */
export function createDenoAdapter(options: DenoAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: DENO_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();

      const projectRoot = path.resolve(context.projectRoot);
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(
        context.outputDir ?? options.outputDir ?? path.join(projectRoot, 'dist'),
      );

      // 1. Output directory boundary validations
      if (outputDir === projectRoot || outputDir === buildDir) {
        throw new Error(
          `Deno adapter output directory cannot be equal to project root or build directory: "${outputDir}".`,
        );
      }

      if (isPathContained(projectRoot, outputDir)) {
        throw new Error(
          `Deno adapter output directory cannot contain the project root: "${outputDir}".`,
        );
      }

      // 2. Clean output directory if configured
      if (options.clean !== false && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      // 3. Verify production build existence
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      if (!fs.existsSync(buildDescriptorPath)) {
        throw new Error(
          `No production build found at "${buildDir}". Run "ranu build" first before running the adapter.`,
        );
      }

      const buildDescriptor: BuildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8'),
      );

      // 4. Runtime compatibility validation
      if ((buildDescriptor.runtime as string) !== 'node') {
        throw new Error(
          `Deno adapter requires build runtime target "node", but received "${String((buildDescriptor as { runtime?: unknown }).runtime)}".`,
        );
      }

      // 5. Ingest and validate manifests
      const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
      const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
      const clientManifestPath = path.resolve(buildDir, buildDescriptor.manifests.client);
      const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);

      if (!fs.existsSync(routesManifestPath) || !fs.existsSync(serverManifestPath)) {
        throw new Error(
          `Corrupt build at "${buildDir}": missing required route or server manifests.`,
        );
      }

      const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
      const serverManifest: ServerManifest = JSON.parse(
        fs.readFileSync(serverManifestPath, 'utf8'),
      );
      const clientManifest = fs.existsSync(clientManifestPath)
        ? JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'))
        : { assets: {} };
      const staticManifest: StaticManifest = fs.existsSync(staticManifestPath)
        ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
        : { schemaVersion: 1, buildId: buildDescriptor.buildId, routes: [] };

      const emittedFiles: string[] = [];
      const forbiddenStaticPatterns = ['.env', '.git', '.DS_Store', '.map', 'server'];

      // 6. Copy build manifests and artifacts
      const buildIdPath = path.join(buildDir, 'BUILD_ID');
      if (fs.existsSync(buildIdPath)) {
        const destBuildId = path.join(outputDir, 'BUILD_ID');
        assertNoDestinationSymlink(destBuildId, outputDir);
        fs.copyFileSync(buildIdPath, destBuildId);
        emittedFiles.push(destBuildId);
      }

      const destBuildJson = path.join(outputDir, 'build.json');
      assertNoDestinationSymlink(destBuildJson, outputDir);
      fs.copyFileSync(buildDescriptorPath, destBuildJson);
      emittedFiles.push(destBuildJson);

      const buildManifestDir = path.join(buildDir, 'manifest');
      if (fs.existsSync(buildManifestDir)) {
        const destManifestDir = path.join(outputDir, 'manifest');
        const copiedManifests = copyDirectorySafe(
          buildManifestDir,
          destManifestDir,
          outputDir,
          ['.env', '.git', '.DS_Store', '.map'],
        );
        emittedFiles.push(...copiedManifests);
      }

      const buildServerDir = path.join(buildDir, 'server');
      if (fs.existsSync(buildServerDir)) {
        const destServerDir = path.join(outputDir, 'server');
        const copiedServer = copyDirectorySafe(
          buildServerDir,
          destServerDir,
          outputDir,
          ['.env', '.git', '.DS_Store', '.map'],
        );
        emittedFiles.push(...copiedServer);
      }

      // 7. Copy static assets and pre-rendered pages
      const buildStaticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(buildStaticAssetsDir)) {
        const destStaticAssets = path.join(outputDir, 'static', 'assets');
        const destRanuAssets = path.join(outputDir, '_ranu', 'assets');
        const copiedStatic = copyDirectorySafe(
          buildStaticAssetsDir,
          destStaticAssets,
          outputDir,
          forbiddenStaticPatterns,
        );
        const copiedRanu = copyDirectorySafe(
          buildStaticAssetsDir,
          destRanuAssets,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedStatic, ...copiedRanu);
      }

      const buildStaticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(buildStaticPagesDir)) {
        const destStaticPages = path.join(outputDir, 'static', 'pages');
        const copiedPages = copyDirectorySafe(
          buildStaticPagesDir,
          destStaticPages,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPages);
      }

      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const destPublic = path.join(outputDir, 'public');
        const copiedPublic = copyDirectorySafe(
          publicDir,
          destPublic,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPublic);
      }

      // 8. Generate production package.json
      const pkgPath = path.join(outputDir, 'package.json');
      assertNoDestinationSymlink(pkgPath, outputDir);
      const pkgJsonContent = {
        name: 'ranu-deno-production',
        version: '1.0.0',
        type: 'module',
        main: 'server.mjs',
        scripts: {
          start: 'deno task start',
        },
      };
      fs.writeFileSync(pkgPath, JSON.stringify(pkgJsonContent, null, 2), 'utf8');
      emittedFiles.push(pkgPath);

      // 9. Generate deno.json configuration with sandbox permissions
      if (options.denoConfig !== false) {
        const denoJsonPath = path.join(outputDir, 'deno.json');
        assertNoDestinationSymlink(denoJsonPath, outputDir);
        fs.writeFileSync(denoJsonPath, generateDenoConfig({ entrypoint: 'server.mjs' }), 'utf8');
        emittedFiles.push(denoJsonPath);
      }

      // 10. Generate native Deno production server entrypoint (server.mjs)
      const defaultPort = options.port ?? 3000;
      const defaultHost = options.host ?? '0.0.0.0';

      const serverSource = `// Native Deno Production Server for Ranu.js
// Generated by @ranujs/adapter-deno (Build ID: ${buildDescriptor.buildId})

import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import {
  createProductionRuntime,
  writeWebResponse,
} from '@ranu/runtime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultPort = parseInt(process.env.PORT || '${defaultPort}', 10);
export const defaultHost = process.env.HOST || '${defaultHost}';

const MIME_TYPES = {
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
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPathContained(childPath, parentDir) {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function serveStaticFileResponse(filePath, authorizedRoot, cacheControl, method = 'GET') {
  const normalizedRoot = path.resolve(authorizedRoot);
  const normalizedFile = path.resolve(filePath);

  if (!isPathContained(normalizedFile, normalizedRoot)) {
    return new Response('Forbidden: Path traversal is prohibited', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  if (!fs.existsSync(normalizedFile)) {
    return null;
  }

  let realFile;
  let realRoot;
  try {
    realFile = fs.realpathSync(normalizedFile);
    realRoot = fs.realpathSync(normalizedRoot);
  } catch {
    return null;
  }

  if (!isPathContained(realFile, realRoot)) {
    return new Response('Forbidden: Path traversal is prohibited', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const stat = fs.statSync(realFile);
  if (!stat.isFile()) {
    return null;
  }

  const contentType = getMimeType(realFile);
  const headers = {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': cacheControl,
  };

  if (method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  if (typeof Deno !== 'undefined' && typeof Deno.open === 'function') {
    const file = await Deno.open(realFile, { read: true });
    return new Response(file.readable, { status: 200, headers });
  }

  const buf = fs.readFileSync(realFile);
  return new Response(buf, { status: 200, headers });
}

export function createDenoHandler(customOptions = {}) {
  const projectRoot = customOptions.projectRoot || __dirname;
  const buildDir = customOptions.buildDir || __dirname;
  let runtimePromise = null;

  async function getRuntime() {
    if (!runtimePromise) {
      runtimePromise = createProductionRuntime({ projectRoot, buildDir });
    }
    return runtimePromise;
  }

  const staticPagesDir = path.join(buildDir, 'static', 'pages');
  const staticAssetsDir = path.join(buildDir, 'static', 'assets');
  const ranuAssetsDir = path.join(buildDir, '_ranu', 'assets');
  const publicDir = path.join(projectRoot, 'public');

  return async function handleRequest(request) {
    const rawUrl = request.url || '/';
    let url;
    try {
      url = new URL(rawUrl, 'http://localhost');
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Traversal check
    if (
      rawUrl.includes('/..') ||
      rawUrl.includes('\\..') ||
      pathname.includes('/../') ||
      pathname.includes('\\\\..\\\\') ||
      pathname.endsWith('/..') ||
      pathname.endsWith('\\\\..')
    ) {
      return new Response('Forbidden: Path traversal is prohibited', { status: 403 });
    }

    // Dotfile check
    const segments = pathname.split(/[\\\\/]/).filter(Boolean);
    if (segments.some((seg) => seg.startsWith('.'))) {
      return new Response('Forbidden: Access to hidden files is prohibited', { status: 403 });
    }

    const method = (request.method || 'GET').toUpperCase();

    // 1. Immutable framework client assets (/_ranu/assets/*)
    if (pathname.startsWith('/_ranu/assets/')) {
      const rel = pathname.slice('/_ranu/assets/'.length);
      const targetDir = fs.existsSync(ranuAssetsDir) ? ranuAssetsDir : staticAssetsDir;
      const targetPath = path.resolve(targetDir, '.' + path.sep + rel);
      const res = await serveStaticFileResponse(
        targetPath,
        targetDir,
        'public, max-age=31536000, immutable',
        method,
      );
      if (res) return res;
    }

    // 2. Static assets (/static/assets/*)
    if (pathname.startsWith('/static/assets/')) {
      const rel = pathname.slice('/static/assets/'.length);
      const targetPath = path.resolve(staticAssetsDir, '.' + path.sep + rel);
      const res = await serveStaticFileResponse(
        targetPath,
        staticAssetsDir,
        'public, max-age=31536000, immutable',
        method,
      );
      if (res) return res;
    }

    // 3. Pre-rendered static pages
    if (fs.existsSync(staticPagesDir)) {
      const cleanPath = pathname === '/' ? 'index' : pathname.replace(/^\\//, '');
      const candidateHtml = path.resolve(staticPagesDir, '.' + path.sep + cleanPath + '.html');
      const res1 = await serveStaticFileResponse(
        candidateHtml,
        staticPagesDir,
        'public, max-age=0, must-revalidate',
        method,
      );
      if (res1) return res1;

      const candidateDirect = path.resolve(staticPagesDir, '.' + path.sep + cleanPath);
      const res2 = await serveStaticFileResponse(
        candidateDirect,
        staticPagesDir,
        'public, max-age=0, must-revalidate',
        method,
      );
      if (res2) return res2;
    }

    // 4. Public assets fallback (/robots.txt, /favicon.ico)
    if (fs.existsSync(publicDir)) {
      const rel = pathname.replace(/^\\//, '');
      if (rel) {
        const targetPath = path.resolve(publicDir, '.' + path.sep + rel);
        const res = await serveStaticFileResponse(
          targetPath,
          publicDir,
          'public, max-age=3600',
          method,
        );
        if (res) return res;
      }
    }

    // 5. Dynamic SSR and API route dispatching
    const runtime = await getRuntime();
    return await runtime.handle(request);
  };
}

export async function startServer(customOptions = {}) {
  const port = customOptions.port ?? defaultPort;
  const host = customOptions.host ?? defaultHost;
  const handler = createDenoHandler(customOptions);

  if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
    const server = Deno.serve(
      {
        port,
        hostname: host,
        onListen({ hostname, port }) {
          console.log(\`Ranu.js production server listening on http://\${hostname}:\${port}\`);
        },
      },
      handler,
    );
    return {
      server,
      address: { host, port: server.addr?.port ?? port },
      close: async () => {
        await server.shutdown();
      },
    };
  }

  // Node HTTP fallback for zero-binary test environments
  const httpServer = http.createServer(async (req, res) => {
    try {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const authority = req.headers['host'] || \`\${host}:\${port}\`;
      const url = new URL(req.url || '/', \`\${protocol}://\${authority}\`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else {
          headers.set(key, value);
        }
      }

      const method = (req.method || 'GET').toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD';
      let body = null;
      if (hasBody) {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const webReq = new Request(url.href, {
        method,
        headers,
        body,
        duplex: hasBody ? 'half' : undefined,
      });

      const webRes = await handler(webReq);
      const abortController = new AbortController();
      const suppressBody = method === 'HEAD';
      await writeWebResponse(webRes, res, {
        signal: abortController.signal,
        suppressBody,
      });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Internal Server Error');
    }
  });

  await new Promise((resolve, reject) => {
    httpServer.listen(port, host, () => resolve());
    httpServer.on('error', reject);
  });

  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const actualHost = typeof addr === 'object' && addr ? addr.address : host;

  return {
    server: httpServer,
    httpServer,
    address: { host: actualHost, port: actualPort },
    close: async () => {
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

export default {
  port: defaultPort,
  hostname: defaultHost,
  fetch: createDenoHandler(),
};
`;

      const serverOutPath = path.join(outputDir, 'server.mjs');
      const indexOutPath = path.join(outputDir, 'index.mjs');

      assertNoDestinationSymlink(serverOutPath, outputDir);
      assertNoDestinationSymlink(indexOutPath, outputDir);

      const sourceDir = path.dirname(fileURLToPath(import.meta.url));
      const workspaceRuntimeEntry = path.resolve(
        sourceDir,
        '../../../packages/runtime-node/src/index.ts',
      );
      const workspacePackageAliases: Record<string, string> = fs.existsSync(workspaceRuntimeEntry)
        ? {
            '@ranu/core': path.resolve(sourceDir, '../../../packages/core/src/index.ts'),
            '@ranu/diagnostics': path.resolve(
              sourceDir,
              '../../../packages/diagnostics/src/index.ts',
            ),
            '@ranu/manifests': path.resolve(sourceDir, '../../../packages/manifests/src/index.ts'),
            '@ranu/react': path.resolve(sourceDir, '../../../packages/react/src/index.ts'),
            '@ranu/router': path.resolve(sourceDir, '../../../packages/router/src/index.ts'),
            '@ranu/runtime': path.resolve(sourceDir, '../../../packages/runtime/src/index.ts'),
            '@ranu/runtime-node': workspaceRuntimeEntry,
          }
        : {};

      if (options.bundle !== false) {
        try {
          buildSync({
            stdin: {
              contents: serverSource,
              loader: 'js',
              resolveDir: fs.existsSync(workspaceRuntimeEntry) ? sourceDir : projectRoot,
              sourcefile: 'server.mjs',
            },
            outfile: serverOutPath,
            bundle: true,
            format: 'esm',
            platform: 'node',
            target: 'node22',
            ...(Object.keys(workspacePackageAliases).length > 0
              ? { alias: workspacePackageAliases }
              : {}),
            external: [
              'react',
              'react-dom',
              'react-dom/server',
              'react/jsx-runtime',
              ...(options.external ?? []),
            ],
            logLevel: 'silent',
          });
        } catch {
          fs.writeFileSync(serverOutPath, serverSource, 'utf8');
        }
      } else {
        fs.writeFileSync(serverOutPath, serverSource, 'utf8');
      }

      fs.writeFileSync(indexOutPath, "export * from './server.mjs';\n", 'utf8');
      emittedFiles.push(serverOutPath, indexOutPath);

      // 11. Record metadata under .ranu/deploy/deno/deployment.json
      const ranuDeployDir = path.join(projectRoot, '.ranu', 'deploy', 'deno');
      fs.mkdirSync(ranuDeployDir, { recursive: true });

      const deployManifest = {
        schemaVersion: 1,
        adapter: 'deno',
        adapterVersion: '1.0.0',
        buildId: buildDescriptor.buildId,
        target: 'deno',
        outputDirectory: outputDir,
        entrypoint: 'server.mjs',
        routesCount: routeManifest.routes.length,
        serverRoutesCount: serverManifest.routes.length,
        staticRoutesCount: staticManifest.routes.length,
        timestamp: new Date().toISOString(),
      };

      const deployManifestPath = path.join(ranuDeployDir, 'deployment.json');
      fs.writeFileSync(deployManifestPath, JSON.stringify(deployManifest, null, 2), 'utf8');
      emittedFiles.push(deployManifestPath);

      return {
        success: true,
        target: 'deno',
        outputDirectory: outputDir,
        files: emittedFiles,
      };
    },
  };
}

export const denoAdapter = createDenoAdapter;
export default createDenoAdapter;
