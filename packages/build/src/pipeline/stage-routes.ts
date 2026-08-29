import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import ts from 'typescript';
import type { RouteKind, RenderMode, HttpMethod } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { discoverRoutes, type CompiledRouteRecord } from '@ranu/router';
import { analyzeRouteMethods } from '../analyzer.js';
import type { BuildContext } from '../build-config.js';

export interface RouteEntryInfo {
  routeId: string;
  kind: RouteKind;
  pathnameTemplate: string;
  params: string[];
  renderMode: RenderMode;
  methods: HttpMethod[];
  sourceFile: string;
  layouts: string[];
  loading?: string | undefined;
  errors: string[];
  notFound?: string[] | undefined;
  outputRelativePath: string;
}

export interface RouteStageResult {
  routes: RouteEntryInfo[];
  records: CompiledRouteRecord[];
  diagnostics: RanuDiagnostic[];
}

/** Resolve a router-discovered component path, which is relative to the app directory. */
export function resolveRouteComponentPath(projectRoot: string, componentPath: string): string {
  if (path.isAbsolute(componentPath)) {
    return componentPath;
  }

  const appRelativePath = path.resolve(projectRoot, 'app', componentPath);
  if (fs.existsSync(appRelativePath)) {
    return appRelativePath;
  }

  // Preserve compatibility with callers that already include the app/ prefix.
  return path.resolve(projectRoot, componentPath);
}

/** Encode an app-relative component path as a deterministic, collision-free file name. */
export function getRouteComponentEntryName(componentPath: string): string {
  const normalizedPath = componentPath.replace(/\\/g, '/');
  return Buffer.from(normalizedPath, 'utf8').toString('base64url');
}

/**
 * Statically analyzes a page source file to check for exported render mode (e.g. `export const render = 'static'`).
 */
export function analyzePageRenderMode(
  filePath: string,
  fileContent: string,
  defaultMode: RenderMode = 'server'
): { renderMode: RenderMode; diagnostics: RanuDiagnostic[] } {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);
  const diagnostics: RanuDiagnostic[] = [];
  let discoveredMode: RenderMode | undefined;

  function visit(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      if (isExported) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === 'render') {
            if (decl.initializer && ts.isStringLiteral(decl.initializer)) {
              const val = decl.initializer.text;
              if (val === 'server' || val === 'static' || val === 'client') {
                discoveredMode = val as RenderMode;
              } else {
                const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, decl.initializer.getStart(sourceFile));
                diagnostics.push({
                  code: 'RANU_BUILD_INVALID_RENDER_MODE',
                  severity: 'error',
                  message: `Invalid render mode export "${val}" in ${filePath}. Allowed values are: "server", "static", "client".`,
                  location: {
                    file: filePath,
                    line: line + 1,
                    column: character + 1,
                  },
                });
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    renderMode: discoveredMode ?? defaultMode,
    diagnostics,
  };
}

/**
 * Generates a clean, file-safe output filename identifier for a route.
 * e.g. page:/ -> page-root.mjs
 *      page:/products/[id] -> page-products-id.mjs
 *      api:/api/users -> api-api-users.mjs
 */
export function getRouteOutputRelativePath(routeId: string): string {
  const [kind, ...pathParts] = routeId.split(':');
  const pathname = pathParts.join(':');
  const sanitized = pathname
    .replace(/^\//, '')
    .replace(/\[\.\.\.([^\]]+)\]/g, 'catchall-$1')
    .replace(/\[\[\.\.\.([^\]]+)\]\]/g, 'optcatchall-$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const suffix = sanitized ? `-${sanitized}` : '-root';
  return `server/routes/${kind}${suffix}.mjs`;
}

/**
 * Route discovery and preparation stage.
 */
export function runRouteStage(ctx: BuildContext): RouteStageResult {
  const appDir = path.join(ctx.projectRoot, 'app');
  const diagnostics: RanuDiagnostic[] = [];

  if (!fs.existsSync(appDir)) {
    return { routes: [], records: [], diagnostics };
  }

  // 1. Discover routes using @ranu/router and method analyzer
  const { records, diagnostics: routerDiags } = discoverRoutes(appDir, { analyzeRouteMethods });
  diagnostics.push(...routerDiags);

  // 2. Process each discovered route into RouteEntryInfo
  const routes: RouteEntryInfo[] = [];

  for (const record of records) {
    const isApi = record.kind === 'api';

    // Discover actual source file path
    let sourceFile = '';
    const possiblePageExts = ['.tsx', '.ts', '.jsx', '.js'];
    const recordPath = record.pathnameTemplate === '/' ? '' : record.pathnameTemplate;

    if (isApi) {
      for (const ext of possiblePageExts) {
        const candidate = path.join(appDir, recordPath, `route${ext}`);
        if (fs.existsSync(candidate)) {
          sourceFile = path.resolve(candidate);
          break;
        }
      }
    } else {
      for (const ext of possiblePageExts) {
        const candidate = path.join(appDir, recordPath, `page${ext}`);
        if (fs.existsSync(candidate)) {
          sourceFile = path.resolve(candidate);
          break;
        }
      }
    }

    let renderMode: RenderMode = 'server';
    if (!isApi && sourceFile && fs.existsSync(sourceFile)) {
      const content = fs.readFileSync(sourceFile, 'utf8');
      const analysis = analyzePageRenderMode(
        sourceFile,
        content,
        ctx.resolvedConfig.rendering?.defaultMode ?? 'server'
      );
      renderMode = analysis.renderMode;
      diagnostics.push(...analysis.diagnostics);
    }

    const outputRelativePath = getRouteOutputRelativePath(record.routeId);

    routes.push({
      routeId: record.routeId,
      kind: record.kind,
      pathnameTemplate: record.pathnameTemplate,
      params: record.params,
      renderMode,
      methods: isApi ? (record as any).methods ?? [] : [],
      sourceFile,
      layouts: record.layouts ?? [],
      loading: record.loading,
      errors: record.errors ?? [],
      notFound: record.notFound,
      outputRelativePath,
    });
  }

  return { routes, records, diagnostics };
}
