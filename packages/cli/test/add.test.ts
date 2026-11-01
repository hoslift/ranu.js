import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCli } from '../src/cli.js';

describe('@ranu/cli add command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-add-test-'));
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-app', version: '0.1.0' }, null, 2),
      'utf8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('configures Tailwind CSS v4 and wires into layout', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'app', 'layout.tsx'),
      `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n`,
      'utf8',
    );

    const code = await runCli(['add', 'tailwind', '--root', tmpDir]);
    expect(code).toBe(0);

    const globalsCss = path.join(tmpDir, 'app', 'globals.css');
    expect(fs.existsSync(globalsCss)).toBe(true);
    expect(fs.readFileSync(globalsCss, 'utf8')).toContain('@import "tailwindcss";');

    const layout = fs.readFileSync(path.join(tmpDir, 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain("import './globals.css';");

    const postcss = path.join(tmpDir, 'postcss.config.mjs');
    expect(fs.existsSync(postcss)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    expect(pkg.devDependencies?.tailwindcss).toBeDefined();
    expect(pkg.devDependencies?.['@tailwindcss/postcss']).toBeDefined();
  });

  it('configures Drizzle ORM and generates schema', async () => {
    const code = await runCli(['add', 'drizzle', '--root', tmpDir]);
    expect(code).toBe(0);

    const schema = path.join(tmpDir, 'db', 'schema.ts');
    const dbIndex = path.join(tmpDir, 'db', 'index.ts');
    const drizzleConfig = path.join(tmpDir, 'drizzle.config.ts');

    expect(fs.existsSync(schema)).toBe(true);
    expect(fs.existsSync(dbIndex)).toBe(true);
    expect(fs.existsSync(drizzleConfig)).toBe(true);

    const schemaContent = fs.readFileSync(schema, 'utf8');
    expect(schemaContent).toContain('pgTable');

    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies?.['drizzle-orm']).toBeDefined();
    expect(pkg.devDependencies?.['drizzle-kit']).toBeDefined();
  });

  it('configures authentication boilerplate and session helper', async () => {
    const code = await runCli(['add', 'auth', '--root', tmpDir]);
    expect(code).toBe(0);

    const authRoute = path.join(tmpDir, 'app', 'api', 'auth', '[...auth]', 'route.ts');
    const libAuth = path.join(tmpDir, 'lib', 'auth.ts');

    expect(fs.existsSync(authRoute)).toBe(true);
    expect(fs.existsSync(libAuth)).toBe(true);

    const routeContent = fs.readFileSync(authRoute, 'utf8');
    expect(routeContent).toContain('export async function GET()');
    expect(routeContent).toContain('cookieStore.set');

    const authLibContent = fs.readFileSync(libAuth, 'utf8');
    expect(authLibContent).toContain('export async function getSession()');
  });

  it('supports --dry-run without creating files on disk', async () => {
    const code = await runCli(['add', 'tailwind', '--dry-run', '--root', tmpDir]);
    expect(code).toBe(0);

    const globalsCss = path.join(tmpDir, 'app', 'globals.css');
    expect(fs.existsSync(globalsCss)).toBe(false);
  });

  it('fails gracefully on missing or invalid add-on name', async () => {
    const codeMissing = await runCli(['add', '--root', tmpDir]);
    expect(codeMissing).toBe(1);

    const codeInvalid = await runCli(['add', 'unknown-addon', '--root', tmpDir]);
    expect(codeInvalid).toBe(1);
  });
});
