import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runClientGraphStage } from '../src/pipeline/stage-client-graph.js';
import { buildModuleGraph } from '../src/graph/module-classifier.js';
import type { BuildContext } from '../src/build-config.js';

describe('Stage 11 & Stage 13B: Client Graph & Bootstrap Asset Bundling', () => {
  let tempDir: string;
  let tempOutDir: string;
  let staticOutDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-client-stage-test-'));
    tempOutDir = path.join(tempDir, '.ranu', '.build_temp_123');
    staticOutDir = path.join(tempOutDir, 'static');

    fs.mkdirSync(staticOutDir, { recursive: true });
    fs.mkdirSync(path.join(tempOutDir, 'manifest'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('bundles client entries and emits the browser bootstrap asset', async () => {
    const appDir = path.join(tempDir, 'app');
    const compDir = path.join(appDir, 'components');
    fs.mkdirSync(compDir, { recursive: true });

    const counterFile = path.join(compDir, 'Counter.tsx');
    fs.writeFileSync(
      counterFile,
      `"use client";
import React, { useState } from 'react';
export function Counter() {
  const [c, setC] = useState(0);
  return <button onClick={() => setC(c + 1)}>{c}</button>;
}`
    );

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(
      pageFile,
      `import { Counter } from './components/Counter.js';
export default function Page() {
  return <Counter />;
}`
    );

    const graph = buildModuleGraph([pageFile], tempDir);

    const ctx: BuildContext = {
      config: { projectRoot: tempDir },
      resolvedConfig: {
        root: tempDir,
        mode: 'production',
        plugins: [],
        build: { sourceMaps: false, minify: false },
        server: { host: '0.0.0.0', port: 3000, trustProxy: false },
        routing: { trailingSlash: 'never' },
        rendering: { defaultMode: 'server' },
        deployment: {},
      },
      buildId: 'test_build_stage13b_asset',
      projectRoot: tempDir,
      outDir: path.join(tempDir, '.ranu', 'build'),
      tempOutDir,
      serverOutDir: path.join(tempOutDir, 'server'),
      staticOutDir,
      manifestOutDir: path.join(tempOutDir, 'manifest'),
      diagnostics: [],
    };

    const result = await runClientGraphStage(ctx, graph);

    expect(result.success).toBe(true);
    expect(result.diagnostics.length).toBe(0);

    // Verify bootstrap asset is recorded in assets
    expect(result.assets['bootstrap']).toBeDefined();
    expect(result.assets['bootstrap']?.js.length).toBeGreaterThan(0);
    expect(result.assets['bootstrap']?.js[0]).toMatch(/^\/_ranu\/assets\/c_bootstrap-/);

    // Verify counter asset is recorded
    expect(result.assets['app/components/Counter.tsx']).toBeDefined();
    expect(result.assets['app/components/Counter.tsx']?.js[0]).toMatch(/^\/_ranu\/assets\/c_components-Counter-/);

    // Verify physical file was emitted into static/assets
    const staticAssetsDir = path.join(staticOutDir, 'assets');
    expect(fs.existsSync(staticAssetsDir)).toBe(true);

    const emittedFiles = fs.readdirSync(staticAssetsDir);
    const bootstrapFile = emittedFiles.find(f => f.startsWith('c_bootstrap-') && f.endsWith('.js'));
    expect(bootstrapFile).toBeDefined();

    // Verify bootstrap bundle contains the baked build ID
    const bootstrapContent = fs.readFileSync(path.join(staticAssetsDir, bootstrapFile!), 'utf8');
    expect(bootstrapContent).toContain('test_build_stage13b_asset');
  });
});
