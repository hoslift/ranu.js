import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runDescribeCommand, type DescribeOutput } from '../src/commands/describe.js';
import { createCliLogger } from '../src/logger.js';
import { RANU_VERSION } from '@ranu/core';
import { MANIFEST_SCHEMA_VERSION, ROUTE_MANIFEST_SCHEMA_VERSION } from '@ranu/manifests';

describe('@ranu/cli describe command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-describe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupSampleProject(): void {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Root layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }`
    );

    // Root page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `export default function HomePage() { return <h1>Home</h1>; }`
    );

    // Products dynamic page
    const productsDir = path.join(appDir, 'products', '[id]');
    fs.mkdirSync(productsDir, { recursive: true });
    fs.writeFileSync(
      path.join(productsDir, 'page.tsx'),
      `export const render = 'static';
       export default function ProductPage() { return <h1>Product</h1>; }`
    );

    // API route
    const apiUsersDir = path.join(appDir, 'api', 'users');
    fs.mkdirSync(apiUsersDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiUsersDir, 'route.ts'),
      `export async function GET() { return new Response('users'); }
       export async function POST() { return new Response('created'); }`
    );
  }

  it('outputs valid JSON schema when --format json is specified', async () => {
    setupSampleProject();

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    const jsonSpy = vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runDescribeCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(0);
    expect(jsonSpy).toHaveBeenCalled();

    const output = loggedData as DescribeOutput;
    expect(output.frameworkVersion).toBe(RANU_VERSION);
    expect(output.manifestSchemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(output.routeManifestSchemaVersion).toBe(ROUTE_MANIFEST_SCHEMA_VERSION);
    expect(output.projectRoot).toBe(path.resolve(tempDir));
    expect(output.routesCount).toBe(3);
    expect(output.routes).toHaveLength(3);

    // Verify root page
    const rootRoute = output.routes.find((r) => r.pathname === '/');
    expect(rootRoute).toBeDefined();
    expect(rootRoute?.kind).toBe('page');
    expect(rootRoute?.methods).toEqual(['GET']);
    expect(rootRoute?.renderMode).toBe('server');
    expect(rootRoute?.sourceFile).toBe('app/page.tsx');
    expect(rootRoute?.layouts).toEqual(['app/layout.tsx']);

    // Verify dynamic page
    const productRoute = output.routes.find((r) => r.pathname === '/products/[id]');
    expect(productRoute).toBeDefined();
    expect(productRoute?.kind).toBe('page');
    expect(productRoute?.params).toEqual(['id']);
    expect(productRoute?.renderMode).toBe('static');
    expect(productRoute?.sourceFile).toBe('app/products/[id]/page.tsx');

    // Verify API route
    const apiRoute = output.routes.find((r) => r.pathname === '/api/users');
    expect(apiRoute).toBeDefined();
    expect(apiRoute?.kind).toBe('api');
    expect(apiRoute?.methods.sort()).toEqual(['GET', 'POST']);
    expect(apiRoute?.sourceFile).toBe('app/api/users/route.ts');
  });

  it('outputs structured table in human-readable text mode', async () => {
    setupSampleProject();

    const logger = createCliLogger({ quiet: false });
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});

    const exitCode = await runDescribeCommand({ args: [], root: tempDir }, logger);

    expect(exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalled();

    const joinedLogs = logSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(joinedLogs).toContain('Ranu.js Application Route Graph');
    expect(joinedLogs).toContain('/products/[id]');
    expect(joinedLogs).toContain('/api/users');
  });

  it('returns exit code 1 when route tree contains errors', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Page exists but missing root layout
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `export default function HomePage() { return <h1>Home</h1>; }`
    );

    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation(() => {});

    const exitCode = await runDescribeCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
  });

  it('outputs minified route array when --format compact is specified', async () => {
    setupSampleProject();

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runDescribeCommand(
      { args: [], root: tempDir, format: 'compact' },
      logger
    );

    expect(exitCode).toBe(0);
    expect(Array.isArray(loggedData)).toBe(true);
    const compactList = loggedData as unknown[][];
    expect(compactList).toHaveLength(3);

    // Verify token efficiency: serialized compact JSON is very small (<300 characters / <75 tokens)
    const serialized = JSON.stringify(compactList);
    expect(serialized.length).toBeLessThan(300);

    // Each element is [methods, pathname, kind, renderMode, sourceFile]
    const rootEntry = compactList.find((entry) => entry[1] === '/');
    expect(rootEntry).toEqual(['GET', '/', 'page', 'server', 'app/page.tsx']);
  });
});
