import type { RouteManifest, ClientManifest } from '@ranu/manifests';
import type { DevFileEvent } from '../types.js';
import type { HmrAnalysisResult, HmrUpdatePayload } from './types.js';

export interface HmrAnalysisOptions {
  readonly changedEvents: readonly DevFileEvent[];
  readonly generation: number;
  readonly routeManifest?: RouteManifest | undefined;
  readonly clientManifest?: ClientManifest | undefined;
}

export function analyzeHmrUpdates(options: HmrAnalysisOptions): HmrAnalysisResult {
  const { changedEvents, generation, routeManifest, clientManifest } = options;

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
  const requireReload = (reason: string): HmrAnalysisResult => ({
    canHotUpdate: false,
    requiresReload: true,
    reason,
    updates: [],
    affectedRoutes: [],
  });
  const cleanSourceKey = (sourcePath: string): string =>
    sourcePath
      .replace(/^app\//, '')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-');
  const allAssetGroups = Object.values(clientManifest?.assets ?? {});
  const recordAffectedRoutes = (assetUrl: string): void => {
    for (const route of routeManifest?.routes ?? []) {
      const group = clientManifest?.assets[route.id];
      if (group && (group.js.includes(assetUrl) || group.css.includes(assetUrl))) {
        affectedRoutes.add(route.id);
      }
    }
  };

  for (const event of changedEvents) {
    const rel = event.relativePath.replace(/\\/g, '/');

    // 1. Config / env changes require full reload
    if (event.category === 'config' || event.category === 'env') {
      return requireReload(`${event.category} file changed: ${rel}`);
    }

    // 2. Public directory changes require full reload
    if (event.category === 'public') {
      return requireReload(`Public asset changed: ${rel}`);
    }

    // 3. Route structural adds/unlinks require full reload
    if (event.category === 'route' && (event.type === 'add' || event.type === 'unlink')) {
      return requireReload(`Route topology change: ${rel}`);
    }

    // 4. CSS and CSS Module updates
    if (event.category === 'css' || rel.endsWith('.css')) {
      const isModule = rel.endsWith('.module.css');
      const cleanKey = cleanSourceKey(rel);
      const validNames = [`c_css-${cleanKey}-`, `c_${cleanKey}-`];
      const cssAssets = new Set(
        allAssetGroups
          .flatMap((group) => group.css)
          .filter((asset) => {
            const fileName = asset.split('/').pop() ?? '';
            return (
              fileName.endsWith('.css') && validNames.some((prefix) => fileName.startsWith(prefix))
            );
          }),
      );
      if (cssAssets.size !== 1) {
        return requireReload(`No unique emitted CSS asset found for ${rel}`);
      }
      const cssAsset = [...cssAssets][0]!;
      recordAffectedRoutes(cssAsset);

      updates.push({
        type: 'css',
        path: rel,
        url: `${cssAsset}?v=${generation}`,
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
      const jsAssets = new Set(clientManifest?.assets[rel]?.js ?? []);
      if (jsAssets.size !== 1) {
        return requireReload(`No unique emitted JavaScript asset found for ${rel}`);
      }
      const jsAsset = [...jsAssets][0]!;
      recordAffectedRoutes(jsAsset);

      updates.push({
        type: 'js',
        path: rel,
        url: `${jsAsset}?v=${generation}`,
        boundaryId: rel,
        isReactRefresh: true,
      });
      continue;
    }

    // 6. Other unsupported files fallback to reload
    return requireReload(`Unsupported file change: ${rel}`);
  }

  return {
    canHotUpdate: updates.length > 0,
    requiresReload: false,
    updates,
    affectedRoutes: Array.from(affectedRoutes),
  };
}
