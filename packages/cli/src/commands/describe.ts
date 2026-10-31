import fs from 'node:fs';
import path from 'node:path';
import { discoverRoutes, type CompiledRouteRecord, type RouteTreeNode } from '@ranu/router';
import { analyzeRouteMethods, analyzePageRenderMode } from '@ranu/build';
import { RANU_VERSION, type HttpMethod, type RenderMode } from '@ranu/core';
import { MANIFEST_SCHEMA_VERSION, ROUTE_MANIFEST_SCHEMA_VERSION } from '@ranu/manifests';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

export interface RouteDescriptor {
  routeId: string;
  kind: 'page' | 'api';
  pathname: string;
  pathnameTemplate: string;
  params: string[];
  methods: string[];
  renderMode: RenderMode;
  sourceFile: string;
  layouts: string[];
  loading?: string | null;
  error?: string | null;
  errors: string[];
  notFound?: string | null;
}

export interface DescribeOutput {
  frameworkVersion: string;
  version: string;
  manifestSchemaVersion: number;
  routeManifestSchemaVersion: number;
  projectRoot: string;
  routesCount: number;
  routeCount: number;
  routes: RouteDescriptor[];
  diagnostics: RanuDiagnostic[];
}

/**
 * Executes the `ranu describe` command for full route graph introspection.
 *
 * @param args - CLI arguments (supports `--format json` / `--json`)
 * @param logger - CLI logger instance
 * @returns 0 on success (no error diagnostics), 1 otherwise
 */
export async function runDescribeCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'development');
  const projectRoot = ctx.projectRoot;
  const appDir = path.join(projectRoot, 'app');

  const diagnostics: RanuDiagnostic[] = [];
  let records: CompiledRouteRecord[] = [];
  let tree: Record<string, RouteTreeNode> = {};
  let rootNotFound: string | undefined;

  if (fs.existsSync(appDir)) {
    const res = discoverRoutes(appDir, { analyzeRouteMethods });
    tree = res.tree;
    records = res.records;
    diagnostics.push(...res.diagnostics);
    rootNotFound = res.rootNotFound;
  }

  const routes: RouteDescriptor[] = records.map((record) => {
    let sourceRelPath = '';
    const possibleExts = ['.tsx', '.ts', '.jsx', '.js'];

    if (record.kind === 'page') {
      const matchingNode = Object.values(tree).find((n) => {
        if (!n.page) return false;
        const parts = n.id === '/' ? [] : n.id.split('/');
        const urlSegs = parts.filter((p) => !p.startsWith('(') && !p.startsWith('_'));
        return '/' + urlSegs.join('/') === record.pathnameTemplate;
      });
      if (matchingNode?.page) {
        sourceRelPath = matchingNode.page;
      } else {
        const segPath = record.pathnameTemplate === '/' ? '' : record.pathnameTemplate.replace(/^\//, '');
        for (const ext of possibleExts) {
          const cand = path.join(appDir, segPath, `page${ext}`);
          if (fs.existsSync(cand)) {
            sourceRelPath = path.relative(appDir, cand);
            break;
          }
        }
      }
    } else {
      const matchingNode = Object.values(tree).find((n) => {
        if (!n.route) return false;
        const parts = n.id === '/' ? [] : n.id.split('/');
        const urlSegs = parts.filter((p) => !p.startsWith('(') && !p.startsWith('_'));
        return '/' + urlSegs.join('/') === record.pathnameTemplate;
      });
      if (matchingNode?.route) {
        sourceRelPath = matchingNode.route;
      } else {
        const segPath = record.pathnameTemplate === '/' ? '' : record.pathnameTemplate.replace(/^\//, '');
        for (const ext of possibleExts) {
          const cand = path.join(appDir, segPath, `route${ext}`);
          if (fs.existsSync(cand)) {
            sourceRelPath = path.relative(appDir, cand);
            break;
          }
        }
      }
    }

    const fullSourcePath = sourceRelPath ? path.resolve(appDir, sourceRelPath) : '';
    const sourceFile = fullSourcePath
      ? path.relative(projectRoot, fullSourcePath).replace(/\\/g, '/')
      : '';

    let renderMode: RenderMode = 'server';
    if (record.kind === 'page' && fullSourcePath && fs.existsSync(fullSourcePath)) {
      try {
        const content = fs.readFileSync(fullSourcePath, 'utf8');
        const modeAnalysis = analyzePageRenderMode(
          fullSourcePath,
          content,
          ctx.config.rendering?.defaultMode ?? 'server'
        );
        renderMode = modeAnalysis.renderMode;
        diagnostics.push(...modeAnalysis.diagnostics);
      } catch {
        // Fallback to default render mode
      }
    }

    const layouts = record.kind === 'page'
      ? (record.layouts || []).map((l) => path.relative(projectRoot, path.resolve(appDir, l)).replace(/\\/g, '/'))
      : [];

    const loading = record.kind === 'page' && record.loading
      ? path.relative(projectRoot, path.resolve(appDir, record.loading)).replace(/\\/g, '/')
      : null;

    const errorFirst = record.kind === 'page' && record.errors?.[0]
      ? path.relative(projectRoot, path.resolve(appDir, record.errors[0])).replace(/\\/g, '/')
      : null;

    const errors = record.kind === 'page' && record.errors
      ? record.errors.map((e) => path.relative(projectRoot, path.resolve(appDir, e)).replace(/\\/g, '/'))
      : [];

    const notFoundCandidate = record.kind === 'page'
      ? (record.notFound?.[0] ?? rootNotFound)
      : undefined;

    const notFound = notFoundCandidate
      ? path.relative(projectRoot, path.resolve(appDir, notFoundCandidate)).replace(/\\/g, '/')
      : null;

    const methods: string[] = record.kind === 'api'
      ? ((record as { methods?: HttpMethod[] }).methods ?? []).map(String)
      : ['GET'];

    return {
      routeId: record.routeId,
      kind: record.kind,
      pathname: record.pathnameTemplate,
      pathnameTemplate: record.pathnameTemplate,
      params: record.params,
      methods,
      renderMode,
      sourceFile,
      layouts,
      loading,
      error: errorFirst,
      errors,
      notFound,
    };
  });

  const output: DescribeOutput = {
    frameworkVersion: RANU_VERSION,
    version: RANU_VERSION,
    manifestSchemaVersion: MANIFEST_SCHEMA_VERSION,
    routeManifestSchemaVersion: ROUTE_MANIFEST_SCHEMA_VERSION,
    projectRoot,
    routesCount: routes.length,
    routeCount: routes.length,
    routes,
    diagnostics,
  };

  if (args.format === 'compact') {
    const compactRoutes = routes.map((r) => [
      r.methods.join(','),
      r.pathname,
      r.kind,
      r.renderMode,
      r.sourceFile,
    ]);
    logger.json(compactRoutes);
  } else if (args.format === 'json' || args.json) {
    logger.json(output);
  } else {
    logger.log(`\nRanu.js Application Route Graph (${routes.length} route${routes.length === 1 ? '' : 's'}):\n`);
    for (const r of routes) {
      const badge = r.kind === 'api' ? '\x1b[33m[API]\x1b[0m ' : '\x1b[36m[PAGE]\x1b[0m';
      const methodsStr = r.methods.join(', ');
      const modeStr = r.kind === 'page' ? ` [${r.renderMode}]` : '';
      logger.log(`  ${badge} ${r.pathname}${modeStr} \x1b[90m(${methodsStr})\x1b[0m -> ${r.sourceFile}`);
      if (r.layouts.length > 0) {
        logger.log(`         \x1b[90mLayouts: ${r.layouts.join(' -> ')}\x1b[0m`);
      }
    }
    logger.log('');

    const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
    const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
    if (errorCount > 0 || warningCount > 0) {
      logger.log(`Diagnostics: ${errorCount} error(s), ${warningCount} warning(s)`);
      for (const diag of diagnostics) {
        if (diag.severity === 'error') {
          logger.error(`  [${diag.code}] ${diag.message}`);
        } else {
          logger.warn(`  [${diag.code}] ${diag.message}`);
        }
      }
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return hasErrors ? 1 : 0;
}
