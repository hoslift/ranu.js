import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { validateClientSourceEnv } from '@ranu/build';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { scanDirectoryForSecrets } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Suites 2 & 13: Secret Leakage & Deployment Separation (secret-leakage & deployment-secret-separation)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('AST Env Validation: allows RANU_PUBLIC_* and NODE_ENV, rejects private env access in client code', () => {
    const validClientCode = `
      "use client";
      export function Header() {
        const title = process.env.RANU_PUBLIC_SITE_TITLE;
        const mode = process.env.NODE_ENV;
        return <h1>{title} ({mode})</h1>;
      }
    `;
    const diags = validateClientSourceEnv('/project/app/Header.tsx', validClientCode);
    expect(diags.length).toBe(0);

    const invalidClientCode = `
      "use client";
      export function Profile() {
        const dbUrl = process.env.DATABASE_URL;
        return <div>{dbUrl}</div>;
      }
    `;
    const invalidDiags = validateClientSourceEnv('/project/app/Profile.tsx', invalidClientCode);
    expect(invalidDiags.length).toBe(1);
    expect(invalidDiags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(invalidDiags[0]?.message).toContain('DATABASE_URL');
  });

  it('AST Env Validation: rejects indexed private env access process.env["SECRET"] in client code', () => {
    const indexedAccessCode = `
      "use client";
      const key = process.env['AWS_SECRET_ACCESS_KEY'];
    `;
    const diags = validateClientSourceEnv('/project/app/Secret.tsx', indexedAccessCode);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(diags[0]?.message).toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('Seeded Secret Scan: builds app with private server secrets and verifies client output is 100% clean', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
    const privateSecret = 'RANU_TEST_PRIVATE_SECRET_9f3c8a1b2d';
    const privateDatabaseToken = 'RANU_TEST_PRIVATE_SECRET_77aa88bb99';

    // Seed private secrets in project .env and server file
    fs.writeFileSync(
      path.join(projectDir, '.env'),
      `PRIVATE_SERVER_SECRET=${privateSecret}\nPRIVATE_DB_TOKEN=${privateDatabaseToken}\nRANU_PUBLIC_SITE_NAME=SafeRanuApp\n`,
      'utf8',
    );

    // Create a server-only module that consumes the seeded secret
    fs.writeFileSync(
      path.join(projectDir, 'app/utils/server-data.ts'),
      `import 'ranu/server-only';\nexport const serverSecretToken = "${privateDatabaseToken}";\n`,
      'utf8',
    );

    // Import the server-only module in the server page and render it in server JSX
    const pagePath = path.join(projectDir, 'app/page.tsx');
    fs.writeFileSync(
      pagePath,
      `import React from 'react';
import { Counter } from './components/Counter.js';
import { formatTitle } from './utils/format.js';
import { serverSecretToken } from './utils/server-data.js';

export default function BoundaryPage() {
  return (
    <main>
      <h1>{formatTitle('Boundary Demo')}</h1>
      <p data-secret={serverSecretToken}>Server Secured</p>
      <Counter initialCount={5} />
    </main>
  );
}
`,
      'utf8',
    );

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build', '--json'], { cwd: projectDir, env: cliEnv });
      expect(buildRes.code).toBe(0);
      const parsed = JSON.parse(buildRes.stdout);
      expect(parsed.success).toBe(true);

      const clientStaticDir = path.join(projectDir, '.ranu/build/static');
      const manifestDir = path.join(projectDir, '.ranu/build/manifest');
      const serverDir = path.join(projectDir, '.ranu/build/server');

      expect(fs.existsSync(clientStaticDir)).toBe(true);
      expect(fs.existsSync(manifestDir)).toBe(true);
      expect(fs.existsSync(serverDir)).toBe(true);

      // Verify positive check: server build output actually contains the seeded secret
      const serverScan = scanDirectoryForSecrets(serverDir, [privateSecret, privateDatabaseToken]);
      expect(serverScan.leaked).toBe(true);

      // Scan client static assets for secret leaks: must be 100% clean
      const staticScan = scanDirectoryForSecrets(clientStaticDir, [privateSecret, privateDatabaseToken]);
      expect(staticScan.leaked).toBe(false);
      expect(staticScan.findings).toHaveLength(0);

      // Scan manifests for secret leaks: must be 100% clean
      const manifestScan = scanDirectoryForSecrets(manifestDir, [privateSecret, privateDatabaseToken]);
      expect(manifestScan.leaked).toBe(false);
      expect(manifestScan.findings).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it('Client Private Access Failure: build fails when client component attempts to read server secret', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
    try {
      const counterFile = path.join(projectDir, 'app/components/Counter.tsx');
      const content = fs.readFileSync(counterFile, 'utf8');
      fs.writeFileSync(
        counterFile,
        content.replace(
          'const siteName = process.env.RANU_PUBLIC_SITE_NAME;',
          'const siteName = process.env.SECRET_PRIVATE_API_KEY;',
        ),
        'utf8',
      );

      const res = await runCommand(process.execPath, [cliBin, 'build', '--json'], { cwd: projectDir, env: cliEnv });
      expect(res.code).toBe(1);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.success).toBe(false);
      const envError = parsed.diagnostics.find((d: any) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(envError).toBeDefined();
    } finally {
      await cleanup();
    }
  });
});
