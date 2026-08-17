import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '@ranu/build';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureRoot = path.resolve(__dirname, '../../../fixtures/build-boundaries');
const buildOutDir = path.join(fixtureRoot, '.ranu', 'build');

describe('Phase 12 — Server/Client Graph Separation & Security Boundaries', () => {
  let buildResult: any;

  beforeAll(async () => {
    const dotRanu = path.join(fixtureRoot, '.ranu');
    if (fs.existsSync(dotRanu)) {
      fs.rmSync(dotRanu, { recursive: true, force: true });
    }

    // Write fixture .env dynamically for CI environment
    const envFile = path.join(fixtureRoot, '.env');
    fs.writeFileSync(
      envFile,
      'DATABASE_URL=RANU_TEST_SECRET_DB_12345\nAPI_SECRET_KEY=RANU_TEST_SECRET_KEY_99999\nRANU_PUBLIC_SITE_NAME=Ranu Boundary Test\nRANU_PUBLIC_API_URL=https://api.ranu.test\n',
      'utf8'
    );

    buildResult = await build({
      projectRoot: fixtureRoot,
      minify: false, // Keep readable to inspect bundle text in tests
    });
  });

  afterAll(() => {
    const dotRanu = path.join(fixtureRoot, '.ranu');
    if (fs.existsSync(dotRanu)) {
      fs.rmSync(dotRanu, { recursive: true, force: true });
    }

    const envFile = path.join(fixtureRoot, '.env');
    if (fs.existsSync(envFile)) {
      fs.rmSync(envFile, { force: true });
    }
  });

  it('completes build with success: true and zero error diagnostics for valid boundaries', () => {
    expect(buildResult.success).toBe(true);
    expect(buildResult.diagnostics.filter((d: any) => d.severity === 'error')).toHaveLength(0);
  });

  it('generates browser client bundles in .ranu/build/static/assets/ for "use client" entries', () => {
    const staticAssetsDir = path.join(buildOutDir, 'static', 'assets');
    expect(fs.existsSync(staticAssetsDir)).toBe(true);

    const files = fs.readdirSync(staticAssetsDir);
    const clientJsFiles = files.filter(f => f.startsWith('c_') && f.endsWith('.js'));
    expect(clientJsFiles.length).toBeGreaterThan(0);
  });

  it('populates client manifest with asset groups for client entries', () => {
    const clientManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'client.json'), 'utf8')
    );

    expect(clientManifest.assets).toBeDefined();
    const counterAssets = clientManifest.assets['app/components/Counter.tsx'];
    expect(counterAssets).toBeDefined();
    expect(counterAssets.js.length).toBeGreaterThan(0);
    expect(counterAssets.js[0]).toMatch(/^\/_ranu\/assets\/c_components-Counter/);
  });

  it('substitutes RANU_PUBLIC_* environment variable into client bundle', () => {
    const staticAssetsDir = path.join(buildOutDir, 'static', 'assets');
    const files = fs.readdirSync(staticAssetsDir);
    const counterFile = files.find(f => f.startsWith('c_components-Counter') && f.endsWith('.js'));
    expect(counterFile).toBeDefined();

    const bundleContent = fs.readFileSync(path.join(staticAssetsDir, counterFile!), 'utf8');
    expect(bundleContent).toContain('Ranu Boundary Test');
  });

  it('SEEDED SECRET REGRESSION TEST: private server secrets are NEVER present in client output', () => {
    const staticDir = path.join(buildOutDir, 'static');
    expect(fs.existsSync(staticDir)).toBe(true);

    function scanDirForSecrets(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDirForSecrets(fullPath);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Private DB secret from .env
          expect(content).not.toContain('RANU_TEST_SECRET_DB_12345');
          // Private API secret from .env
          expect(content).not.toContain('RANU_TEST_SECRET_KEY_99999');
        }
      }
    }

    scanDirForSecrets(staticDir);
  });

  it('fails build with RANU_BUILD_CLIENT_SERVER_BOUNDARY when client imports server/ module', async () => {
    // Create temporary bad project
    const tempBadProject = path.join(fixtureRoot, '../build-bad-server-boundary');
    fs.mkdirSync(path.join(tempBadProject, 'app'), { recursive: true });
    fs.mkdirSync(path.join(tempBadProject, 'server'), { recursive: true });

    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'page.tsx'),
      `import { ClientWidget } from './widget.js'; export default function P() {}`
    );
    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'widget.tsx'),
      `"use client"; import { secretDb } from '../server/db.js'; export function ClientWidget() {}`
    );
    fs.writeFileSync(
      path.join(tempBadProject, 'server', 'db.ts'),
      `export const secretDb = { key: 'secret' };`
    );

    try {
      const result = await build({ projectRoot: tempBadProject });
      expect(result.success).toBe(false);

      const diag = result.diagnostics.find(d => d.code === 'RANU_BUILD_CLIENT_SERVER_BOUNDARY');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('server/db.ts');
      expect(diag?.message).toContain('Import chain');
    } finally {
      if (fs.existsSync(tempBadProject)) {
        fs.rmSync(tempBadProject, { recursive: true, force: true });
      }
    }
  });

  it('fails build with RANU_BUILD_NODE_BUILTIN_CLIENT when client imports node:* module', async () => {
    const tempBadProject = path.join(fixtureRoot, '../build-bad-node-builtin');
    fs.mkdirSync(path.join(tempBadProject, 'app'), { recursive: true });

    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'page.tsx'),
      `import { ClientFs } from './client-fs.js'; export default function P() {}`
    );
    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'client-fs.tsx'),
      `"use client"; import fs from 'node:fs'; export function ClientFs() {}`
    );

    try {
      const result = await build({ projectRoot: tempBadProject });
      expect(result.success).toBe(false);

      const diag = result.diagnostics.find(d => d.code === 'RANU_BUILD_NODE_BUILTIN_CLIENT');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('node:fs');
    } finally {
      if (fs.existsSync(tempBadProject)) {
        fs.rmSync(tempBadProject, { recursive: true, force: true });
      }
    }
  });

  it('fails build with RANU_BUILD_PRIVATE_ENV_CLIENT when client accesses private environment variables', async () => {
    const tempBadProject = path.join(fixtureRoot, '../build-bad-private-env');
    fs.mkdirSync(path.join(tempBadProject, 'app'), { recursive: true });

    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'page.tsx'),
      `import { ClientSecret } from './client-secret.js'; export default function P() {}`
    );
    fs.writeFileSync(
      path.join(tempBadProject, 'app', 'client-secret.tsx'),
      `"use client";
export function ClientSecret() {
  const secret = process.env.DATABASE_URL;
  return <div>{secret}</div>;
}`
    );

    try {
      const result = await build({ projectRoot: tempBadProject });
      expect(result.success).toBe(false);

      const diag = result.diagnostics.find(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('process.env.DATABASE_URL');
    } finally {
      if (fs.existsSync(tempBadProject)) {
        fs.rmSync(tempBadProject, { recursive: true, force: true });
      }
    }
  });
});
