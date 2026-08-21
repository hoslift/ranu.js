import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { StaticManifestEntry } from '@ranu/manifests';
import type { ComponentModuleLoader } from '@ranu/react';
import type { BuildContext } from '../build-config.js';
import type { RouteEntryInfo } from './stage-routes.js';
import {
  evaluateStaticRoute,
  type EvaluateStaticRouteResult,
  type EvaluatedStaticPath,
} from '../static/params-evaluator.js';
import {
  renderStaticRoutesInBatch,
  type StaticRouteArtifact,
  type RenderStaticRouteOptions,
} from '../static/static-renderer.js';

export interface StaticStageResult {
  readonly success: boolean;
  readonly staticRoutes: readonly StaticManifestEntry[];
  readonly artifacts: readonly StaticRouteArtifact[];
  readonly diagnostics: readonly RanuDiagnostic[];
}

/**
 * Creates a ComponentModuleLoader that loads compiled server entries or source components.
 */
export function createBuildComponentLoader(
  ctx: BuildContext,
  routes: RouteEntryInfo[]
): ComponentModuleLoader {
  return {
    async loadPage(routeId: string) {
      const route = routes.find(r => r.routeId === routeId);
      if (!route) return undefined;
      const compiledPath = path.join(ctx.tempOutDir, route.outputRelativePath);
      if (fs.existsSync(compiledPath)) {
        return import(pathToFileURL(compiledPath).href);
      }
      if (route.sourceFile && fs.existsSync(route.sourceFile)) {
        return import(pathToFileURL(route.sourceFile).href);
      }
      return undefined;
    },
    async loadLayout(layoutPath: string) {
      const srcPath = path.isAbsolute(layoutPath)
        ? layoutPath
        : path.resolve(ctx.projectRoot, layoutPath);
      if (fs.existsSync(srcPath)) {
        return import(pathToFileURL(srcPath).href);
      }
      return undefined;
    },
    async loadNotFound(notFoundPath: string) {
      const srcPath = path.isAbsolute(notFoundPath)
        ? notFoundPath
        : path.resolve(ctx.projectRoot, notFoundPath);
      if (fs.existsSync(srcPath)) {
        return import(pathToFileURL(srcPath).href);
      }
      return undefined;
    },
    async loadLoading(loadingPath: string) {
      const srcPath = path.isAbsolute(loadingPath)
        ? loadingPath
        : path.resolve(ctx.projectRoot, loadingPath);
      if (fs.existsSync(srcPath)) {
        return import(pathToFileURL(srcPath).href);
      }
      return undefined;
    },
    async loadError(errorPath: string) {
      const srcPath = path.isAbsolute(errorPath)
        ? errorPath
        : path.resolve(ctx.projectRoot, errorPath);
      if (fs.existsSync(srcPath)) {
        return import(pathToFileURL(srcPath).href);
      }
      return undefined;
    },
  };
}

/**
 * Static Generation Stage (Stage 15C).
 * Discovers render="static" routes, evaluates generateStaticParams(),
 * renders static HTML documents, and collects StaticManifest entries.
 */
export async function runStaticGenerationStage(
  ctx: BuildContext,
  routes: RouteEntryInfo[],
  customLoader?: ComponentModuleLoader
): Promise<StaticStageResult> {
  const diagnostics: RanuDiagnostic[] = [];
  const loader = customLoader ?? createBuildComponentLoader(ctx, routes);
  const trailingSlash: 'never' | 'always' =
    ctx.resolvedConfig?.routing?.trailingSlash === 'always' ? 'always' : 'never';
  const concurrency = 8;

  // 1. Filter for static page routes (skip server and client routes)
  const staticPageRoutes = routes.filter(
    r => r.kind === 'page' && r.renderMode === 'static'
  );

  if (staticPageRoutes.length === 0) {
    return {
      success: true,
      staticRoutes: [],
      artifacts: [],
      diagnostics: [],
    };
  }

  const routeConfigs: RenderStaticRouteOptions[] = [];
  const evaluatedRoutes: EvaluateStaticRouteResult[] = [];

  // 2. Evaluate each static route using Stage 15A
  for (const route of staticPageRoutes) {
    let pageModule: any;
    try {
      pageModule = await loader.loadPage(route.routeId);
    } catch (err: any) {
      diagnostics.push({
        code: 'RANU_SSG_GENERATOR_FAILED',
        severity: 'error',
        message: `Failed to load static page module for route "${route.routeId}": ${err.message ?? String(err)}`,
        ...(route.sourceFile
          ? { location: { file: route.sourceFile, line: 1, column: 1 } }
          : {}),
      });
      continue;
    }

    const generatorFn = pageModule?.generateStaticParams;

    const patternSegments: Array<
      | { kind: 'static'; value: string }
      | { kind: 'dynamic'; param: string }
      | { kind: 'catch-all'; param: string }
      | { kind: 'optional-catch-all'; param: string }
    > = route.pathnameTemplate
      .split('/')
      .filter(Boolean)
      .map(seg => {
        if (seg.startsWith('[...') && seg.endsWith(']')) {
          return { kind: 'catch-all', param: seg.slice(4, -1) };
        }
        if (seg.startsWith('[[...') && seg.endsWith(']]')) {
          return { kind: 'optional-catch-all', param: seg.slice(5, -2) };
        }
        if (seg.startsWith('[') && seg.endsWith(']')) {
          return { kind: 'dynamic', param: seg.slice(1, -1) };
        }
        return { kind: 'static', value: seg };
      });

    const evaluated = await evaluateStaticRoute({
      routeId: route.routeId,
      pathnameTemplate: route.pathnameTemplate,
      pattern: { segments: patternSegments },
      params: route.params,
      renderMode: route.renderMode,
      generatorFn,
    });

    diagnostics.push(...evaluated.diagnostics);
    if (evaluated.diagnostics.some(d => d.severity === 'error')) {
      continue;
    }

    evaluatedRoutes.push(evaluated);

    for (const evaluatedPath of evaluated.paths) {
      const targetParams: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(evaluatedPath.params)) {
        if (typeof v === 'string') {
          targetParams[k] = v;
        } else if (Array.isArray(v)) {
          targetParams[k] = Array.from(v);
        }
      }

      routeConfigs.push({
        routeId: route.routeId,
        pathname: evaluatedPath.pathname,
        params: evaluatedPath.params,
        target: {
          routeId: route.routeId,
          layouts: route.layouts,
          ...(route.loading !== undefined ? { loading: route.loading } : {}),
          errors: route.errors,
          ...(route.notFound !== undefined ? { notFound: route.notFound } : {}),
          params: targetParams,
        },
        loader,
        buildId: ctx.buildId,
        outputDir: ctx.tempOutDir,
        trailingSlash,
      });
    }
  }

  // 3. Generate global fallback 404.html artifact if root layout or not-found is present
  const rootLayouts = routes.find(r => r.layouts.length > 0)?.layouts ?? [];
  const rootNotFound = routes.find(r => r.notFound && r.notFound.length > 0)?.notFound ?? [];

  // Render root fallback 404
  const global404Loader: ComponentModuleLoader = {
    ...loader,
    async loadPage(_routeId: string) {
      if (rootNotFound.length > 0 && typeof rootNotFound[0] === 'string') {
        try {
          const nfMod = await loader.loadNotFound(rootNotFound[0]);
          if (nfMod?.default) {
            const NFComp = nfMod.default;
            return {
              default: () => React.createElement(NFComp),
            };
          }
        } catch {
          // Fall through to default fallback
        }
      }
      return {
        default: () => {
          return React.createElement(
            'div',
            { id: 'not-found', style: { fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1rem' } },
            React.createElement('h1', { style: { fontSize: '2rem', marginBottom: '1rem' } }, '404 - Page Not Found'),
            React.createElement('p', { style: { color: '#666' } }, 'This page could not be found.')
          );
        },
      };
    },
  };

  routeConfigs.push({
    routeId: 'page:/404',
    pathname: '/404',
    params: {},
    target: {
      routeId: 'page:/404',
      layouts: rootLayouts,
      errors: [],
      ...(rootNotFound.length > 0 ? { notFound: rootNotFound } : {}),
      params: {},
    },
    loader: global404Loader,
    buildId: ctx.buildId,
    outputDir: ctx.tempOutDir,
    trailingSlash: 'never',
  });

  // Stop if evaluation generated errors
  if (diagnostics.some(d => d.severity === 'error')) {
    return {
      success: false,
      staticRoutes: [],
      artifacts: [],
      diagnostics,
    };
  }

  // 4. Render all static routes in batch using Stage 15B
  let artifacts: StaticRouteArtifact[] = [];
  try {
    artifacts = await renderStaticRoutesInBatch(routeConfigs, concurrency);
  } catch (err: any) {
    diagnostics.push({
      code: err.code ?? 'RANU_SSG_RENDER_FAILED',
      severity: 'error',
      message: err.message ?? `Static site generation failed during rendering.`,
    });
    return {
      success: false,
      staticRoutes: [],
      artifacts: [],
      diagnostics,
    };
  }

  // 5. Convert artifacts to StaticManifestEntry[]
  const staticManifestEntries: StaticManifestEntry[] = artifacts.map(artifact => {
    const entry: StaticManifestEntry = {
      pathname: artifact.pathname,
      routeId: artifact.routeId,
      file: artifact.file.replace(/\\/g, '/'),
    };
    if (artifact.status === 404 || artifact.pathname === '/404') {
      entry.status = 404;
    }
    return entry;
  });

  // Sort deterministically by pathname
  staticManifestEntries.sort((a, b) => a.pathname.localeCompare(b.pathname));

  return {
    success: diagnostics.length === 0,
    staticRoutes: staticManifestEntries,
    artifacts,
    diagnostics,
  };
}
