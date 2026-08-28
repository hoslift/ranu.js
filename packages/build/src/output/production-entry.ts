import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadCompiledMiddleware(
  buildDir: string,
  fileExists: (filePath: string) => boolean = fs.existsSync,
  importModule: (moduleUrl: string) => Promise<unknown> = (moduleUrl) => import(moduleUrl),
): Promise<unknown> {
  const middlewarePath = path.resolve(buildDir, 'server/middleware.mjs');
  if (!fileExists(middlewarePath)) return undefined;
  return importModule(pathToFileURL(middlewarePath).href);
}

export interface ProductionRuntimeFactoryOptions {
  createRuntime: (options: Record<string, unknown>) => unknown;
  createMiddleware: (middlewareModule: unknown) => unknown;
  runtimeOptions: Record<string, unknown> & { middleware?: unknown };
}

/**
 * Creates a production runtime using a middleware module supplied by the
 * generated entrypoint's module loader.
 */
export async function createProductionRuntimeWithLoader(
  { createRuntime, createMiddleware, runtimeOptions }: ProductionRuntimeFactoryOptions,
  loadMiddleware: () => Promise<unknown>,
): Promise<unknown> {
  if (typeof createRuntime !== 'function' || typeof createMiddleware !== 'function') {
    throw new TypeError('Production runtime factories must be functions.');
  }
  const middlewareModule = await loadMiddleware();
  const middleware = middlewareModule
    ? createMiddleware(middlewareModule)
    : runtimeOptions.middleware;
  return createRuntime({
    ...runtimeOptions,
    ...(middleware ? { middleware } : {}),
  });
}

/**
 * Generates the JavaScript source code for the production Node entrypoint (.ranu/build/server/entry.mjs).
 *
 * This entrypoint:
 * - Reads build.json and sub-manifests (routes, server, static, client)
 * - Sets up component module loader for dynamic import()
 * - Initializes Ranu runtime engine and Node HTTP server
 * - Supports direct standalone execution (node .ranu/build/server/entry.mjs)
 */
export function generateProductionEntrySource(buildId: string): string {
  const runtimeFactorySource = createProductionRuntimeWithLoader.toString();
  const middlewareLoaderSource = loadCompiledMiddleware.toString();
  return `// Ranu.js Production Server Entrypoint
// Generated automatically by @ranu/build (Build ID: ${buildId})

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.resolve(__dirname, '..');

/** Load manifest helper */
function loadJson(relPath) {
  const fullPath = path.resolve(buildDir, relPath);
  const raw = fs.readFileSync(fullPath, 'utf8');
  return JSON.parse(raw);
}

// 1. Load Build Descriptor
export const buildDescriptor = loadJson('./build.json');
export const buildId = buildDescriptor.buildId;

// 2. Load Manifests
export const routeManifest = loadJson(buildDescriptor.manifests.routes);
export const serverManifest = loadJson(buildDescriptor.manifests.server);
export const clientManifest = loadJson(buildDescriptor.manifests.client);
export const staticManifest = loadJson(buildDescriptor.manifests.static);

/**
 * Module loader backed by compiled server routes in .ranu/build/server/
 */
export const moduleLoader = {
  loadMiddleware: () => (${middlewareLoaderSource})(buildDir),
  async loadRouteEntry(routeId) {
    const entry = serverManifest.routes.find(r => r.routeId === routeId);
    if (!entry) {
      throw new Error(\`Route "\${routeId}" not found in server manifest.\`);
    }
    const modulePath = path.resolve(buildDir, entry.serverEntry);
    return await import(pathToFileURL(modulePath).href);
  }
};

export const createProductionRuntime = (options) => (${runtimeFactorySource})(options, () => moduleLoader.loadMiddleware());

/**
 * Helper to start production HTTP server programmatically.
 */
export async function startServer(options = {}) {
  const { createProductionServer } = await import('@ranu/runtime-node');
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';
  const server = await createProductionServer({
    buildDir,
    port,
    host,
    trustProxy: options.trustProxy,
  });
  return server.listen(port, host);
}

/** Direct execution guard */
const isDirectExecution = () => {
  try {
    if (!process.argv[1]) return false;
    const resolvedArg = path.resolve(process.argv[1]);
    return fileURLToPath(import.meta.url) === resolvedArg;
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST ?? '0.0.0.0';
  const { createProductionServer } = await import('@ranu/runtime-node');
  const server = await createProductionServer({
    buildDir,
    port,
    host,
  });
  const address = await server.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(\`Ranu.js production server listening at http://\${address.host}:\${address.port}\`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

/** Production entry info export */
export default {
  buildId,
  buildDescriptor,
  routeManifest,
  serverManifest,
  clientManifest,
  staticManifest,
  moduleLoader,
  createProductionRuntime,
  startServer,
};
`;
}
