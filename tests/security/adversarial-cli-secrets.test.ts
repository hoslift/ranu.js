import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
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

describe('Adversarial Challenge M2.2: CLI Commands & Boundary Builds with Private Secrets', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  // --------------------------------------------------------------------------
  // 1. "use client" Components with Private Secrets -> Fatal Abort
  // --------------------------------------------------------------------------
  describe('1. "use client" components with private secrets', () => {
    it('ranu check fatally aborts on process.env.SECRET in client component with exact coords and hints', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        // Place secret access at line 7
        const code = [
          '"use client";',
          '',
          "import React from 'react';",
          '',
          'export function Counter() {',
          '  const publicTitle = process.env.RANU_PUBLIC_SITE_NAME;',
          '  const secretKey = process.env.STRIPE_SECRET_KEY;', // Line 7
          '  return <div>{publicTitle}: {secretKey}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(clientFile, code, 'utf8');

        // Text format check
        const textRes = await runCli(['check'], projectDir);
        expect(textRes.code).toBe(1);
        expect(textRes.stderr + textRes.stdout).toContain('Check failed with');
        expect(textRes.stderr + textRes.stdout).toContain('RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(textRes.stderr + textRes.stdout).toContain('STRIPE_SECRET_KEY');
        expect(textRes.stderr + textRes.stdout).toContain('Counter.tsx:7:21');
        expect(textRes.stderr + textRes.stdout).toContain('hint:');
        expect(textRes.stderr + textRes.stdout).toContain('RANU_PUBLIC_');

        // JSON format check
        const jsonRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(jsonRes.code).toBe(1);
        const report = JSON.parse(jsonRes.stdout);
        expect(report.success).toBe(false);
        expect(report.summary.errors).toBeGreaterThanOrEqual(1);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.severity).toBe('error');
        expect(diag.message).toContain('STRIPE_SECRET_KEY');
        expect(diag.location.file).toContain('Counter.tsx');
        expect(diag.location.line).toBe(7);
        expect(diag.location.column).toBe(21);
        expect(diag.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });

    it('ranu check fatally aborts on bracket notation process["env"]["SECRET"] in client component', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        const code = [
          '"use client";',
          '',
          "import React from 'react';",
          '',
          'export function Counter() {',
          "  const secret = process['env']['AWS_SECRET_ACCESS_KEY'];", // Line 6, column 18
          '  return <div>{secret}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(clientFile, code, 'utf8');

        const jsonRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(jsonRes.code).toBe(1);
        const report = JSON.parse(jsonRes.stdout);
        expect(report.success).toBe(false);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.message).toContain('AWS_SECRET_ACCESS_KEY');
        expect(diag.location.line).toBe(6);
        expect(diag.location.column).toBe(18);
        expect(diag.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });

    it('ranu check fatally aborts on import.meta.env.SECRET in client component', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        const code = [
          '"use client";',
          '',
          "import React from 'react';",
          '',
          'export function Counter() {',
          '  const key = import.meta.env.SECRET_TOKEN;', // Line 6, column 15
          '  return <div>{key}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(clientFile, code, 'utf8');

        const jsonRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(jsonRes.code).toBe(1);
        const report = JSON.parse(jsonRes.stdout);
        expect(report.success).toBe(false);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.message).toContain('SECRET_TOKEN');
        expect(diag.location.line).toBe(6);
        expect(diag.location.column).toBe(15);
        expect(diag.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });

    it('ranu check fatally aborts on destructured secrets and dynamic brackets in client component', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        const code = [
          '"use client";',
          '',
          "import React from 'react';",
          '',
          'const dynamicKey = "API_KEY";',
          'export function Counter() {',
          '  const { DB_PASS } = process.env;', // Line 7, column 11
          '  const dynamicVal = process.env[dynamicKey];', // Line 8, column 22
          '  return <div>{DB_PASS} {dynamicVal}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(clientFile, code, 'utf8');

        const jsonRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(jsonRes.code).toBe(1);
        const report = JSON.parse(jsonRes.stdout);
        expect(report.success).toBe(false);

        const destDiag = report.diagnostics.find((d: any) => d.message.includes('DB_PASS'));
        expect(destDiag).toBeDefined();
        expect(destDiag.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(destDiag.location.line).toBe(7);
        expect(destDiag.location.column).toBe(11);

        const dynDiag = report.diagnostics.find((d: any) => d.message.includes('Dynamic bracket-notation'));
        expect(dynDiag).toBeDefined();
        expect(dynDiag.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(dynDiag.location.line).toBe(8);
        expect(dynDiag.location.column).toBe(22);
      } finally {
        await cleanup();
      }
    });

    it('ranu build fatally aborts on client component private secret access with --json and formatted logs', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const clientFile = path.join(projectDir, 'app/components/Counter.tsx');
        const code = [
          '"use client";',
          "import React from 'react';",
          'export function Counter() {',
          '  const secret = process.env.SECRET_PRIVATE_API_KEY;',
          '  return <div>{secret}</div>;',
          '}',
        ].join('\n');
        fs.writeFileSync(clientFile, code, 'utf8');

        // Formatted build output
        const buildRes = await runCli(['build'], projectDir);
        expect(buildRes.code).toBe(1);
        expect(buildRes.stderr + buildRes.stdout).toContain('Production build failed');
        expect(buildRes.stderr + buildRes.stdout).toContain('RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(buildRes.stderr + buildRes.stdout).toContain('SECRET_PRIVATE_API_KEY');

        // JSON build output
        const jsonBuildRes = await runCli(['build', '--json'], projectDir);
        expect(jsonBuildRes.code).toBe(1);
        const parsed = JSON.parse(jsonBuildRes.stdout);
        expect(parsed.success).toBe(false);
        const envErr = parsed.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(envErr).toBeDefined();
        expect(envErr.location.line).toBe(4);
        expect(envErr.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. render = 'client' Pages with Private Secrets -> Fatal Abort
  // --------------------------------------------------------------------------
  describe("2. render = 'client' pages with private secrets", () => {
    it("ranu check fatally aborts when page has render = 'client' and accesses private secret", async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const pageFile = path.join(projectDir, 'app/page.tsx');
        const code = [
          "import React from 'react';",
          '',
          "export const render = 'client';", // Line 3
          '',
          'export default function ClientOnlyPage() {',
          '  const secret = process.env.CLIENT_PAGE_SECRET;', // Line 6, column 18
          '  return <div>Client Page: {secret}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(pageFile, code, 'utf8');

        // Formatted check
        const textRes = await runCli(['check'], projectDir);
        expect(textRes.code).toBe(1);
        expect(textRes.stderr + textRes.stdout).toContain('RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(textRes.stderr + textRes.stdout).toContain('CLIENT_PAGE_SECRET');
        expect(textRes.stderr + textRes.stdout).toContain('page.tsx:6:18');

        // JSON check
        const jsonRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(jsonRes.code).toBe(1);
        const report = JSON.parse(jsonRes.stdout);
        expect(report.success).toBe(false);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.location.file).toContain('page.tsx');
        expect(diag.location.line).toBe(6);
        expect(diag.location.column).toBe(18);
        expect(diag.hint).toContain('RANU_PUBLIC_');
      } finally {
        await cleanup();
      }
    });

    it("ranu build fatally aborts when page has render = 'client' and accesses bracket secret", async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const pageFile = path.join(projectDir, 'app/page.tsx');
        const code = [
          "import React from 'react';",
          '',
          "export const render = 'client';",
          '',
          'export default function ClientOnlyPage() {',
          "  const secret = process['env']['CLIENT_PAGE_SECRET'];", // Line 6, column 18
          '  return <div>Client Page: {secret}</div>;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(pageFile, code, 'utf8');

        const buildRes = await runCli(['build', '--json'], projectDir);
        expect(buildRes.code).toBe(1);
        const parsed = JSON.parse(buildRes.stdout);
        expect(parsed.success).toBe(false);
        const envErr = parsed.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(envErr).toBeDefined();
        expect(envErr.message).toContain('CLIENT_PAGE_SECRET');
        expect(envErr.location.line).toBe(6);
      } finally {
        await cleanup();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Server-Only Code Access to Private Secrets -> Zero False Positives
  // --------------------------------------------------------------------------
  describe('3. Server-only components & routes access private env without false positives', () => {
    it('allows server code in server/ to access private secrets across all notations', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        // server/db.ts uses various private secret notations
        const serverDb = path.join(projectDir, 'server/db.ts');
        fs.writeFileSync(
          serverDb,
          [
            "import 'ranu/server-only';",
            'export const serverSecrets = {',
            '  dbUrl: process.env.DATABASE_URL,',
            "  stripeKey: process['env']['STRIPE_SECRET_KEY'],",
            '  metaSecret: import.meta.env.SYSTEM_MASTER_KEY,',
            '  destructured: (() => {',
            '    const { ADMIN_SECRET } = process.env;',
            '    return ADMIN_SECRET;',
            '  })(),',
            '};',
          ].join('\n'),
          'utf8'
        );

        // Ensure Counter only accesses public env
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'export function Counter() {',
            '  const site = process.env.RANU_PUBLIC_SITE_NAME;',
            '  return <div>{site}</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        // Server page imports and uses server secrets
        const pageFile = path.join(projectDir, 'app/page.tsx');
        fs.writeFileSync(
          pageFile,
          [
            "import React from 'react';",
            "import { Counter } from './components/Counter.js';",
            "import { serverSecrets } from '../server/db.js';",
            'export default function Page() {',
            '  return (',
            '    <main>',
            '      <h1>Server Page</h1>',
            '      <p>DB: {serverSecrets.dbUrl ? "configured" : "none"}</p>',
            '      <Counter />',
            '    </main>',
            '  );',
            '}',
          ].join('\n'),
          'utf8'
        );

        // ranu check must pass cleanly
        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(0);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(true);
        expect(report.summary.errors).toBe(0);

        // ranu build must pass cleanly
        const buildRes = await runCli(['build', '--json'], projectDir);
        expect(buildRes.code).toBe(0);
        const parsed = JSON.parse(buildRes.stdout);
        expect(parsed.success).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it('allows API routes in app/api/* to access private secrets without false positives', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const apiDir = path.join(projectDir, 'app/api');
        fs.mkdirSync(apiDir, { recursive: true });

        // app/api/auth.ts accesses private secrets freely
        const authApi = path.join(apiDir, 'auth.ts');
        fs.writeFileSync(
          authApi,
          [
            'export async function POST(req: Request) {',
            '  const jwtSecret = process.env.JWT_SIGNING_SECRET;',
            "  const apiKey = process['env']['API_SERVICE_KEY'];",
            '  const { REFRESH_SECRET } = process.env;',
            '  const metaKey = import.meta.env.SERVER_INTERNAL_KEY;',
            '  return new Response(JSON.stringify({ ok: true, active: Boolean(jwtSecret && apiKey && REFRESH_SECRET && metaKey) }), {',
            "    headers: { 'Content-Type': 'application/json' },",
            '  });',
            '}',
          ].join('\n'),
          'utf8'
        );

        // Ensure client Counter uses only public env
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'export function Counter() {',
            '  const title = process.env.RANU_PUBLIC_SITE_NAME;',
            '  return <div>{title}</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(0);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(true);
        expect(report.summary.errors).toBe(0);

        const buildRes = await runCli(['build', '--json'], projectDir);
        expect(buildRes.code).toBe(0);
        const parsed = JSON.parse(buildRes.stdout);
        expect(parsed.success).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it('allows server pages (default server render mode) to access private secrets directly in server JSX/data', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        // Server page accessing private secrets directly
        const pageFile = path.join(projectDir, 'app/page.tsx');
        fs.writeFileSync(
          pageFile,
          [
            "import React from 'react';",
            "import { Counter } from './components/Counter.js';",
            'export default function ServerPage() {',
            '  const serverDbPass = process.env.SERVER_DB_PASS;',
            "  const serverRedisUrl = process['env']['REDIS_URL'];",
            '  const { ENCRYPTION_KEY } = process.env;',
            '  return (',
            '    <main>',
            '      <h1>Server Rendered Page</h1>',
            '      <p>Configured: {Boolean(serverDbPass && serverRedisUrl && ENCRYPTION_KEY) ? "yes" : "no"}</p>',
            '      <Counter />',
            '    </main>',
            '  );',
            '}',
          ].join('\n'),
          'utf8'
        );

        // Ensure Counter only accesses public env
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'export function Counter() {',
            '  return <div>Counter Widget</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(0);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(true);
        expect(report.summary.errors).toBe(0);

        const buildRes = await runCli(['build', '--json'], projectDir);
        expect(buildRes.code).toBe(0);
        const parsed = JSON.parse(buildRes.stdout);
        expect(parsed.success).toBe(true);
      } finally {
        await cleanup();
      }
    });
  });

  // --------------------------------------------------------------------------
  // 4. Advanced Adversarial Stress Vectors: Transitive Leaks & Edge Cases
  // --------------------------------------------------------------------------
  describe('4. Advanced adversarial vectors: transitive client leaks, shared modules, and object spreads', () => {
    it('catches transitive private secret leak in module imported by client component without directive', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        // app/utils/deep-client.ts has NO "use client", but is imported by Counter.tsx
        const deepHelper = path.join(projectDir, 'app/utils/deep-client.ts');
        fs.writeFileSync(
          deepHelper,
          [
            'export function getApiKey() {',
            '  return process.env.TRANSITIVE_PRIVATE_SECRET;', // Line 2, column 22
            '}',
          ].join('\n'),
          'utf8'
        );

        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            "import { getApiKey } from '../utils/deep-client.js';",
            'export function Counter() {',
            '  return <div>Key: {getApiKey()}</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(1);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(false);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.location.file).toContain('deep-client.ts');
        expect(diag.location.line).toBe(2);
        expect(diag.location.column).toBe(10);
        expect(diag.message).toContain('TRANSITIVE_PRIVATE_SECRET');
      } finally {
        await cleanup();
      }
    });

    it('catches private secret leak in shared module imported by both server page and client component', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        // app/utils/shared-config.ts is imported by both Server Page and Client Counter
        const sharedUtil = path.join(projectDir, 'app/utils/shared-config.ts');
        fs.writeFileSync(
          sharedUtil,
          [
            'export const sharedConfig = {',
            '  publicName: process.env.RANU_PUBLIC_SITE_NAME,',
            '  internalSecret: process.env.SHARED_INTERNAL_SECRET,', // Line 3, column 19
            '};',
          ].join('\n'),
          'utf8'
        );

        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            "import { sharedConfig } from '../utils/shared-config.js';",
            'export function Counter() {',
            '  return <div>{sharedConfig.publicName}</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const pageFile = path.join(projectDir, 'app/page.tsx');
        fs.writeFileSync(
          pageFile,
          [
            "import React from 'react';",
            "import { Counter } from './components/Counter.js';",
            "import { sharedConfig } from './utils/shared-config.js';",
            'export default function Page() {',
            '  return <main><Counter /> Server: {sharedConfig.publicName}</main>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(1);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(false);

        const diag = report.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diag).toBeDefined();
        expect(diag.location.file).toContain('shared-config.ts');
        expect(diag.location.line).toBe(3);
        expect(diag.location.column).toBe(19);
        expect(diag.message).toContain('SHARED_INTERNAL_SECRET');
      } finally {
        await cleanup();
      }
    });

    it('catches full object references and spreads on process.env and import.meta.env', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'export function Counter() {',
            '  console.log(process.env);', // Line 4, column 15
            '  const metaEnvCopy = { ...import.meta.env };', // Line 5, column 28
            '  return <div>Check console</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(1);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(false);

        const diags = report.diagnostics.filter((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
        expect(diags.length).toBeGreaterThanOrEqual(2);
        expect(diags.some((d: any) => d.message.includes('full "process.env" object reference'))).toBe(true);
        expect(diags.some((d: any) => d.message.includes('full "import.meta.env" object reference'))).toBe(true);
      } finally {
        await cleanup();
      }
    });

    it('catches template literal bracket notation both static and dynamic substitutions', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'const suffix = "KEY";',
            'export function Counter() {',
            '  const staticSecret = process[`env`][`SECRET_TOKEN`];', // Line 5
            '  const dynamicSecret = process[`env`][`DYNAMIC_${suffix}`];', // Line 6
            '  return <div>{staticSecret} {dynamicSecret}</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(1);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(false);

        const staticDiag = report.diagnostics.find((d: any) => d.message.includes('SECRET_TOKEN'));
        expect(staticDiag).toBeDefined();
        expect(staticDiag.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');

        const dynDiag = report.diagnostics.find((d: any) => d.message.includes('Dynamic bracket-notation'));
        expect(dynDiag).toBeDefined();
        expect(dynDiag.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      } finally {
        await cleanup();
      }
    });

    it('allows static pages (render = "static") to access build-time private environment variables', async () => {
      const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
      try {
        const pageFile = path.join(projectDir, 'app/page.tsx');
        fs.writeFileSync(
          pageFile,
          [
            "import React from 'react';",
            "import { Counter } from './components/Counter.js';",
            "export const render = 'static';",
            'export default function StaticPage() {',
            '  const ssgBuildSecret = process.env.SSG_BUILD_SECRET;',
            '  return <main><h1>Static Page: {ssgBuildSecret ? "loaded" : "none"}</h1><Counter /></main>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        // Ensure Counter only accesses public env
        const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
        fs.writeFileSync(
          counterFile,
          [
            '"use client";',
            "import React from 'react';",
            'export function Counter() {',
            '  return <div>Static Page Counter</div>;',
            '}',
          ].join('\n'),
          'utf8'
        );

        const checkRes = await runCli(['check', '--format', 'json'], projectDir);
        expect(checkRes.code).toBe(0);
        const report = JSON.parse(checkRes.stdout);
        expect(report.success).toBe(true);
        expect(report.summary.errors).toBe(0);

        const buildRes = await runCli(['build', '--json'], projectDir);
        expect(buildRes.code).toBe(0);
        const parsed = JSON.parse(buildRes.stdout);
        expect(parsed.success).toBe(true);
      } finally {
        await cleanup();
      }
    });
  });
});

