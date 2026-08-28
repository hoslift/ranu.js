import fs from 'node:fs';
import path from 'node:path';
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

export const adapterName = 'vercel';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for Vercel Node runtime deployment target.
 */
export const VERCEL_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'node',
  ssr: true,
  apiRoutes: true,
  middleware: true,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'temporary',
  longLivedProcess: false,
};

export interface VercelAdapterOptions {
  /** Output directory for Vercel Build Output API (default: '.vercel/output') */
  outputDir?: string | undefined;
  /** Node.js runtime version on Vercel Functions (default: 'nodejs22.x') */
  runtimeVersion?: string | undefined;
  /** Regions where the function should be deployed (e.g. ['iad1', 'sfo1']) */
  regions?: string[] | undefined;
  /** Serverless function memory limit in MB (default: 1024) */
  memory?: number | undefined;
  /** Max duration for function execution in seconds */
  maxDuration?: number | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
}

/**
 * Checks whether childPath is strictly contained inside parentDir (path traversal prevention).
 */
export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
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

  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (forbiddenNames.some((forbidden) => entry.name.startsWith(forbidden))) {
      continue;
    }

    if (!isPathContained(destPath, authorizedRoot)) {
      throw new Error(`Path traversal attempt detected when copying to "${destPath}".`);
    }

    if (entry.isDirectory()) {
      const nested = copyDirectorySafe(srcPath, destPath, authorizedRoot, forbiddenNames);
      copiedFiles.push(...nested);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(destPath);
    }
  }

  return copiedFiles;
}

/**
 * Creates a Vercel deployment adapter instance for Ranu.js.
 */
export function createVercelAdapter(options: VercelAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: VERCEL_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      const projectRoot = path.resolve(context.projectRoot ?? process.cwd());
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(
        options.outputDir ?? context.outputDir ?? path.join(projectRoot, '.vercel', 'output'),
      );

      // 1. Validate production build exists
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      if (!fs.existsSync(buildDescriptorPath)) {
        throw new Error(
          `Cannot adapt for Vercel: No production build found at "${buildDir}". Run "ranu build" first.`,
        );
      }

      const buildDescriptor: BuildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8'),
      );

      // 2. Validate capability compatibility
      if (buildDescriptor.runtime !== 'node') {
        throw new Error(
          `Vercel adapter requires build runtime target "node", but received "${buildDescriptor.runtime}".`,
        );
      }

      // 3. Load manifests
      const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
      const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
      const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);

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

      const staticOutDir = path.join(outputDir, 'static');
      const functionsOutDir = path.join(outputDir, 'functions');
      const mainFuncDir = path.join(functionsOutDir, 'index.func');

      fs.mkdirSync(staticOutDir, { recursive: true });
      fs.mkdirSync(mainFuncDir, { recursive: true });

      const emittedFiles: string[] = [];

      // 5. Emit .vercel/output/config.json (Vercel Build Output API v3)
      const overrides: Record<string, { contentType?: string; path?: string }> = {};

      for (const st of staticManifest.routes) {
        const cleanPath = st.pathname === '/' ? 'index.html' : `${st.pathname.replace(/^\//, '')}.html`;
        overrides[cleanPath] = {
          contentType: 'text/html; charset=utf-8',
        };
      }

      const vercelConfig = {
        version: 3,
        routes: [
          // Immutable static assets under /_ranu/assets/
          {
            src: '^/_ranu/assets/(.*)$',
            headers: {
              'cache-control': 'public, max-age=31536000, immutable',
            },
            continue: true,
          },
          // Route filesystem static matches first
          {
            handle: 'filesystem',
          },
          // Route all remaining requests to the main serverless function handler
          {
            src: '^/(.*)$',
            dest: '/index',
          },
        ],
        overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
      };

      const configPath = path.join(outputDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(vercelConfig, null, 2), 'utf8');
      emittedFiles.push(configPath);

      // 6. Copy static files to .vercel/output/static
      // Security guard: Never copy secrets, environment files, or private server maps
      const forbiddenStaticPatterns = ['.env', '.git', '.DS_Store', '.map', 'server'];

      // 6a. Copy static assets from .ranu/build/static/assets -> .vercel/output/static/_ranu/assets and root
      const buildStaticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(buildStaticAssetsDir)) {
        const ranuAssetsDest = path.join(staticOutDir, '_ranu', 'assets');
        const copied = copyDirectorySafe(
          buildStaticAssetsDir,
          ranuAssetsDest,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copied);

        // Also copy directly to static root for public files
        const copiedRoot = copyDirectorySafe(
          buildStaticAssetsDir,
          staticOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedRoot);
      }

      // 6b. Copy pre-rendered static HTML pages from .ranu/build/static/pages -> .vercel/output/static
      const buildStaticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(buildStaticPagesDir)) {
        const copiedPages = copyDirectorySafe(
          buildStaticPagesDir,
          staticOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPages);
      }

      // 6c. Copy public/ directory files if present
      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const copiedPublic = copyDirectorySafe(
          publicDir,
          staticOutDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPublic);
      }

      // 7. Generate Vercel serverless function (.vercel/output/functions/index.func)
      const runtimeVersion = options.runtimeVersion ?? 'nodejs22.x';

      const vcConfig = {
        runtime: runtimeVersion,
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        shouldAddHelpers: true,
        ...(options.regions ? { regions: options.regions } : {}),
        ...(options.memory ? { memory: options.memory } : {}),
        ...(options.maxDuration ? { maxDuration: options.maxDuration } : {}),
      };

      const vcConfigPath = path.join(mainFuncDir, '.vc-config.json');
      fs.writeFileSync(vcConfigPath, JSON.stringify(vcConfig, null, 2), 'utf8');
      emittedFiles.push(vcConfigPath);

      // 7b. Copy server bundle and manifests into the function package
      const funcServerDir = path.join(mainFuncDir, 'server');
      const funcManifestDir = path.join(mainFuncDir, 'manifest');
      fs.mkdirSync(funcServerDir, { recursive: true });
      fs.mkdirSync(funcManifestDir, { recursive: true });

      const copiedServer = copyDirectorySafe(
        path.join(buildDir, 'server'),
        funcServerDir,
        mainFuncDir,
      );
      emittedFiles.push(...copiedServer);

      const copiedManifest = copyDirectorySafe(
        path.join(buildDir, 'manifest'),
        funcManifestDir,
        mainFuncDir,
      );
      emittedFiles.push(...copiedManifest);

      fs.copyFileSync(buildDescriptorPath, path.join(mainFuncDir, 'build.json'));
      emittedFiles.push(path.join(mainFuncDir, 'build.json'));

      const buildIdFile = path.join(buildDir, 'BUILD_ID');
      if (fs.existsSync(buildIdFile)) {
        fs.copyFileSync(buildIdFile, path.join(mainFuncDir, 'BUILD_ID'));
        emittedFiles.push(path.join(mainFuncDir, 'BUILD_ID'));
      }

      // 7c. Generate serverless entrypoint handler (index.mjs)
      const funcEntrySource = `// Vercel Serverless Function Handler for Ranu.js
// Generated by @ranu/adapter-vercel (Build ID: ${buildDescriptor.buildId})

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionRequestHandler, createProductionRuntime } from '@ranu/runtime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let runtimePromise = null;
let requestHandlerPromise = null;

async function getHandler() {
  if (!requestHandlerPromise) {
    requestHandlerPromise = (async () => {
      const runtime = await createProductionRuntime({
        buildDir: __dirname,
      });
      return createProductionRequestHandler(runtime, {
        buildDir: __dirname,
      });
    })();
  }
  return requestHandlerPromise;
}

export default async function handler(req, res) {
  try {
    const fn = await getHandler();
    await fn(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
    }
  }
}
`;

      const funcEntryPath = path.join(mainFuncDir, 'index.mjs');
      fs.writeFileSync(funcEntryPath, funcEntrySource, 'utf8');
      emittedFiles.push(funcEntryPath);

      // 7d. Package descriptor for the serverless function
      const funcPackageJson = {
        type: 'module',
        main: 'index.mjs',
      };
      const funcPackagePath = path.join(mainFuncDir, 'package.json');
      fs.writeFileSync(funcPackagePath, JSON.stringify(funcPackageJson, null, 2), 'utf8');
      emittedFiles.push(funcPackagePath);

      // 8. Generate completion descriptor under .ranu/deploy/vercel
      const ranuDeployDir = path.join(projectRoot, '.ranu', 'deploy', 'vercel');
      fs.mkdirSync(ranuDeployDir, { recursive: true });

      const deployManifest = {
        schemaVersion: 1,
        adapter: 'vercel',
        adapterVersion: '1.0.0',
        buildId: buildDescriptor.buildId,
        target: 'vercel',
        outputDirectory: outputDir,
        functions: ['index.func'],
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
        target: 'vercel',
        outputDirectory: outputDir,
        files: emittedFiles,
      };
    },
  };
}

export const vercelAdapter = createVercelAdapter;
export default createVercelAdapter;
