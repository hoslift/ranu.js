import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { EsbuildAdapter } from '../bundler/esbuild-adapter.js';
import { createRanuEsbuildPlugin } from '../bundler/esbuild-plugin-ranu.js';
import type { BuildContext } from '../build-config.js';
import {
  getRouteComponentEntryName,
  resolveRouteComponentPath,
  type RouteEntryInfo,
} from './stage-routes.js';

export interface ServerGraphResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

/** Return framework-local package search paths for standalone build inputs. */
function getFrameworkNodePaths(): string[] {
  try {
    const require = createRequire(import.meta.url);
    const reactPackageDir = path.dirname(require.resolve('react/package.json'));
    return [path.dirname(reactPackageDir)];
  } catch {
    return [];
  }
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

    // Compile layouts
    for (const layoutPath of route.layouts) {
      const fullPath = resolveRouteComponentPath(ctx.projectRoot, layoutPath);
      if (fs.existsSync(fullPath)) {
        entryPoints[`layouts/${getRouteComponentEntryName(layoutPath)}`] = fullPath;
      }
    }

    // Compile notFound
    if (route.notFound) {
      for (const nfPath of route.notFound) {
        const fullPath = resolveRouteComponentPath(ctx.projectRoot, nfPath);
        if (fs.existsSync(fullPath)) {
          entryPoints[`not-found/${getRouteComponentEntryName(nfPath)}`] = fullPath;
        }
      }
    }
  }

  // Compile middleware if present at project root
  const middlewareCandidates = [
    'middleware.ts',
    'middleware.js',
    'middleware.mjs',
    'middleware.cjs',
    'src/middleware.ts',
    'src/middleware.js',
  ];
  for (const cand of middlewareCandidates) {
    const fullPath = path.join(ctx.projectRoot, cand);
    if (fs.existsSync(fullPath)) {
      entryPoints['middleware'] = fullPath;
      break;
    }
  }

  if (Object.keys(entryPoints).length === 0) {
    return { success: true, diagnostics };
  }

  // 2. Setup bundler adapter
  const adapter = new EsbuildAdapter();
  const ranuPlugin = createRanuEsbuildPlugin({
    platform: 'node',
    projectRoot: ctx.projectRoot,
    staticOutDir: ctx.staticOutDir,
    tempOutDir: ctx.tempOutDir,
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
    // Resolve react from the project being built, supporting monorepo workspaces
    nodePaths: [
      path.join(ctx.projectRoot, 'node_modules'),
      path.resolve(ctx.projectRoot, '..', 'node_modules'),
      path.resolve(ctx.projectRoot, '..', '..', 'node_modules'),
      ...getFrameworkNodePaths(),
    ],
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
