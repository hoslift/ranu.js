import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { validateGraphBoundaries, type ModuleGraph } from '@ranu/build';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Suite 1: Client/Server Boundary Enforcement (client-server-boundary)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('rejects direct import of ranu/server-only in client entry', () => {
    const graph: ModuleGraph = {
      clientEntries: ['app/ClientComp.tsx'],
      nodes: new Map([
        [
          'app/ClientComp.tsx',
          {
            id: 'app/ClientComp.tsx',
            filePath: '/project/app/ClientComp.tsx',
            classification: 'client-entry',
            imports: [
              {
                specifier: 'ranu/server-only',
                resolvedPath: 'ranu/server-only',
                isExternal: false,
                isNodeBuiltin: false,
                line: 1,
                column: 1,
              },
            ],
            exports: [],
          },
        ],
      ]),
    };

    const res = validateGraphBoundaries(graph);
    expect(res.success).toBe(false);
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics[0]?.code).toBe('RANU_BUILD_SERVER_ONLY_CLIENT');
    expect(res.diagnostics[0]?.message).toContain('ranu/server-only');
  });

  it('rejects transitive import of ranu/server-only through intermediate helper with full import chain', () => {
    const graph: ModuleGraph = {
      clientEntries: ['app/Counter.tsx'],
      nodes: new Map([
        [
          'app/Counter.tsx',
          {
            id: 'app/Counter.tsx',
            filePath: '/project/app/Counter.tsx',
            classification: 'client-entry',
            imports: [
              {
                specifier: './utils.js',
                resolvedPath: '/project/app/utils.js',
                isExternal: false,
                isNodeBuiltin: false,
                line: 2,
                column: 1,
              },
            ],
            exports: [],
          },
        ],
        [
          'app/utils.js',
          {
            id: 'app/utils.js',
            filePath: '/project/app/utils.js',
            classification: 'client-reachable',
            imports: [
              {
                specifier: '../server/db.js',
                resolvedPath: '/project/server/db.js',
                isExternal: false,
                isNodeBuiltin: false,
                line: 3,
                column: 1,
              },
            ],
            exports: [],
          },
        ],
        [
          'server/db.js',
          {
            id: 'server/db.js',
            filePath: '/project/server/db.js',
            classification: 'client-reachable',
            imports: [
              {
                specifier: 'ranu/server-only',
                resolvedPath: 'ranu/server-only',
                isExternal: false,
                isNodeBuiltin: false,
                line: 1,
                column: 1,
              },
            ],
            exports: [],
          },
        ],
      ]),
    };

    const res = validateGraphBoundaries(graph);
    expect(res.success).toBe(false);
    const diag = res.diagnostics.find((d) => d.code === 'RANU_BUILD_SERVER_ONLY_CLIENT');
    expect(diag).toBeDefined();
    // Must trace the shortest import chain: Counter -> utils -> db -> ranu/server-only
    expect(diag?.message).toContain('Import chain: app/Counter.tsx -> app/utils.js -> server/db.js -> ranu/server-only');
  });

  it('rejects Node built-in module imports (fs, path, child_process) in client graph', () => {
    const graph: ModuleGraph = {
      clientEntries: ['app/ClientView.tsx'],
      nodes: new Map([
        [
          'app/ClientView.tsx',
          {
            id: 'app/ClientView.tsx',
            filePath: '/project/app/ClientView.tsx',
            classification: 'client-entry',
            imports: [
              {
                specifier: 'node:fs',
                resolvedPath: 'node:fs',
                isExternal: true,
                isNodeBuiltin: true,
                line: 1,
                column: 1,
              },
              {
                specifier: 'child_process',
                resolvedPath: 'child_process',
                isExternal: true,
                isNodeBuiltin: true,
                line: 2,
                column: 1,
              },
            ],
            exports: [],
          },
        ],
      ]),
    };

    const res = validateGraphBoundaries(graph);
    expect(res.success).toBe(false);
    const fsDiag = res.diagnostics.find((d) => d.code === 'RANU_BUILD_NODE_BUILTIN_CLIENT' && d.message.includes('node:fs'));
    const cpDiag = res.diagnostics.find((d) => d.code === 'RANU_BUILD_NODE_BUILTIN_CLIENT' && d.message.includes('child_process'));
    expect(fsDiag).toBeDefined();
    expect(cpDiag).toBeDefined();
  });

  it('Real Build Boundary Test: build fails with exit code 1 if client component imports server-only code', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
    try {
      // Modify client component Counter.tsx to import server-only module while preserving directive prologue
      const clientComponentPath = path.join(projectDir, 'app/components/Counter.tsx');
      const originalCode = fs.readFileSync(clientComponentPath, 'utf8');
      fs.writeFileSync(
        clientComponentPath,
        `"use client";\nimport 'ranu/server-only';\n${originalCode.replace(/"use client";\r?\n?/, '')}`,
        'utf8',
      );

      const res = await runCommand(process.execPath, [cliBin, 'build', '--json'], { cwd: projectDir, env: cliEnv });
      // Build must fail with non-zero exit code
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.success).toBe(false);
      const boundaryError = parsed.diagnostics.find((d: any) => d.code === 'RANU_BUILD_SERVER_ONLY_CLIENT');
      expect(boundaryError).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});
