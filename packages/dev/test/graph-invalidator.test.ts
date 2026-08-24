import { describe, it, expect } from 'vitest';
import { analyzeHmrUpdates } from '../src/hmr/graph-invalidator.js';
import type { DevFileEvent } from '../src/types.js';

describe('HMR Graph Invalidator & Update Analyzer', () => {
  it('returns no-op when changed events list is empty', () => {
    const result = analyzeHmrUpdates({
      changedEvents: [],
      projectRoot: '/test',
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
      projectRoot: '/test',
      generation: 1,
    });
    expect(configResult.canHotUpdate).toBe(false);
    expect(configResult.requiresReload).toBe(true);

    const envResult = analyzeHmrUpdates({
      changedEvents: [envEvent],
      projectRoot: '/test',
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
      projectRoot: '/test',
      generation: 1,
    });
    expect(result.canHotUpdate).toBe(false);
    expect(result.requiresReload).toBe(true);
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
      projectRoot: '/test',
      generation: 2,
    });

    expect(result.canHotUpdate).toBe(true);
    expect(result.requiresReload).toBe(false);
    expect(result.updates).toHaveLength(2);
    expect(result.updates[0].type).toBe('css');
    expect(result.updates[0].url).toContain('c_global.css?v=2');
    expect(result.updates[1].type).toBe('css');
    expect(result.updates[1].url).toContain('c_Button.css?v=2');
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
      projectRoot: '/test',
      generation: 3,
    });

    expect(result.canHotUpdate).toBe(true);
    expect(result.requiresReload).toBe(false);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].type).toBe('js');
    expect(result.updates[0].url).toContain('c_components-Header.js?v=3');
  });
});
