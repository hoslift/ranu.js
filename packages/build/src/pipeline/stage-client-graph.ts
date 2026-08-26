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
import { resolveRouteComponentPath, type RouteEntryInfo } from './stage-routes.js';

export interface ClientGraphResult {
  success: boolean;
  assets: Record<string, ClientAssetGroup>;
  diagnostics: RanuDiagnostic[];
}

/**
 * Stage 11: Client graph compilation, browser bundling, and CSS extraction.
 *
 * Discovers "use client" entrypoints, root layout, and route CSS from the module graph,
 * compiles them using esbuild browser mode with RANU_PUBLIC_* environment variable substitution,
 * extracts CSS stylesheets into content-hashed assets, and records generated asset files into
 * the client manifest assets dictionary.
 */
export async function runClientGraphStage(
  ctx: BuildContext,
  graph?: ModuleGraph,
  routes?: RouteEntryInfo[],
): Promise<ClientGraphResult> {
  const diagnostics: RanuDiagnostic[] = [];
  const assets: Record<string, ClientAssetGroup> = {};

  // 1. Map client entry points and CSS-bearing entry points
  const entryPoints: Record<string, string> = {};

  // A. Client entries from graph (e.g. components with "use client")
  if (graph) {
    for (const entryId of graph.clientEntries) {
      const node = graph.nodes.get(entryId);
      if (node?.filePath && fs.existsSync(node.filePath)) {
        const entryKey = entryId
          .replace(/^app[/\\]/, '')
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '-');
        entryPoints[entryKey] = node.filePath;
      }
    }
  }

  // B. Discovered CSS files from graph (global and module CSS)
  if (graph) {
    for (const [id, node] of graph.nodes.entries()) {
      if (id.endsWith('.css') && node.filePath && fs.existsSync(node.filePath)) {
        const entryKey =
          'css-' +
          id
            .replace(/^app[/\\]/, '')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '-');
        entryPoints[entryKey] = node.filePath;
      }
    }
  }

  // C. Include framework browser hydration bootstrap entrypoint with a route module registry
  const clientRoutes = (routes ?? []).filter(
    (route) => route.kind === 'page' && route.renderMode === 'client' && route.sourceFile,
  );
  const clientRouteImports = clientRoutes
    .map((route, index) => {
      const importPath = route.sourceFile.replace(/\\/g, '/');
      return `import * as clientRoute${index} from ${JSON.stringify(importPath)};`;
    })
    .join('\n');
  const clientRouteModules = clientRoutes
    .map((route, index) => `  ${JSON.stringify(route.routeId)}: clientRoute${index}`)
    .join(',\n');

  const bootstrapSource = `import { bootstrapClientHydration } from '@ranu/react';
${clientRouteImports}

const routeModules = {
${clientRouteModules}
};

async function loadRouteComponent(routeId) {
  const routeModule = routeModules[routeId];
  if (!routeModule) {
    throw new Error(\`Client route module "\${routeId}" was not registered in this build.\`);
  }
  return routeModule;
}

if (typeof document !== 'undefined') {
  bootstrapClientHydration({
    buildId: ${JSON.stringify(ctx.buildId)},
    componentLoader: loadRouteComponent,
  }).catch(() => {});
}
`;
  const bootstrapEntryPath = path.join(ctx.tempOutDir, 'bootstrap-entry.tsx');
  fs.writeFileSync(bootstrapEntryPath, bootstrapSource, 'utf8');
  entryPoints['bootstrap'] = bootstrapEntryPath;

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
    projectRoot: ctx.projectRoot,
    staticOutDir: ctx.staticOutDir,
    tempOutDir: ctx.tempOutDir,
    publicEnv,
    onDiagnostic: (d) => diagnostics.push(d),
  });

  const bundleResult = await adapter.bundle({
    entryPoints,
    outdir: ctx.staticOutDir,
    absWorkingDir: ctx.projectRoot,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    splitting: true,
    sourcemap: ctx.config.sourceMaps === false ? false : undefined,
    minify: ctx.config.minify ?? true,
    define: { ...defines, ...(ctx.pluginDefines ?? {}) },
    pluginAliases: ctx.pluginAliases,
    plugins: [ranuPlugin],
    external: ['react', 'react-dom', 'react/jsx-runtime', '@ranu/react'],
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
    // The development output directory intentionally keeps last-good assets.
    // Build the manifest from this invocation's metafile so stale content-hash
    // siblings from earlier rebuilds cannot be selected for HMR.
    const currentOutputs = Object.keys(bundleResult.metafile?.outputs ?? {}).map((output) =>
      path.basename(output),
    );
    const files = [...new Set(currentOutputs)];

    const findMatched = (cleanKey: string) => {
      const js = files
        .filter((f) => f.startsWith(`c_${cleanKey}`) && f.endsWith('.js'))
        .map((f) => `/_ranu/assets/${f}`);
      const css = files
        .filter(
          (f) =>
            (f.startsWith(`c_${cleanKey}`) || f.startsWith(`c_css-${cleanKey}`)) &&
            f.endsWith('.css'),
        )
        .map((f) => `/_ranu/assets/${f}`);
      return { js, css };
    };

    // Helper to find all CSS generated for a source file path
    const findCssForSource = (sourcePath: string): string[] => {
      const rel = path.relative(ctx.projectRoot, sourcePath).replace(/\\/g, '/');
      const cleanKey = rel
        .replace(/^app[/\\]/, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-');

      const directCss = findMatched(cleanKey).css;
      const cssNodeMatch: string[] = [];

      // Traverse imports so CSS from components used by a route is associated transitively.
      if (graph) {
        const visited = new Set<string>();

        const collectImportedCss = (nodeId: string): void => {
          if (visited.has(nodeId)) {
            return;
          }
          visited.add(nodeId);

          const node = graph.nodes.get(nodeId);
          if (!node) {
            return;
          }

          for (const imp of node.imports) {
            if (imp.resolvedPath && imp.resolvedPath.endsWith('.css')) {
              const impRel = path.relative(ctx.projectRoot, imp.resolvedPath).replace(/\\/g, '/');
              const impKey = impRel
                .replace(/^app[/\\]/, '')
                .replace(/\.[^.]+$/, '')
                .replace(/[^a-zA-Z0-9_-]/g, '-');
              cssNodeMatch.push(...findMatched(impKey).css);
            } else if (imp.resolvedPath) {
              const importedNodeId = path
                .relative(ctx.projectRoot, imp.resolvedPath)
                .replace(/\\/g, '/');
              collectImportedCss(importedNodeId);
            }
          }
        };

        collectImportedCss(rel);
      }

      return [...new Set([...directCss, ...cssNodeMatch])];
    };

    // Bootstrap assets
    const bootstrapMatched = findMatched('bootstrap');
    const rootLayoutCandidates = [
      'app/layout.tsx',
      'app/layout.ts',
      'app/layout.jsx',
      'app/layout.js',
    ];
    const rootCss: string[] = [];
    for (const cand of rootLayoutCandidates) {
      const full = path.join(ctx.projectRoot, cand);
      if (fs.existsSync(full)) {
        rootCss.push(...findCssForSource(full));
      }
    }
    // Also check global.css in app
    const globalCssPath = path.join(ctx.projectRoot, 'app', 'global.css');
    if (fs.existsSync(globalCssPath)) {
      rootCss.push(...findCssForSource(globalCssPath));
    }

    assets['bootstrap'] = {
      js: bootstrapMatched.js,
      css: [...new Set([...bootstrapMatched.css, ...rootCss])],
    };

    // Client entries
    if (graph) {
      for (const entryId of graph.clientEntries) {
        const cleanKey = entryId
          .replace(/^app[/\\]/, '')
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '-');
        const matched = findMatched(cleanKey);
        const entryNode = graph.nodes.get(entryId);
        const nodeCss = entryNode?.filePath ? findCssForSource(entryNode.filePath) : [];
        if (matched.js.length > 0 || matched.css.length > 0 || nodeCss.length > 0) {
          assets[entryId] = {
            js: matched.js,
            css: [...new Set([...matched.css, ...nodeCss])],
          };
        }
      }
    }

    // Map routeId entries (including layouts CSS in order: root -> nested -> page)
    if (routes) {
      for (const route of routes) {
        const routeJs: string[] = [];
        const routeCss: string[] = [...assets['bootstrap'].css];

        // Layout CSS in hierarchy order
        for (const layoutPath of route.layouts) {
          const fullPath = resolveRouteComponentPath(ctx.projectRoot, layoutPath);
          if (fs.existsSync(fullPath)) {
            for (const c of findCssForSource(fullPath)) {
              if (!routeCss.includes(c)) {
                routeCss.push(c);
              }
            }
          }
        }

        // Page component JS & CSS
        if (route.sourceFile && fs.existsSync(route.sourceFile)) {
          const rel = path.relative(ctx.projectRoot, route.sourceFile);
          const cleanKey = rel
            .replace(/^app[/\\]/, '')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]/g, '-');
          const matched = findMatched(cleanKey);
          for (const j of matched.js) {
            if (!routeJs.includes(j)) {
              routeJs.push(j);
            }
          }
          for (const c of findCssForSource(route.sourceFile)) {
            if (!routeCss.includes(c)) {
              routeCss.push(c);
            }
          }

          const relSource = rel.replace(/\\/g, '/');
          assets[relSource] = {
            js: routeJs,
            css: routeCss,
          };
        }

        assets[route.routeId] = {
          js: routeJs,
          css: routeCss,
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
