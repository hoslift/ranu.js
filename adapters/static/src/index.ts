import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import type {
  RanuDeploymentAdapter,
  DeploymentCapabilities,
  DeploymentAdapterContext,
  DeploymentResult,
} from '@ranu/core';
import type {
  BuildDescriptor,
  RouteManifest,
} from '@ranu/manifests';

export const adapterName = 'static';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for zero-runtime static deployment target.
 */
export const STATIC_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'static',
  ssr: false,
  apiRoutes: false,
  middleware: false,
  streaming: false,
  staticFiles: true,
  runtimeEnvironment: false,
  writableFilesystem: 'none',
  longLivedProcess: false,
  supportsWaitUntil: false,
};

export interface StaticAdapterOptions {
  /** Output directory for static production artifacts (default: 'dist') */
  outputDir?: string | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
  /** Fallback HTML page for Single-Page Application (SPA) routing (e.g. '200.html', 'index.html', or '404.html') */
  fallback?: string | undefined;
  /** Throw an error if dynamic SSR or API routes are detected (default: false) */
  strict?: boolean | undefined;
  /** Generate GitHub Pages .nojekyll file to prevent Jekyll from skipping _ranu assets (default: true) */
  nojekyll?: boolean | undefined;
  /** Page URL structure strategy: 'auto', 'directory' (/about -> about/index.html), or 'flat' (/about -> about.html) */
  format?: 'auto' | 'directory' | 'flat' | undefined;
  /** Copy public directory to output root (default: true) */
  copyPublic?: boolean | undefined;
  /** Generate static-manifest.json containing asset list, hashes, and MIME types (default: true) */
  generateManifest?: boolean | undefined;
}

export interface StaticManifestEntry {
  path: string;
  size: number;
  contentType: string;
}

export interface GeneratedStaticManifest {
  version: 1;
  buildId: string;
  generatedAt: string;
  files: StaticManifestEntry[];
}

export function isPathContained(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.avif': return 'image/avif';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function copyDirectorySafe(srcDir: string, destDir: string): string[] {
  const copiedFiles: string[] = [];
  if (!fs.existsSync(srcDir)) return copiedFiles;
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copiedFiles.push(...copyDirectorySafe(srcPath, destPath));
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(destPath);
    }
  }
  return copiedFiles;
}

/**
 * Creates a zero-runtime static deployment adapter instance for Ranu.js.
 */
export function createStaticAdapter(options: StaticAdapterOptions = {}): RanuDeploymentAdapter {
  const outputDirName = options.outputDir ?? 'dist';
  const clean = options.clean ?? true;
  const fallback = options.fallback;
  const strict = options.strict ?? false;
  const nojekyll = options.nojekyll ?? true;
  const copyPublic = options.copyPublic ?? true;
  const generateManifest = options.generateManifest ?? true;

  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: STATIC_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();
      const projectRoot = path.resolve(context.projectRoot ?? process.cwd());
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const logger = context.logger ?? console;

      // 1. Verify build artifacts existence
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      if (!fs.existsSync(buildDescriptorPath)) {
        throw new Error(
          `Build descriptor not found at "${buildDescriptorPath}". Run "ranu build" before deploying.`
        );
      }

      const buildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8')
      ) as BuildDescriptor;

      // 2. Validate destination directory boundaries
      const targetDistDir = path.isAbsolute(outputDirName)
        ? outputDirName
        : path.resolve(projectRoot, outputDirName);

      if (!isPathContained(projectRoot, targetDistDir) && !path.isAbsolute(outputDirName)) {
        throw new Error(`Security exception: Output directory "${targetDistDir}" escapes project root.`);
      }

      // 3. Clean and prepare output folder
      if (clean && fs.existsSync(targetDistDir)) {
        fs.rmSync(targetDistDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDistDir, { recursive: true });

      // 4. Validate routes against static hosting constraints
      const routesManifestPath = path.join(buildDir, 'manifest', 'routes.json');
      let dynamicRoutesCount = 0;
      const warnings: string[] = [];

      if (fs.existsSync(routesManifestPath)) {
        const routeManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8')) as RouteManifest;
        for (const route of routeManifest.routes) {
          const routePattern = (route as any).path ?? route.pattern ?? route.id;
          if (route.kind === 'api' || (route as any).renderMode === 'server') {
            dynamicRoutesCount++;
            const msg = `Dynamic route "${routePattern}" (${route.kind}) is not supported on zero-runtime static hosting.`;
            if (strict) {
              throw new Error(`[adapter-static strict mode] ${msg}`);
            } else {
              warnings.push(msg);
              logger.warn(`[adapter-static] ${msg} It will be skipped.`);
            }
          }
        }
      }

      const allCopied: string[] = [];

      // 5. Copy pre-rendered static HTML pages
      const staticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(staticPagesDir)) {
        allCopied.push(...copyDirectorySafe(staticPagesDir, targetDistDir));
      }

      // 6. Copy client bundle assets (_ranu/assets/ and static/assets/)
      const staticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(staticAssetsDir)) {
        const destClientAssets = path.join(targetDistDir, '_ranu', 'assets');
        allCopied.push(...copyDirectorySafe(staticAssetsDir, destClientAssets));
      }

      // 7. Copy project root public directory (favicon, robots.txt, etc.)
      if (copyPublic) {
        const publicDir = path.join(projectRoot, 'public');
        if (fs.existsSync(publicDir)) {
          allCopied.push(...copyDirectorySafe(publicDir, targetDistDir));
        }
      }

      // 8. GitHub Pages compatibility: generate .nojekyll
      if (nojekyll) {
        const nojekyllPath = path.join(targetDistDir, '.nojekyll');
        fs.writeFileSync(nojekyllPath, '');
        allCopied.push(nojekyllPath);
      }

      // 9. SPA Fallback generation
      if (fallback) {
        const fallbackPath = path.join(targetDistDir, fallback);
        const indexPath = path.join(targetDistDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, fallbackPath);
        } else {
          fs.writeFileSync(
            fallbackPath,
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>App</title></head><body><div id="root"></div></body></html>'
          );
        }
        allCopied.push(fallbackPath);
      }

      // 10. Generate static-manifest.json
      if (generateManifest) {
        const manifestFiles: StaticManifestEntry[] = [];
        function indexDir(dir: string) {
          if (!fs.existsSync(dir)) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              indexDir(full);
            } else if (e.isFile()) {
              const rel = path.relative(targetDistDir, full).replace(/\\/g, '/');
              const stat = fs.statSync(full);
              manifestFiles.push({
                path: rel,
                size: stat.size,
                contentType: getContentType(full),
              });
            }
          }
        }
        indexDir(targetDistDir);

        const manifestData: GeneratedStaticManifest = {
          version: 1,
          buildId: buildDescriptor.buildId,
          generatedAt: new Date().toISOString(),
          files: manifestFiles,
        };

        const manifestPath = path.join(targetDistDir, 'static-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
        allCopied.push(manifestPath);
      }

      // 11. Write deployment record in .ranu/deploy/static/deployment.json
      const deployMetaDir = path.join(projectRoot, '.ranu', 'deploy', 'static');
      fs.mkdirSync(deployMetaDir, { recursive: true });
      fs.writeFileSync(
        path.join(deployMetaDir, 'deployment.json'),
        JSON.stringify(
          {
            adapter: adapterName,
            version: ADAPTER_API_VERSION,
            outputDirectory: targetDistDir,
            buildId: buildDescriptor.buildId,
            deployedAt: new Date().toISOString(),
            dynamicRoutesSkipped: dynamicRoutesCount,
          },
          null,
          2
        )
      );

      logger.info(`[adapter-static] Static export complete in "${targetDistDir}".`);

      return {
        success: true,
        target: adapterName,
        outputDirectory: targetDistDir,
        files: allCopied,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    },
  };
}

/**
 * Creates a lightweight local HTTP server to preview static export artifacts.
 */
export function createStaticPreviewServer(options: {
  dir: string;
  port?: number | undefined;
  host?: string | undefined;
  fallback?: string | undefined;
}): {
  server: http.Server;
  start: () => Promise<{ port: number; host: string; url: string }>;
  stop: () => Promise<void>;
} {
  const rootDir = path.resolve(options.dir);
  const host = options.host ?? 'localhost';
  const requestedPort = options.port ?? 0;
  const fallback = options.fallback;

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    const rawUrl = (req.url ?? '/').split('?')[0] ?? '/';
    const decodedUrl = decodeURIComponent(rawUrl);

    // Defense against traversal
    const safePath = path.normalize(path.join(rootDir, decodedUrl));
    if (!isPathContained(rootDir, safePath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let targetFile = safePath;
    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isDirectory()) {
      targetFile = path.join(targetFile, 'index.html');
    }

    if (!fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
      // Try fallback if defined
      if (fallback) {
        const fbPath = path.join(rootDir, fallback);
        if (fs.existsSync(fbPath)) {
          targetFile = fbPath;
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
    }

    const stat = fs.statSync(targetFile);
    res.writeHead(200, {
      'Content-Type': getContentType(targetFile),
      'Content-Length': stat.size,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(targetFile);
    stream.pipe(res);
  });

  return {
    server,
    start(): Promise<{ port: number; host: string; url: string }> {
      return new Promise((resolve) => {
        server.listen(requestedPort, host, () => {
          const addr = server.address();
          const port = typeof addr === 'object' && addr ? addr.port : requestedPort;
          resolve({
            port,
            host,
            url: `http://${host}:${port}`,
          });
        });
      });
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

export const staticAdapter = createStaticAdapter;
export default createStaticAdapter;
