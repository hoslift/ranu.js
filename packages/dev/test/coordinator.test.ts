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
  });

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
    expect(state1.success, JSON.stringify(state1.diagnostics, null, 2)).toBe(true);
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
  }, 60_000);

  it('handles build error without crashing and preserves last-good state', async () => {
    const coordinator = new RebuildCoordinator({
      options: {
        projectRoot: tempDir,
      },
      onBuildComplete: () => {},
    });

    const state1 = await coordinator.triggerRebuild('initial');
    expect(state1.success, JSON.stringify(state1.diagnostics, null, 2)).toBe(true);

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
});
