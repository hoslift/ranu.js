import { describe, it, expect } from 'vitest';
import { analyzeHmrUpdates } from '../src/hmr/graph-invalidator.js';
import type { DevFileEvent } from '../src/types.js';

describe('HMR Graph Invalidator & Update Analyzer', () => {
  it('returns no-op when changed events list is empty', () => {
    const result = analyzeHmrUpdates({
      changedEvents: [],
      generation: 1,
    });
    expect(result.canHotUpdate).toBe(true);
    expect(result.requiresReload).toBe(false);
    expect(result.updates).toHaveLength(0);
  });

  it('triggers full reload for config and environment changes', () => {
    const configEvent: DevFileEvent = {
      type: 'change',
      relativePath: 'ranu.config.ts',
      fullPath: '/test/ranu.config.ts',
      category: 'config',
    };
    const envEvent: DevFileEvent = {
      type: 'change',
      relativePath: '.env.local',
      fullPath: '/test/.env.local',
      category: 'env',
    };

    const configResult = analyzeHmrUpdates({
      changedEvents: [configEvent],
      generation: 1,
    });
    expect(configResult.canHotUpdate).toBe(false);
    expect(configResult.requiresReload).toBe(true);

    const envResult = analyzeHmrUpdates({
      changedEvents: [envEvent],
      generation: 1,
    });
    expect(envResult.canHotUpdate).toBe(false);
    expect(envResult.requiresReload).toBe(true);
  });

  it('triggers full reload for route addition and deletion', () => {
    const routeAddEvent: DevFileEvent = {
      type: 'add',
      relativePath: 'app/about/page.tsx',
      fullPath: '/test/app/about/page.tsx',
      category: 'route',
    };
    const result = analyzeHmrUpdates({
      changedEvents: [routeAddEvent],
      generation: 1,
    });
    expect(result.canHotUpdate).toBe(false);
    expect(result.requiresReload).toBe(true);

    const unlinkResult = analyzeHmrUpdates({
      changedEvents: [{ ...routeAddEvent, type: 'unlink' }],
      generation: 2,
    });
    expect(unlinkResult.requiresReload).toBe(true);
  });

  it('triggers full reload for public and unsupported file changes', () => {
    const publicResult = analyzeHmrUpdates({
      changedEvents: [
        {
          type: 'change',
          relativePath: 'public/logo.svg',
          fullPath: '/test/public/logo.svg',
          category: 'public',
        },
      ],
      generation: 1,
    });
    const unsupportedResult = analyzeHmrUpdates({
      changedEvents: [
        {
          type: 'change',
          relativePath: 'README.md',
          fullPath: '/test/README.md',
          category: 'other',
        },
      ],
      generation: 1,
    });

    expect(publicResult.reason).toContain('Public asset changed');
    expect(unsupportedResult.reason).toContain('Unsupported file change');
  });

  it('creates CSS HMR update for CSS and CSS module edits', () => {
    const cssEvent: DevFileEvent = {
      type: 'change',
      relativePath: 'app/global.css',
      fullPath: '/test/app/global.css',
      category: 'css',
    };
    const moduleCssEvent: DevFileEvent = {
      type: 'change',
      relativePath: 'app/Button.module.css',
      fullPath: '/test/app/Button.module.css',
      category: 'css',
    };

    const result = analyzeHmrUpdates({
      changedEvents: [cssEvent, moduleCssEvent],
      generation: 2,
      routeManifest: {
        schemaVersion: 2,
        buildId: 'test',
        routes: [{ id: 'page:index', kind: 'page', pattern: '/', params: [] }],
      },
      clientManifest: {
        schemaVersion: 1,
        buildId: 'test',
        assets: {
          'page:index': {
            js: [],
            css: [
              '/_ranu/assets/c_css-global-AAAA.css',
              '/_ranu/assets/c_css-Button-module-BBBB.css',
            ],
          },
        },
      },
    });

    expect(result.canHotUpdate).toBe(true);
    expect(result.requiresReload).toBe(false);
    expect(result.updates).toHaveLength(2);
    expect(result.updates[0].type).toBe('css');
    expect(result.updates[0].url).toBe('/_ranu/assets/c_css-global-AAAA.css?v=2');
    expect(result.updates[1].type).toBe('css');
    expect(result.updates[1].url).toBe('/_ranu/assets/c_css-Button-module-BBBB.css?v=2');
    expect(result.affectedRoutes).toEqual(['page:index']);
  });

  it('creates JS Fast Refresh update for React component edits', () => {
    const componentEvent: DevFileEvent = {
      type: 'change',
      relativePath: 'app/components/Header.tsx',
      fullPath: '/test/app/components/Header.tsx',
      category: 'other',
    };

    const result = analyzeHmrUpdates({
      changedEvents: [componentEvent],
      generation: 3,
      routeManifest: {
        schemaVersion: 2,
        buildId: 'test',
        routes: [{ id: 'page:about', kind: 'page', pattern: '/about', params: [] }],
      },
      clientManifest: {
        schemaVersion: 1,
        buildId: 'test',
        assets: {
          'app/components/Header.tsx': {
            js: ['/_ranu/assets/c_components-Header-ABCD.js'],
            css: [],
          },
          'page:about': {
            js: ['/_ranu/assets/c_components-Header-ABCD.js'],
            css: [],
          },
        },
      },
    });

    expect(result.canHotUpdate).toBe(true);
    expect(result.requiresReload).toBe(false);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].type).toBe('js');
    expect(result.updates[0].url).toBe('/_ranu/assets/c_components-Header-ABCD.js?v=3');
    expect(result.affectedRoutes).toEqual(['page:about']);
  });

  it('falls back to reload instead of fabricating a missing bundle URL', () => {
    const result = analyzeHmrUpdates({
      changedEvents: [
        {
          type: 'change',
          relativePath: 'app/server-only.tsx',
          fullPath: '/test/app/server-only.tsx',
          category: 'other',
        },
      ],
      generation: 4,
      clientManifest: { schemaVersion: 1, buildId: 'test', assets: {} },
    });

    expect(result.canHotUpdate).toBe(false);
    expect(result.requiresReload).toBe(true);
    expect(result.updates).toEqual([]);
  });

  it('falls back when CSS asset resolution is missing or ambiguous', () => {
    const cssEvent: DevFileEvent = {
      type: 'change',
      relativePath: 'app/theme.css',
      fullPath: '/test/app/theme.css',
      category: 'css',
    };
    const missing = analyzeHmrUpdates({
      changedEvents: [cssEvent],
      generation: 5,
    });
    const ambiguous = analyzeHmrUpdates({
      changedEvents: [cssEvent],
      generation: 5,
      clientManifest: {
        schemaVersion: 1,
        buildId: 'test',
        assets: {
          first: { js: [], css: ['/_ranu/assets/c_css-theme-AAAA.css'] },
          second: { js: [], css: ['/_ranu/assets/c_css-theme-BBBB.css'] },
        },
      },
    });

    expect(missing.requiresReload).toBe(true);
    expect(ambiguous.requiresReload).toBe(true);
  });

  it.each(['jsx', 'ts', 'js'])('recognizes .%s JavaScript-family updates', (extension) => {
    const relativePath = `app/Widget.${extension}`;
    const asset = `/_ranu/assets/c_Widget-${extension}.js`;
    const result = analyzeHmrUpdates({
      changedEvents: [
        {
          type: 'change',
          relativePath,
          fullPath: `/test/${relativePath}`,
          category: 'other',
        },
      ],
      generation: 6,
      clientManifest: {
        schemaVersion: 1,
        buildId: 'test',
        assets: { [relativePath]: { js: [asset], css: [] } },
      },
    });

    expect(result.updates[0]?.url).toBe(`${asset}?v=6`);
  });
});
