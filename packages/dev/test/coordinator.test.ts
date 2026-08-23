import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RebuildCoordinator } from '../src/coordinator.js';

describe('RebuildCoordinator Incremental Builds', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-coord-'));
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Hello Dev</h1>;
}`
    );
  }, 60_000);

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('executes development build and tracks generations', async () => {
    const builds: any[] = [];
    const coordinator = new RebuildCoordinator({
      options: {
        projectRoot: tempDir,
      },
      onBuildComplete: (state) => {
        builds.push(state);
      },
    });

    const state1 = await coordinator.triggerRebuild('initial');
    expect(state1.success).toBe(true);
    expect(state1.generation).toBe(1);
    expect(state1.buildId).toContain('dev-1-');
    expect(coordinator.currentGoodState).toBeDefined();

    // Modify source
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Hello Updated Dev</h1>;
}`
    );

    const state2 = await coordinator.triggerRebuild('page update');
    expect(state2.success).toBe(true);
    expect(state2.generation).toBe(2);
    expect(builds.length).toBe(2);
  });

  it('handles build error without crashing and preserves last-good state', async () => {
    const coordinator = new RebuildCoordinator({
      options: {
        projectRoot: tempDir,
      },
      onBuildComplete: () => {},
    });

    const state1 = await coordinator.triggerRebuild('initial');
    expect(state1.success).toBe(true);

    // Introduce syntax error
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Unclosed tag</h1>;
`
    );

    const state2 = await coordinator.triggerRebuild('bad edit');
    expect(state2.success).toBe(false);
    expect(state2.diagnostics.length).toBeGreaterThan(0);
    // Last good state preserved
    expect(coordinator.currentGoodState?.generation).toBe(1);

    // Repair source
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Repaired</h1>;
}`
    );

    const state3 = await coordinator.triggerRebuild('fixed edit');
    expect(state3.success).toBe(true);
    expect(state3.generation).toBe(3);
    expect(coordinator.currentGoodState?.generation).toBe(3);
  }, 60_000);

  it('exposes currentState and isBusy reflecting the in-flight build', async () => {
    const coordinator = new RebuildCoordinator({
      options: { projectRoot: tempDir },
      onBuildComplete: () => {},
    });

    expect(coordinator.currentState).toBeNull();
    expect(coordinator.isBusy).toBe(false);

    const pending = coordinator.triggerRebuild('initial');
    // isBuilding is flipped synchronously before the first await, so it
    // should already read true for the in-flight build.
    expect(coordinator.isBusy).toBe(true);

    const state1 = await pending;
    expect(coordinator.isBusy).toBe(false);
    expect(coordinator.currentState).toBe(state1);
  }, 60_000);

  it('coalesces a rebuild requested while a build is already in-flight into a single follow-up build', async () => {
    const builds: any[] = [];
    const coordinator = new RebuildCoordinator({
      options: { projectRoot: tempDir },
      onBuildComplete: (state) => {
        builds.push(state);
      },
    });

    const state1 = await coordinator.triggerRebuild('initial');
    expect(state1.generation).toBe(1);
    builds.length = 0;

    // Fire two rebuilds back-to-back without awaiting the first. Because the
    // coordinator flips `isBuilding` synchronously before its first await,
    // the second call observes a build already in-flight and should queue a
    // follow-up instead of running concurrently.
    const firstCall = coordinator.triggerRebuild('first edit');
    const secondCall = coordinator.triggerRebuild('second edit (queued)');

    const secondResult = await secondCall;
    // The queued call returns the state captured at call time (the prior
    // build), since it does not perform a build of its own.
    expect(secondResult).toBe(state1);

    const firstResult = await firstCall;
    // The in-flight build chains directly into the queued follow-up build,
    // so its resolved value reflects the *last* build in the chain.
    expect(firstResult.generation).toBe(3);
    expect(firstResult.success).toBe(true);

    // Exactly two builds should have actually run: the initial triggered
    // build (generation 2) and the queued follow-up (generation 3).
    expect(builds.map((b) => b.generation)).toEqual([2, 3]);
    expect(coordinator.currentState?.generation).toBe(3);
  }, 60_000);
});
