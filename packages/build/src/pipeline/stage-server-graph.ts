import fs from 'node:fs';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { EsbuildAdapter } from '../bundler/esbuild-adapter.js';
import { createRanuEsbuildPlugin } from '../bundler/esbuild-plugin-ranu.js';
import type { BuildContext } from '../build-config.js';
import type { RouteEntryInfo } from './stage-routes.js';

export interface ServerGraphResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

/**
 * Compiles the server graph (pages, layouts, API routes) for production Node execution.
 */
export async function runServerGraphStage(
  ctx: BuildContext,
  routes: RouteEntryInfo[]
): Promise<ServerGraphResult> {
  const diagnostics: RanuDiagnostic[] = [];

  if (routes.length === 0) {
    return { success: true, diagnostics };
  }

  // 1. Prepare entry points map: output-name -> source-file
  const entryPoints: Record<string, string> = {};
  for (const route of routes) {
    if (route.sourceFile && fs.existsSync(route.sourceFile)) {
      // e.g. 'routes/page-root' -> source file
      const entryKey = route.outputRelativePath
        .replace(/^server\//, '')
        .replace(/\.mjs$/, '');
      entryPoints[entryKey] = route.sourceFile;
    }
  }

  if (Object.keys(entryPoints).length === 0) {
    return { success: true, diagnostics };
  }

  // 2. Setup bundler adapter
  const adapter = new EsbuildAdapter();
  const ranuPlugin = createRanuEsbuildPlugin({
    platform: 'node',
    onDiagnostic: d => diagnostics.push(d),
  });

  const sourcemapMode = ctx.config.sourceMaps ?? 'hidden';
  const sourcemap = sourcemapMode === 'hidden'
    ? 'external' // esbuild 'external' writes .map file without linking comment in output
    : sourcemapMode === false
      ? false
      : sourcemapMode;

  const bundleResult = await adapter.bundle({
    entryPoints,
    outdir: ctx.serverOutDir,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    splitting: false, // Per-route self-contained bundles for predictable loading
    sourcemap,
    minify: ctx.config.minify ?? false,
    plugins: [ranuPlugin],
    jsx: 'automatic',
    jsxImportSource: 'react',
    treeShaking: true,
    entryNames: '[dir]/[name]',
    outExtension: { '.js': '.mjs' },
  });

  // 3. Process any errors/warnings from bundler
  if (!bundleResult.success || bundleResult.errors.length > 0) {
    for (const err of bundleResult.errors) {
      const code = err.text?.includes('Could not resolve')
        ? 'RANU_BUILD_MODULE_RESOLUTION'
        : 'RANU_BUILD_ROUTE_COMPILE';

      const diag: RanuDiagnostic = {
        code,
        severity: 'error',
        message: err.text || 'Server graph compilation failed',
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
  }

  return {
    success: diagnostics.length === 0,
    diagnostics,
  };
}
