import path from 'node:path';
import type { ModuleGraph } from '@ranu/build';
import type { RouteManifest, ClientManifest } from '@ranu/manifests';
import type { DevFileEvent } from '../types.js';
import type { HmrAnalysisResult, HmrUpdatePayload } from './types.js';

export interface HmrAnalysisOptions {
  readonly changedEvents: readonly DevFileEvent[];
  readonly projectRoot: string;
  readonly generation: number;
  readonly moduleGraph?: ModuleGraph | undefined;
  readonly routeManifest?: RouteManifest | undefined;
  readonly clientManifest?: ClientManifest | undefined;
}

export function analyzeHmrUpdates(options: HmrAnalysisOptions): HmrAnalysisResult {
  const { changedEvents, projectRoot, generation, moduleGraph, routeManifest, clientManifest } = options;

  if (changedEvents.length === 0) {
    return {
      canHotUpdate: true,
      requiresReload: false,
      updates: [],
      affectedRoutes: [],
    };
  }

  const updates: HmrUpdatePayload[] = [];
  const affectedRoutes = new Set<string>();

  for (const event of changedEvents) {
    const rel = event.relativePath.replace(/\\/g, '/');

    // 1. Config / env changes require full reload
    if (event.category === 'config' || event.category === 'env') {
      return {
        canHotUpdate: false,
        requiresReload: true,
        reason: `${event.category} file changed: ${rel}`,
        updates: [],
        affectedRoutes: [],
      };
    }

    // 2. Public directory changes require full reload
    if (event.category === 'public') {
      return {
        canHotUpdate: false,
        requiresReload: true,
        reason: `Public asset changed: ${rel}`,
        updates: [],
        affectedRoutes: [],
      };
    }

    // 3. Route structural adds/unlinks require full reload
    if (event.category === 'route' && (event.type === 'add' || event.type === 'unlink')) {
      return {
        canHotUpdate: false,
        requiresReload: true,
        reason: `Route topology change: ${rel}`,
        updates: [],
        affectedRoutes: [],
      };
    }

    // 4. CSS and CSS Module updates
    if (event.category === 'css' || rel.endsWith('.css')) {
      const isModule = rel.endsWith('.module.css');
      const cleanKey = rel
        .replace(/^app[/\\]/, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-');

      let cssUrl = `/_ranu/assets/c_${cleanKey}.css?v=${generation}`;
      if (clientManifest?.assets) {
        for (const [routeId, group] of Object.entries(clientManifest.assets)) {
          for (const c of group.css) {
            if (c.includes(cleanKey) || c.includes('global')) {
              cssUrl = `${c}?v=${generation}`;
              affectedRoutes.add(routeId);
            }
          }
        }
      }

      updates.push({
        type: 'css',
        path: rel,
        url: cssUrl,
        isModule,
      });
      continue;
    }

    // 5. React Component / JS / TSX updates
    if (
      rel.endsWith('.tsx') ||
      rel.endsWith('.jsx') ||
      rel.endsWith('.ts') ||
      rel.endsWith('.js')
    ) {
      // Find affected routes using module graph if available
      const cleanKey = rel
        .replace(/^app[/\\]/, '')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '-');

      let jsUrl = `/_ranu/assets/c_${cleanKey}.js?v=${generation}`;
      if (clientManifest?.assets) {
        for (const [routeId, group] of Object.entries(clientManifest.assets)) {
          for (const j of group.js) {
            if (j.includes(cleanKey)) {
              jsUrl = `${j}?v=${generation}`;
              affectedRoutes.add(routeId);
            }
          }
        }
      }

      if (routeManifest?.routes) {
        for (const r of routeManifest.routes) {
          if (r.pattern === '/' || rel.includes(r.id.replace('page:', '').replace('api:', ''))) {
            affectedRoutes.add(r.id);
          }
        }
      }

      updates.push({
        type: 'js',
        path: rel,
        url: jsUrl,
        boundaryId: rel,
        isReactRefresh: true,
      });
      continue;
    }

    // 6. Other unsupported files fallback to reload
    return {
      canHotUpdate: false,
      requiresReload: true,
      reason: `Unsupported file change: ${rel}`,
      updates: [],
      affectedRoutes: [],
    };
  }

  return {
    canHotUpdate: updates.length > 0,
    requiresReload: false,
    updates,
    affectedRoutes: Array.from(affectedRoutes),
  };
}
