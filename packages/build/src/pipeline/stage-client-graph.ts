import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ClientAssetGroup } from '@ranu/manifests';
import { filterPublicEnv } from '@ranu/config';
import { EsbuildAdapter } from '../bundler/esbuild-adapter.js';
import { createRanuEsbuildPlugin } from '../bundler/esbuild-plugin-ranu.js';
import { buildPublicEnvDefines } from '../env/env-validator.js';
import type { BuildContext } from '../build-config.js';
import type { ModuleGraph } from '../graph/graph-types.js';

export interface ClientGraphResult {
  success: boolean;
  assets: Record<string, ClientAssetGroup>;
  diagnostics: RanuDiagnostic[];
}

/**
 * Stage 11: Client graph compilation and browser bundling.
 *
 * Discovers "use client" entrypoints from the module graph, compiles them using
 * esbuild browser mode with RANU_PUBLIC_* environment variable substitution,
 * and records generated asset files into the client manifest assets dictionary.
 */
export async function runClientGraphStage(
  ctx: BuildContext,
  graph?: ModuleGraph
): Promise<ClientGraphResult> {
  const diagnostics: RanuDiagnostic[] = [];
  const assets: Record<string, ClientAssetGroup> = {};

  if (!graph || graph.clientEntries.length === 0) {
    return {
      success: true,
      assets,
      diagnostics,
    };
  }

  // 1. Map client entry points
  const entryPoints: Record<string, string> = {};
  for (const entryId of graph.clientEntries) {
    const node = graph.nodes.get(entryId);
    if (node?.filePath && fs.existsSync(node.filePath)) {
      // Clean entry key e.g. "Counter" or "components-Counter"
      const entryKey = entryId
        .replace(/^app\//, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-');
      entryPoints[entryKey] = node.filePath;
    }
  }

  if (Object.keys(entryPoints).length === 0) {
    return {
      success: true,
      assets,
      diagnostics,
    };
  }

  // 2. Prepare public environment defines
  const rawEnv = process.env as Record<string, string>;
  const publicEnv = filterPublicEnv(rawEnv);
  const defines = buildPublicEnvDefines(publicEnv);

  // 3. Setup bundler for browser graph
  const adapter = new EsbuildAdapter();
  const ranuPlugin = createRanuEsbuildPlugin({
    platform: 'browser',
    publicEnv,
    onDiagnostic: d => diagnostics.push(d),
  });

  const bundleResult = await adapter.bundle({
    entryPoints,
    outdir: ctx.staticOutDir,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    splitting: true,
    sourcemap: ctx.config.sourceMaps === false ? false : undefined,
    minify: ctx.config.minify ?? true,
    define: defines,
    plugins: [ranuPlugin],
    jsx: 'automatic',
    jsxImportSource: 'react',
    treeShaking: true,
    assetNames: 'assets/[name]-[hash]',
    chunkNames: 'assets/chunk-[name]-[hash]',
    entryNames: 'assets/c_[name]-[hash]',
  });

  if (!bundleResult.success || bundleResult.errors.length > 0) {
    for (const err of bundleResult.errors) {
      const diag: RanuDiagnostic = {
        code: 'RANU_BUILD_ROUTE_COMPILE',
        severity: 'error',
        message: err.text || 'Client graph bundle failed',
      };
      if (err.location) {
        diag.location = {
          file: err.location.file,
          line: err.location.line,
          column: err.location.column,
        };
      }
      diagnostics.push(diag);
    }
    return {
      success: false,
      assets,
      diagnostics,
    };
  }

  // 4. Inspect generated files in static/assets to populate client manifest assets
  const staticAssetsDir = path.join(ctx.staticOutDir, 'assets');
  if (fs.existsSync(staticAssetsDir)) {
    const files = fs.readdirSync(staticAssetsDir);
    for (const entryId of graph.clientEntries) {
      const cleanKey = entryId
        .replace(/^app\//, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-');

      const matchedJs = files
        .filter(f => f.startsWith(`c_${cleanKey}`) && f.endsWith('.js'))
        .map(f => `/_ranu/assets/${f}`);

      const matchedCss = files
        .filter(f => f.startsWith(`c_${cleanKey}`) && f.endsWith('.css'))
        .map(f => `/_ranu/assets/${f}`);

      if (matchedJs.length > 0 || matchedCss.length > 0) {
        assets[entryId] = {
          js: matchedJs,
          css: matchedCss,
        };
      }
    }
  }

  return {
    success: diagnostics.length === 0,
    assets,
    diagnostics,
  };
}
