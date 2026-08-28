import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EsbuildAdapter } from '../src/bundler/esbuild-adapter.js';
import { runServerGraphStage } from '../src/pipeline/stage-server-graph.js';
import type { BuildContext } from '../src/build-config.js';

describe('server graph component entries', () => {
  let projectRoot: string;
  let ctx: BuildContext;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-server-graph-'));
    const tempOutDir = path.join(projectRoot, '.ranu', 'temp');
    ctx = {
      config: { projectRoot },
      resolvedConfig: {
        root: projectRoot,
        mode: 'production',
        plugins: [],
        build: { sourceMaps: 'hidden', minify: false },
        server: { host: '0.0.0.0', port: 3000, trustProxy: false },
        routing: { trailingSlash: 'never' },
        rendering: { defaultMode: 'server' },
        deployment: {},
      },
      buildId: 'server-graph-test',
      projectRoot,
      outDir: path.join(projectRoot, '.ranu', 'build'),
      tempOutDir,
      serverOutDir: path.join(tempOutDir, 'server'),
      staticOutDir: path.join(tempOutDir, 'static'),
      manifestOutDir: path.join(tempOutDir, 'manifest'),
      diagnostics: [],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it.each([
    ['hidden', 'external'],
    ['external', 'external'],
    ['inline', 'inline'],
    [false, false],
  ] as const)('compiles loading and error entries with sourceMaps=%s', async (mode, expected) => {
    const loading = 'app/loading.tsx';
    const error = 'app/error.tsx';
    fs.mkdirSync(path.join(projectRoot, 'app'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, loading), 'export default function Loading() {}');
    fs.writeFileSync(path.join(projectRoot, error), 'export default function Error() {}');
    (ctx.config as any).sourceMaps = mode;
    const bundle = vi.spyOn(EsbuildAdapter.prototype, 'bundle').mockResolvedValue({
      success: true,
      errors: [],
      warnings: [],
      outputs: [],
    } as any);

    const result = await runServerGraphStage(ctx, [
      {
        routeId: 'page:/',
        kind: 'page',
        pathnameTemplate: '/',
        params: [],
        renderMode: 'server',
        methods: [],
        layouts: [],
        loading,
        errors: [error, 'app/missing-error.tsx'],
        outputRelativePath: 'server/routes/page-root.mjs',
      },
    ] as any);

    expect(result.success).toBe(true);
    const options = bundle.mock.calls[0][0];
    expect(options.sourcemap).toBe(expected);
    expect(Object.keys(options.entryPoints)).toHaveLength(2);
    expect(Object.keys(options.entryPoints)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^layouts\//),
        expect.stringMatching(/^layouts\//),
      ]),
    );
  });
});
