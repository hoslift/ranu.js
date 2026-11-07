import fs from 'node:fs';
import path from 'node:path';
import { RANU_VERSION } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import {
  MANIFEST_SCHEMA_VERSION,
  ROUTE_MANIFEST_SCHEMA_VERSION,
  type BuildDescriptor,
  type RouteManifest,
  type ServerManifest,
  type ClientManifest,
  type StaticManifest,
  type StaticManifestEntry,
  type RouteManifestEntry,
  type ServerManifestEntry,
  type ClientAssetGroup,
  type ActionManifest,
  type ServerActionMetadata,
  validateBuildDescriptor,
  validateRouteManifest,
  validateServerManifest,
  validateClientManifest,
  validateStaticManifest,
  validateActionManifest,
} from '@ranu/manifests';
import { formatJson, normalizePath } from '../output/artifact-writer.js';
import type { BuildContext } from '../build-config.js';
import type { RouteEntryInfo } from './stage-routes.js';

export interface ManifestStageResult {
  success: boolean;
  buildDescriptor: BuildDescriptor;
  routeManifest: RouteManifest;
  serverManifest: ServerManifest;
  clientManifest: ClientManifest;
  staticManifest: StaticManifest;
  actionManifest: ActionManifest;
  diagnostics: RanuDiagnostic[];
}

/**
 * Manifest Generation Stage (Stage 15).
 * Generates and validates all 5 manifests and the root build descriptor.
 */
export function runManifestStage(
  ctx: BuildContext,
  routes: RouteEntryInfo[],
  clientAssets: Record<string, ClientAssetGroup> = {},
  staticRoutes: readonly StaticManifestEntry[] = [],
  serverActions: Record<string, ServerActionMetadata> = {},
): ManifestStageResult {
  const diagnostics: RanuDiagnostic[] = [];
  const buildId = ctx.buildId;

  // 1. Build RouteManifest entries (sorted deterministically by pattern)
  const routeEntries: RouteManifestEntry[] = routes.map((r) => {
    if (r.kind === 'api') {
      return {
        id: r.routeId,
        kind: 'api' as const,
        pattern: r.pathnameTemplate,
        params: r.params,
        methods: r.methods,
      };
    } else {
      return {
        id: r.routeId,
        kind: 'page' as const,
        pattern: r.pathnameTemplate,
        params: r.params,
        renderMode: r.renderMode,
        layouts: r.layouts,
        ...(r.loading !== undefined ? { loading: r.loading } : {}),
        errors: r.errors,
        ...(r.notFound !== undefined ? { notFound: r.notFound } : {}),
      };
    }
  });

  // Sort deterministically by pattern
  routeEntries.sort((a, b) => a.pattern.localeCompare(b.pattern));

  const routeManifest: RouteManifest = {
    schemaVersion: ROUTE_MANIFEST_SCHEMA_VERSION,
    buildId,
    routes: routeEntries,
  };

  // 2. Build ServerManifest entries (sorted deterministically by routeId)
  const serverEntries: ServerManifestEntry[] = routes.map((r) => ({
    routeId: r.routeId,
    serverEntry: normalizePath(r.outputRelativePath),
  }));

  serverEntries.sort((a, b) => a.routeId.localeCompare(b.routeId));

  const serverManifest: ServerManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    buildId,
    routes: serverEntries,
  };

  // 3. Build ClientManifest
  const clientManifest: ClientManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    buildId,
    assets: clientAssets,
  };

  // 4. Build StaticManifest
  const sortedStaticRoutes = [...staticRoutes].sort((a, b) => a.pathname.localeCompare(b.pathname));
  const staticManifest: StaticManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    buildId,
    routes: sortedStaticRoutes,
  };

  // 5. Build ActionManifest
  const actionManifest: ActionManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    buildId,
    actions: serverActions,
  };

  // 6. BuildDescriptor
  const buildDescriptor: BuildDescriptor = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    buildId,
    frameworkVersion: RANU_VERSION,
    runtime: 'node',
    manifests: {
      routes: './manifest/routes.json',
      server: './manifest/server.json',
      client: './manifest/client.json',
      static: './manifest/static.json',
      actions: './manifest/actions.json',
    },
  };

  // 7. Validate all manifests using official @ranu/manifests validators
  const descVal = validateBuildDescriptor(buildDescriptor);
  if (!descVal.success) diagnostics.push(...descVal.diagnostics);

  const routeVal = validateRouteManifest(routeManifest, buildId);
  if (!routeVal.success) diagnostics.push(...routeVal.diagnostics);

  const serverVal = validateServerManifest(serverManifest, buildId);
  if (!serverVal.success) diagnostics.push(...serverVal.diagnostics);

  const clientVal = validateClientManifest(clientManifest, buildId);
  if (!clientVal.success) diagnostics.push(...clientVal.diagnostics);

  const staticVal = validateStaticManifest(staticManifest, buildId);
  if (!staticVal.success) diagnostics.push(...staticVal.diagnostics);

  const actionVal = validateActionManifest(actionManifest, buildId);
  if (!actionVal.success) diagnostics.push(...actionVal.diagnostics);

  // 8. Write manifests to disk in temporary directory
  if (!fs.existsSync(ctx.manifestOutDir)) {
    fs.mkdirSync(ctx.manifestOutDir, { recursive: true });
  }

  fs.writeFileSync(path.join(ctx.tempOutDir, 'build.json'), formatJson(buildDescriptor));
  fs.writeFileSync(path.join(ctx.manifestOutDir, 'routes.json'), formatJson(routeManifest));
  fs.writeFileSync(path.join(ctx.manifestOutDir, 'server.json'), formatJson(serverManifest));
  fs.writeFileSync(path.join(ctx.manifestOutDir, 'client.json'), formatJson(clientManifest));
  fs.writeFileSync(path.join(ctx.manifestOutDir, 'static.json'), formatJson(staticManifest));
  fs.writeFileSync(path.join(ctx.manifestOutDir, 'actions.json'), formatJson(actionManifest));

  return {
    success: diagnostics.length === 0,
    buildDescriptor,
    routeManifest,
    serverManifest,
    clientManifest,
    staticManifest,
    actionManifest,
    diagnostics,
  };
}
