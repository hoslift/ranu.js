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

export const adapterName = 'node';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for Node.js standalone daemon deployment target.
 */
export const NODE_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'node',
  ssr: true,
  apiRoutes: true,
  middleware: false,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'persistent',
  longLivedProcess: true,
  supportsWaitUntil: false,
};

export interface NodeAdapterOptions {
  /** Output directory for standalone production distribution (default: 'dist' or 'dist-node') */
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
  /** Generate production containerization artifacts (Dockerfile and .dockerignore) (default: true) */
  dockerfile?: boolean | { nodeVersion?: string; port?: number } | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
  /** Bundle standalone server.mjs with esbuild (default: true) */
  bundle?: boolean | undefined;
  /** Additional external module specifiers excluded from bundling */
  external?: string[] | undefined;
}

export interface DockerfileRecipeOptions {
  nodeVersion?: string | undefined;
  port?: number | undefined;
}

/**
 * Generates standard multi-stage production Dockerfile content for standalone Node.js.
 */
export function generateDockerfile(options: DockerfileRecipeOptions = {}): string {
  const nodeVersion = options.nodeVersion ?? '22-alpine';
  const port = options.port ?? 3000;

  return `# Multi-stage lightweight production Dockerfile for Ranu.js
FROM node:${nodeVersion} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=${port}
ENV HOST=0.0.0.0

# Create unprivileged application user
RUN addgroup --system --gid 1001 ranugroup && \\
    adduser --system --uid 1001 ranuuser

COPY --chown=ranuuser:ranugroup . .

USER ranuuser
EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${port}/ || exit 1

CMD ["node", "server.mjs"]
`;
}

/**
 * Generates standard .dockerignore content for Ranu.js production container builds.
 */
export function generateDockerignore(): string {
  return `# Ranu.js Docker Ignore Rules
.git
.github
node_modules
.ranu/dev
.ranu/cache
.env
.env.*
*.log
coverage
dist
`;
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
 * Creates a standalone Node.js production deployment adapter instance for Ranu.js.
 */
export function createNodeAdapter(options: NodeAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: NODE_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();

      const projectRoot = path.resolve(context.projectRoot ?? process.cwd());
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(
        options.outputDir ?? context.outputDir ?? path.join(projectRoot, 'dist'),
      );

      // Validate outputDir safety
      const relToRoot = path.relative(outputDir, projectRoot);
      const relToBuild = path.relative(outputDir, buildDir);
      if (
        outputDir === projectRoot ||
        outputDir === buildDir ||
        relToRoot === '' ||
        relToBuild === ''
      ) {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot be equal to project root or build directory.`,
        );
      }
      if (!relToRoot.startsWith('..') && !path.isAbsolute(relToRoot)) {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot contain the project root.`,
        );
      }
      if (!relToBuild.startsWith('..') && !path.isAbsolute(relToBuild)) {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot contain the build directory.`,
        );
      }

      // 1. Validate production build exists
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      if (!fs.existsSync(buildDescriptorPath)) {
        throw new Error(
          `Cannot adapt for node: No production build found at "${buildDir}". Run "ranu build" first.`,
        );
      }

      const buildDescriptor: BuildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8'),
      );

      // 2. Validate capability compatibility
      const buildRuntime = String(buildDescriptor.runtime);
      if (buildRuntime !== 'node') {
        throw new Error(
          `Node adapter requires build runtime target "node", but received "${buildRuntime}".`,
        );
      }

      // 3. Load manifests
      const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
      const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
      const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);

      if (!isPathContained(routesManifestPath, buildDir)) {
        throw new Error(`Routes manifest path escapes build directory: "${routesManifestPath}".`);
      }
      if (!isPathContained(serverManifestPath, buildDir)) {
        throw new Error(`Server manifest path escapes build directory: "${serverManifestPath}".`);
      }

      const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
      const serverManifest: ServerManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
      const staticManifest: StaticManifest = fs.existsSync(staticManifestPath)
        ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
        : { schemaVersion: 1, buildId: buildDescriptor.buildId, routes: [] };

      // 4. Prepare clean output directory
      if (options.clean !== false && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const emittedFiles: string[] = [];
      const forbiddenStaticPatterns = ['.env', '.git', '.DS_Store', '.map', 'server'];

      // 5. Copy pre-rendered static assets and static pages
      const staticOutDir = path.join(outputDir, 'static');
      const staticAssetsOutDir = path.join(staticOutDir, 'assets');
      const staticPagesOutDir = path.join(staticOutDir, 'pages');
      const ranuAssetsOutDir = path.join(outputDir, '_ranu', 'assets');

      fs.mkdirSync(staticAssetsOutDir, { recursive: true });
      fs.mkdirSync(staticPagesOutDir, { recursive: true });
      fs.mkdirSync(ranuAssetsOutDir, { recursive: true });

      const buildStaticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(buildStaticAssetsDir)) {
        const copiedStaticAssets = copyDirectorySafe(
          buildStaticAssetsDir,
          staticAssetsOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedStaticAssets);

        const copiedRanuAssets = copyDirectorySafe(
          buildStaticAssetsDir,
          ranuAssetsOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedRanuAssets);
      }

      const buildStaticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(buildStaticPagesDir)) {
        const copiedPages = copyDirectorySafe(
          buildStaticPagesDir,
          staticPagesOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPages);
      }

      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const publicOutDir = path.join(outputDir, 'public');
        fs.mkdirSync(publicOutDir, { recursive: true });
        const copiedPublic = copyDirectorySafe(
          publicDir,
          publicOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPublic);
      }

      // 6. Copy server bundles and manifests
      const serverOutDir = path.join(outputDir, 'server');
      const manifestOutDir = path.join(outputDir, 'manifest');
      fs.mkdirSync(serverOutDir, { recursive: true });
      fs.mkdirSync(manifestOutDir, { recursive: true });

      const copiedServer = copyDirectorySafe(
        path.join(buildDir, 'server'),
        serverOutDir,
        outputDir,
      );
      emittedFiles.push(...copiedServer);

      const copiedManifest = copyDirectorySafe(
        path.join(buildDir, 'manifest'),
        manifestOutDir,
        outputDir,
      );
      emittedFiles.push(...copiedManifest);

      const buildJsonDest = path.join(outputDir, 'build.json');
      fs.copyFileSync(buildDescriptorPath, buildJsonDest);
      emittedFiles.push(buildJsonDest);

      const buildIdPath = path.join(buildDir, 'BUILD_ID');
      if (fs.existsSync(buildIdPath)) {
        const buildIdDest = path.join(outputDir, 'BUILD_ID');
        fs.copyFileSync(buildIdPath, buildIdDest);
        emittedFiles.push(buildIdDest);
      }

      // 7. Generate production package.json
      const packageJsonContent = {
        name: 'app-production',
        version: '1.0.0',
        type: 'module',
        main: 'server.mjs',
        scripts: {
          start: 'node server.mjs',
        },
      };
      const packageJsonPath = path.join(outputDir, 'package.json');
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2), 'utf8');
      emittedFiles.push(packageJsonPath);

      // 8. Generate production containerization artifacts (Dockerfile and .dockerignore)
      if (options.dockerfile !== false) {
        const dockerfileOpts: DockerfileRecipeOptions = {
          nodeVersion:
            typeof options.dockerfile === 'object' && options.dockerfile.nodeVersion
              ? options.dockerfile.nodeVersion
              : '22-alpine',
          port:
            typeof options.dockerfile === 'object' && options.dockerfile.port
              ? options.dockerfile.port
              : options.port ?? 3000,
        };

        const dockerfilePath = path.join(outputDir, 'Dockerfile');
        const dockerignorePath = path.join(outputDir, '.dockerignore');

        assertNoDestinationSymlink(dockerfilePath, outputDir);
        assertNoDestinationSymlink(dockerignorePath, outputDir);

        fs.writeFileSync(dockerfilePath, generateDockerfile(dockerfileOpts), 'utf8');
        fs.writeFileSync(dockerignorePath, generateDockerignore(), 'utf8');

        emittedFiles.push(dockerfilePath, dockerignorePath);
      }

      // 9. Generate standalone production server entrypoint (server.mjs)
      const defaultPort = options.port ?? 3000;
      const defaultHost = options.host ?? '0.0.0.0';
      const defaultShutdownTimeout = options.shutdownTimeout ?? 5000;
      const defaultTrustProxy = options.trustProxy ?? true;
      const defaultBodyLimit = options.bodyLimit ?? 10485760;

      const serverSource = `// Standalone Node.js Production Server for Ranu.js
// Generated by @ranujs/adapter-node (Build ID: ${buildDescriptor.buildId})

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createProductionServer,
  createProductionRuntime,
  createProductionRequestHandler,
  writeWebResponse,
} from '@ranu/runtime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultPort = parseInt(process.env.PORT || '${defaultPort}', 10);
export const defaultHost = process.env.HOST || '${defaultHost}';
export const defaultShutdownTimeout = parseInt(
  process.env.SHUTDOWN_TIMEOUT || '${defaultShutdownTimeout}',
  10,
);
export const defaultTrustProxy = ${defaultTrustProxy};
export const defaultBodyLimit = ${defaultBodyLimit};

export async function createServer(customOptions = {}) {
  const port = customOptions.port ?? defaultPort;
  const host = customOptions.host ?? defaultHost;
  const shutdownTimeout = customOptions.shutdownTimeout ?? defaultShutdownTimeout;
  const trustProxy = customOptions.trustProxy ?? defaultTrustProxy;
  const bodyLimit = customOptions.bodyLimit ?? defaultBodyLimit;
  const buildDir = customOptions.buildDir ?? __dirname;
  const projectRoot = customOptions.projectRoot ?? __dirname;

  const nodeServer = await createProductionServer({
    buildDir,
    projectRoot,
    port,
    host,
    trustProxy,
    bodyLimit,
    shutdownTimeout,
  });

  nodeServer.httpServer.keepAliveTimeout = 65000;
  nodeServer.httpServer.headersTimeout = 66000;

  return nodeServer;
}

export async function startServer(customOptions = {}) {
  const nodeServer = await createServer(customOptions);
  const port = customOptions.port ?? defaultPort;
  const host = customOptions.host ?? defaultHost;
  const shutdownTimeout = customOptions.shutdownTimeout ?? defaultShutdownTimeout;

  const address = await nodeServer.listen(port, host);

  let isShuttingDown = false;
  const handleSignal = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    try {
      await nodeServer.close(shutdownTimeout);
      if (process.env.NODE_ENV !== 'test' && !customOptions.dontExit) {
        process.exit(0);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'test' && !customOptions.dontExit) {
        process.exit(1);
      }
    }
  };

  const sigintListener = () => handleSignal('SIGINT');
  const sigtermListener = () => handleSignal('SIGTERM');

  process.once('SIGINT', sigintListener);
  process.once('SIGTERM', sigtermListener);

  return {
    nodeServer,
    httpServer: nodeServer.httpServer,
    address,
    close: async (timeout) => {
      process.removeListener('SIGINT', sigintListener);
      process.removeListener('SIGTERM', sigtermListener);
      await nodeServer.close(timeout ?? shutdownTimeout);
    },
  };
}

export {
  createProductionServer,
  createProductionRuntime,
  createProductionRequestHandler,
  writeWebResponse,
};

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain || process.env.RANU_AUTO_START === 'true') {
  startServer().catch((err) => {
    console.error('Failed to start Ranu production server:', err);
    process.exit(1);
  });
}
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

      // 10. Record metadata under .ranu/deploy/node/deployment.json
      const ranuDeployDir = path.join(projectRoot, '.ranu', 'deploy', 'node');
      fs.mkdirSync(ranuDeployDir, { recursive: true });

      const deployManifest = {
        schemaVersion: 1,
        adapter: 'node',
        adapterVersion: '1.0.0',
        buildId: buildDescriptor.buildId,
        target: 'node',
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
        target: 'node',
        outputDirectory: outputDir,
        files: emittedFiles,
      };
    },
  };
}

export const nodeAdapter = createNodeAdapter;
export default createNodeAdapter;
