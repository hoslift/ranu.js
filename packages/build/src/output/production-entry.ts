/**
 * Generates the JavaScript source code for the production Node entrypoint (.ranu/build/server/entry.mjs).
 *
 * This entrypoint:
 * - Reads build.json and sub-manifests (routes, server, static, client)
 * - Sets up component module loader for dynamic import()
 * - Initializes Ranu runtime engine and Node HTTP server
 */
export function generateProductionEntrySource(buildId: string): string {
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
  async loadRouteEntry(routeId) {
    const entry = serverManifest.routes.find(r => r.routeId === routeId);
    if (!entry) {
      throw new Error(\`Route "\${routeId}" not found in server manifest.\`);
    }
    const modulePath = path.resolve(buildDir, entry.serverEntry);
    return await import(pathToFileURL(modulePath).href);
  },
  async loadMiddleware() {
    const middlewarePath = path.resolve(buildDir, 'server/middleware.mjs');
    if (fs.existsSync(middlewarePath)) {
      return await import(pathToFileURL(middlewarePath).href);
    }
    return undefined;
  }
};

/** Production entry info export */
export default {
  buildId,
  buildDescriptor,
  routeManifest,
  serverManifest,
  clientManifest,
  staticManifest,
  moduleLoader,
};
`;
}
