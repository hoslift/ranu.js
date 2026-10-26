import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import {
  validateClientSourceEnv,
  buildModuleGraph,
  validateGraphEnvAccess,
} from '@ranu/build';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

function runCli(args: string[], cwd: string) {
  return runCommand(process.execPath, [cliBin, ...args], { cwd, env: cliEnv });
}

describe('Empirical Challenger M2.2 Stress Harness: Client/Server Boundaries & CLI Integration', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  // =========================================================================
  // Dimension 1: Complex AST Destructuring & Aliasing Attacks in Client Code
  // =========================================================================
  describe('Dimension 1: Complex AST Destructuring & Aliasing Attacks', () => {
    it('catches nested destructuring with binary concatenation: const { ["e" + "nv"]: { SECRET } } = process', () => {
      const code = `
        "use client";
        export function Leak() {
          const { ['e' + 'nv']: { SECRET } } = process as any;
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak1.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches nested destructuring with template literal: const { [`${"env"}`]: { SECRET } } = process', () => {
      const code = `
        "use client";
        export function Leak() {
          const { [\`\${'env'}\`]: { SECRET } } = process as any;
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak2.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches nested destructuring with inner computed property: const { env: { ["SECRET"]: s } } = process', () => {
      const code = `
        "use client";
        export function Leak() {
          const { env: { ['SECRET']: s } } = process as any;
          return <div>{s}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak3.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches nested destructuring with inner binary concatenation: const { env: { ["SEC" + "RET"]: s } } = process', () => {
      const code = `
        "use client";
        export function Leak() {
          const { env: { ['SEC' + 'RET']: s } } = process as any;
          return <div>{s}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak4.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('catches nested destructuring with dynamic computed property: const { env: { [dynamicKey]: s } } = process', () => {
      const code = `
        "use client";
        export function Leak(dynamicKey: string) {
          const { env: { [dynamicKey]: s } } = process as any;
          return <div>{s}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak5.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('Computed property destructuring'))).toBe(true);
    });

    it('catches arrow function parameter destructuring with default: const fn = ({ env: { SECRET } } = process) => SECRET', () => {
      const code = `
        "use client";
        export const fn = ({ env: { SECRET } } = process as any) => SECRET;
      `;
      const diags = validateClientSourceEnv('app/Leak6.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches function parameter destructuring with default: function f({ env: { SECRET } } = process) { return SECRET; }', () => {
      const code = `
        "use client";
        export function f({ env: { SECRET } } = process as any) {
          return SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak7.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches array destructuring with multiple elements and gaps: const [a, b, p] = [1, 2, process]; p.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const [a, b, p] = [1, 2, process];
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak8.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches array destructuring with holes: const [, , p] = [, , process]; p.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const [, , p] = [, , process];
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak9.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches array destructuring in function parameter: function f([p] = [process]) { return p.env.SECRET; }', () => {
      const code = `
        "use client";
        export function f([p] = [process]) {
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak10.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches variable assignment array destructuring: let p; [p] = [process]; p.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          let p: any;
          [p] = [process];
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak11.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches multi-hop alias chain: const p1 = process; const p2 = p1; const p3 = p2; const e1 = p3.env; const e2 = e1; e2.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const p1 = process;
          const p2 = p1;
          const p3 = p2;
          const e1 = p3.env;
          const e2 = e1;
          return e2.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak12.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches destructuring from process alias: const p = process; const { env } = p; env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const p = process;
          const { env } = p;
          return env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak13.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches destructuring from env alias: const e = process.env; const { SECRET } = e', () => {
      const code = `
        "use client";
        export function Leak() {
          const e = process.env;
          const { SECRET } = e;
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak14.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches aliasing via globalThis and window: const p = globalThis.process; p.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const p = (globalThis as any).process;
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak15.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches aliasing via window: const p = window.process; p.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          const p = (window as any).process;
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak16.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches full env object return or container embedding: return process.env', () => {
      const code = `
        "use client";
        export function getEnv() {
          return process.env;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak17.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('full "process.env" object reference'))).toBe(true);
    });

    it('catches full env object inside array literal: const arr = [process.env]', () => {
      const code = `
        "use client";
        export function Leak() {
          const arr = [process.env];
          return arr;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak18.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('full "process.env" object reference'))).toBe(true);
    });

    it('catches import.meta nested computed destructuring with binary concatenation: const { ["e" + "nv"]: { PRIVATE_KEY } } = import.meta', () => {
      const code = `
        "use client";
        export function Leak() {
          const { ['e' + 'nv']: { PRIVATE_KEY } } = import.meta as any;
          return <div>{PRIVATE_KEY}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak19.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('PRIVATE_KEY'))).toBe(true);
    });

    it('catches import.meta nested computed destructuring with template literal: const { [`${"env"}`]: { PRIVATE_KEY } } = import.meta', () => {
      const code = `
        "use client";
        export function Leak() {
          const { [\`\${'env'}\`]: { PRIVATE_KEY } } = import.meta as any;
          return <div>{PRIVATE_KEY}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak20.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('PRIVATE_KEY'))).toBe(true);
    });

    it('catches import.meta computed alias and access: const { ["env"]: mEnv } = import.meta; mEnv.PRIVATE_KEY', () => {
      const code = `
        "use client";
        export function Leak() {
          const { ['env']: mEnv } = import.meta as any;
          return <div>{mEnv.PRIVATE_KEY}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak21.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && (d.message.includes('PRIVATE_KEY') || d.message.includes('mEnv')))).toBe(true);
    });

    it('catches import.meta dynamic bracket access on alias: const { ["env"]: mEnv } = import.meta; mEnv[key]', () => {
      const code = `
        "use client";
        export function Leak(key: string) {
          const { ['env']: mEnv } = import.meta as any;
          return <div>{mEnv[key]}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak22.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && (d.message.includes('Dynamic bracket-notation') || d.message.includes('mEnv')))).toBe(true);
    });

    it('catches destructuring assignment with computed "env": ({ ["e" + "nv"]: { SECRET } } = process)', () => {
      const code = `
        "use client";
        export function Leak() {
          let SECRET: string;
          ({ ['e' + 'nv']: { SECRET } } = process as any);
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak23.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches function parameter computed destructuring: function f({ ["e" + "nv"]: { SECRET } } = process)', () => {
      const code = `
        "use client";
        export function Leak({ ['e' + 'nv']: { SECRET } } = process as any) {
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak24.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches object spread of env aliases: const p = process; const wrapped = { ...p.env }', () => {
      const code = `
        "use client";
        export function Leak() {
          const p = process;
          const wrapped = { ...p.env };
          return wrapped;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak25.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('catches logical assignment expressions: s ??= process.env.SECRET', () => {
      const code = `
        "use client";
        export function Leak() {
          let s: any;
          s ??= process.env.DATABASE_SECRET;
          return s;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak26.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('DATABASE_SECRET'))).toBe(true);
    });

    it('catches default value in object destructuring: const { key = process.env.SECRET } = {}', () => {
      const code = `
        "use client";
        export function Leak() {
          const { key = process.env.API_SECRET } = {} as any;
          return key;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak27.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('API_SECRET'))).toBe(true);
    });

    it('catches default value in object destructuring with import.meta: const { key = import.meta.env.SECRET } = {}', () => {
      const code = `
        "use client";
        export function Leak() {
          const { key = import.meta.env.META_SECRET } = {} as any;
          return key;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak28.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('META_SECRET'))).toBe(true);
    });

    it('catches element access with concatenation on process: (process as any)["en" + "v"]["SECRET"]', () => {
      const code = `
        "use client";
        export function Leak() {
          const s = (process as any)['en' + 'v']['DYNAMIC_SECRET'];
          return s;
        }
      `;
      const diags = validateClientSourceEnv('app/Leak29.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });
  });

  // =========================================================================
  // Dimension 2: False Positive Immunity & Server Component Non-Flagging
  // =========================================================================
  describe('Dimension 2: False Positive Immunity & Server Component Non-Flagging', () => {
    it('does not flag user-defined objects with process or env properties', () => {
      const code = `
        "use client";
        export function SafeUserObject() {
          const config = {
            process: {
              env: {
                SECRET: 'user-defined-safe-value',
              },
            },
          };
          const val = config.process.env.SECRET;
          return <div>{val}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeUserObject.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('does not flag custom class with env method', () => {
      const code = `
        "use client";
        class MyWorkflow {
          process() {
            return { env: { SECRET: 'safe' } };
          }
        }
        export function SafeClass() {
          const w = new MyWorkflow();
          return <div>{w.process().env.SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeClass.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('module graph classifies server components as non-client and validateGraphEnvAccess does NOT inspect them', () => {
      const tmpDir = path.join(root, 'node_modules/.cache/test-boundary-check');
      fs.mkdirSync(tmpDir, { recursive: true });
      const serverFile = path.join(tmpDir, 'ServerPage.tsx');
      fs.writeFileSync(
        serverFile,
        `
        import React from 'react';
        export default function ServerPage() {
          const dbSecret = process.env.DATABASE_SUPER_SECRET;
          const { API_KEY } = process.env;
          const redis = process['env']['REDIS_URL'];
          return <div>Server Page: {dbSecret} {API_KEY} {redis}</div>;
        }
        `,
        'utf8'
      );

      const graph = buildModuleGraph([serverFile], tmpDir);
      const relId = path.relative(tmpDir, serverFile).replace(/\\/g, '/');
      const node = graph.nodes.get(relId);
      expect(node).toBeDefined();
      expect(node?.classification).toBe('server-reachable');

      const envResult = validateGraphEnvAccess(graph);
      expect(envResult.success).toBe(true);
      expect(envResult.diagnostics).toHaveLength(0);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  // =========================================================================
  // Dimension 3: Whitelist Verification (RANU_PUBLIC_* and NODE_ENV)
  // =========================================================================
  describe('Dimension 3: Whitelist Verification', () => {
    it('permits all whitelisted syntax variations without diagnostics', () => {
      const code = `
        "use client";
        export function WhitelistExhaustive() {
          // Standard access
          const p1 = process.env.RANU_PUBLIC_API;
          const p2 = process.env.NODE_ENV;
          const m1 = import.meta.env.RANU_PUBLIC_API;
          const m2 = import.meta.env.NODE_ENV;

          // Bracket notation
          const b1 = process['env']['RANU_PUBLIC_API'];
          const b2 = process['env']['NODE_ENV'];
          const b3 = import.meta['env']['RANU_PUBLIC_API'];
          const b4 = import.meta['env']['NODE_ENV'];

          // Mixed dot and bracket
          const mb1 = process['env'].RANU_PUBLIC_PORT;
          const mb2 = process.env['RANU_PUBLIC_PORT'];

          // Destructuring
          const { RANU_PUBLIC_API, NODE_ENV } = process.env;
          const { ['RANU_PUBLIC_API']: renamedApi } = process.env;
          const { ['NODE_ENV']: mode } = process.env;

          // Nested destructuring from process
          const { env: { RANU_PUBLIC_HOST } } = process;
          const { ['env']: { RANU_PUBLIC_TOKEN } } = process;
          const { ['e' + 'nv']: { RANU_PUBLIC_VERSION } } = process;
          const { [\`\${'env'}\`]: { RANU_PUBLIC_BUILD } } = process;

          // Env alias with public access
          const { ['env']: myEnv } = process;
          const pubFromAlias = myEnv.RANU_PUBLIC_SITE;

          return <div>{p1} {p2} {m1} {m2} {b1} {b2} {b3} {b4} {mb1} {mb2} {RANU_PUBLIC_API} {renamedApi} {mode} {RANU_PUBLIC_HOST} {RANU_PUBLIC_TOKEN} {RANU_PUBLIC_VERSION} {RANU_PUBLIC_BUILD} {pubFromAlias}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/WhitelistExhaustive.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });

  // =========================================================================
  // Dimension 4: End-to-End CLI Integration with `ranu check`
  // =========================================================================
  describe('Dimension 4: End-to-End CLI Integration with ranu check', () => {
    it('ranu check succeeds (exit 0) when client code uses only public env and server code uses private secrets', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        // Safe Client Component
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          clientFile,
          `
          "use client";
          import React from 'react';
          export function Counter() {
            const api = process.env.RANU_PUBLIC_API_URL;
            const mode = process.env.NODE_ENV;
            return <div>{api} ({mode})</div>;
          }
          `,
          'utf8'
        );

        // Server page accessing private secrets
        const pageFile = path.join(projectDir, 'app/page.tsx');
        fs.writeFileSync(
          pageFile,
          `
          import React from 'react';
          import { Counter } from './components/Counter.js';
          export default function Page() {
            const secret = process.env.SUPER_SECRET_DATABASE_URL;
            return (
              <main>
                <h1>Server Page</h1>
                <p>Secret configured: {Boolean(secret) ? "yes" : "no"}</p>
                <Counter />
              </main>
            );
          }
          `,
          'utf8'
        );

        // API route accessing private secrets
        const apiDir = path.join(projectDir, 'app/api');
        fs.mkdirSync(apiDir, { recursive: true });
        const apiFile = path.join(apiDir, 'auth.ts');
        fs.writeFileSync(
          apiFile,
          `
          export async function POST(req: Request) {
            const jwt = process.env.JWT_SECRET;
            return new Response(JSON.stringify({ ok: true, hasJwt: Boolean(jwt) }), {
              headers: { 'Content-Type': 'application/json' },
            });
          }
          `,
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(0);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(true);
        expect(report.summary.errors).toBe(0);
      } finally {
        await cleanup();
      }
    });

    it('ranu check fails (exit 1) with exact error and remediation hint when client component accesses private secret', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          clientFile,
          `
          "use client";
          import React from 'react';
          export function Counter() {
            const secret = process.env.ADVERSARIAL_LEAKED_SECRET;
            return <div>{secret}</div>;
          }
          `,
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(1);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(false);
        expect(report.summary.errors).toBeGreaterThanOrEqual(1);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.severity).toBe('error');
        expect(diag.message).toContain('ADVERSARIAL_LEAKED_SECRET');
        expect(diag.location.file).toContain('Counter.tsx');
        expect(diag.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });
  });
});
