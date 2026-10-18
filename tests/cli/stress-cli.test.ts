import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll, vi } from 'vitest';
import { runCommand, cleanupAllProcesses, type SpawnManagedOptions } from '../helpers/process.js';
import { removeDirWithRetry } from '../helpers/fixture.js';
import { runDescribeCommand, type DescribeOutput } from '../../packages/cli/src/commands/describe.js';
import { runCheckCommand } from '../../packages/cli/src/commands/check.js';
import { createCliLogger } from '../../packages/cli/src/logger.js';
import type { DiagnosticReport } from '../../packages/diagnostics/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

const cliEnv = { ...process.env, NODE_ENV: 'production' };

function runCli(args: string[], opts: SpawnManagedOptions = {}) {
  return runCommand(process.execPath, [cliBin, ...args], { env: cliEnv, ...opts });
}

// Helper to strip ANSI codes
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001b\[[0-9;]*[mGKH]/g;

describe('Adversarial Stress Verification — Ranu CLI Commands', () => {
  const tempDirs: string[] = [];

  function createTestProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-stress-cli-'));
    tempDirs.push(dir);
    return dir;
  }

  afterAll(async () => {
    await cleanupAllProcesses();
    for (const dir of tempDirs) {
      await removeDirWithRetry(dir).catch(() => {});
    }
  });

  describe('Suite 1: Stress-test `ranu describe --format json` on Complex Route Structures', () => {
    it('handles nested layouts, route groups, dynamic params, catch-alls, optional catch-alls, and full HTTP methods with 0 ANSI escapes', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });

      // 1. Root layout & root not-found
      fs.writeFileSync(
        path.join(appDir, 'layout.tsx'),
        `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'not-found.tsx'),
        `export default function RootNotFound() { return <h1>404 Root</h1>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `export default function HomePage() { return <h1>Home</h1>; }`
      );

      // 2. Route group: (marketing)
      const marketingDir = path.join(appDir, '(marketing)');
      fs.mkdirSync(marketingDir, { recursive: true });
      fs.writeFileSync(
        path.join(marketingDir, 'layout.tsx'),
        `export default function MarketingLayout({ children }: { children: React.ReactNode }) { return <div className="marketing">{children}</div>; }`
      );
      const aboutDir = path.join(marketingDir, 'about');
      fs.mkdirSync(aboutDir, { recursive: true });
      fs.writeFileSync(
        path.join(aboutDir, 'page.tsx'),
        `export const render = 'static';
         export default function AboutPage() { return <h1>About</h1>; }`
      );

      // 3. Nested route group inside (marketing): (marketing)/(promo)/sale
      const promoSaleDir = path.join(marketingDir, '(promo)', 'sale');
      fs.mkdirSync(promoSaleDir, { recursive: true });
      fs.writeFileSync(
        path.join(promoSaleDir, 'page.tsx'),
        `export default function SalePage() { return <h1>Sale</h1>; }`
      );

      // 4. Deeply nested dynamic layouts: blog/[category]/[slug] with loading, error, not-found
      const blogDir = path.join(appDir, 'blog');
      const blogCatDir = path.join(blogDir, '[category]');
      const blogSlugDir = path.join(blogCatDir, '[slug]');
      fs.mkdirSync(blogSlugDir, { recursive: true });

      fs.writeFileSync(
        path.join(blogDir, 'layout.tsx'),
        `export default function BlogLayout({ children }: { children: React.ReactNode }) { return <section>{children}</section>; }`
      );
      fs.writeFileSync(
        path.join(blogCatDir, 'layout.tsx'),
        `export default function CatLayout({ children }: { children: React.ReactNode }) { return <article>{children}</article>; }`
      );
      fs.writeFileSync(
        path.join(blogSlugDir, 'page.tsx'),
        `export default function PostPage() { return <h1>Post</h1>; }`
      );
      fs.writeFileSync(
        path.join(blogSlugDir, 'loading.tsx'),
        `export default function Loading() { return <div>Loading post...</div>; }`
      );
      fs.writeFileSync(
        path.join(blogSlugDir, 'error.tsx'),
        `export default function ErrorBoundary() { return <div>Post error</div>; }`
      );
      fs.writeFileSync(
        path.join(blogSlugDir, 'not-found.tsx'),
        `export default function PostNotFound() { return <div>Post not found</div>; }`
      );

      // 5. Catch-all route: docs/[...slug]
      const docsDir = path.join(appDir, 'docs', '[...slug]');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, 'page.tsx'),
        `export default function DocsPage() { return <h1>Docs</h1>; }`
      );

      // 6. Optional catch-all route: wiki/[[...slug]]
      const wikiDir = path.join(appDir, 'wiki', '[[...slug]]');
      fs.mkdirSync(wikiDir, { recursive: true });
      fs.writeFileSync(
        path.join(wikiDir, 'page.tsx'),
        `export default function WikiPage() { return <h1>Wiki</h1>; }`
      );

      // 7. Multi-param route: org/[orgId]/projects/[projectId]
      const multiParamDir = path.join(appDir, 'org', '[orgId]', 'projects', '[projectId]');
      fs.mkdirSync(multiParamDir, { recursive: true });
      fs.writeFileSync(
        path.join(multiParamDir, 'page.tsx'),
        `export default function OrgProjectPage() { return <h1>Project</h1>; }`
      );

      // 8. API route with ALL canonical HTTP methods: api/full
      const apiFullDir = path.join(appDir, 'api', 'full');
      fs.mkdirSync(apiFullDir, { recursive: true });
      fs.writeFileSync(
        path.join(apiFullDir, 'route.ts'),
        `export async function GET() { return new Response('GET'); }
         export async function HEAD() { return new Response('HEAD'); }
         export async function POST() { return new Response('POST'); }
         export async function PUT() { return new Response('PUT'); }
         export async function PATCH() { return new Response('PATCH'); }
         export async function DELETE() { return new Response('DELETE'); }
         export async function OPTIONS() { return new Response('OPTIONS'); }`
      );

      // 9. Dynamic API route: api/users/[id]
      const apiUserDir = path.join(appDir, 'api', 'users', '[id]');
      fs.mkdirSync(apiUserDir, { recursive: true });
      fs.writeFileSync(
        path.join(apiUserDir, 'route.ts'),
        `export async function GET() { return new Response('user'); }
         export async function DELETE() { return new Response('deleted'); }`
      );

      // 10. API route inside route group: api/(v1)/items
      const apiGroupDir = path.join(appDir, 'api', '(v1)', 'items');
      fs.mkdirSync(apiGroupDir, { recursive: true });
      fs.writeFileSync(
        path.join(apiGroupDir, 'route.ts'),
        `export async function GET() { return new Response('items'); }
         export async function POST() { return new Response('created'); }`
      );

      // --- Execute via CLI subprocess ---
      const res = await runCli(['describe', '--format', 'json'], { cwd: projectDir });

      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');

      // Verify NO ANSI escape codes in output
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      // Verify 100% valid JSON parse
      let parsed: DescribeOutput;
      expect(() => {
        parsed = JSON.parse(res.stdout.trim());
      }).not.toThrow();

      parsed = JSON.parse(res.stdout.trim()) as DescribeOutput;

      // Top-level schema assertions
      expect(parsed.frameworkVersion).toBeDefined();
      expect(parsed.version).toBe(parsed.frameworkVersion);
      expect(parsed.manifestSchemaVersion).toBeGreaterThan(0);
      expect(parsed.routeManifestSchemaVersion).toBeGreaterThan(0);
      expect(parsed.projectRoot).toBe(path.resolve(projectDir));
      expect(parsed.routesCount).toBe(10);
      expect(parsed.routeCount).toBe(10);
      expect(parsed.routes).toHaveLength(10);
      expect(parsed.diagnostics).toEqual([]);

      // Verify Route Group: /about (marketing group stripped)
      const aboutRoute = parsed.routes.find((r) => r.pathname === '/about');
      expect(aboutRoute).toBeDefined();
      expect(aboutRoute?.kind).toBe('page');
      expect(aboutRoute?.renderMode).toBe('static');
      expect(aboutRoute?.sourceFile).toBe('app/(marketing)/about/page.tsx');
      expect(aboutRoute?.layouts).toEqual(['app/layout.tsx', 'app/(marketing)/layout.tsx']);
      expect(aboutRoute?.methods).toEqual(['GET']);

      // Verify Nested Route Group: /sale (promo group stripped)
      const saleRoute = parsed.routes.find((r) => r.pathname === '/sale');
      expect(saleRoute).toBeDefined();
      expect(saleRoute?.sourceFile).toBe('app/(marketing)/(promo)/sale/page.tsx');
      expect(saleRoute?.layouts).toEqual(['app/layout.tsx', 'app/(marketing)/layout.tsx']);

      // Verify Deeply Nested Dynamic Layouts & Special Files: /blog/[category]/[slug]
      const blogRoute = parsed.routes.find((r) => r.pathname === '/blog/[category]/[slug]');
      expect(blogRoute).toBeDefined();
      expect(blogRoute?.params).toEqual(['category', 'slug']);
      expect(blogRoute?.sourceFile).toBe('app/blog/[category]/[slug]/page.tsx');
      expect(blogRoute?.layouts).toEqual([
        'app/layout.tsx',
        'app/blog/layout.tsx',
        'app/blog/[category]/layout.tsx',
      ]);
      expect(blogRoute?.loading).toBe('app/blog/[category]/[slug]/loading.tsx');
      expect(blogRoute?.error).toBe('app/blog/[category]/[slug]/error.tsx');
      expect(blogRoute?.notFound).toBe('app/blog/[category]/[slug]/not-found.tsx');

      // Verify Catch-All Route: /docs/[...slug]
      const docsRoute = parsed.routes.find((r) => r.pathname === '/docs/[...slug]');
      expect(docsRoute).toBeDefined();
      expect(docsRoute?.params).toEqual(['slug']);
      expect(docsRoute?.sourceFile).toBe('app/docs/[...slug]/page.tsx');
      expect(docsRoute?.layouts).toEqual(['app/layout.tsx']);

      // Verify Optional Catch-All Route: /wiki/[[...slug]]
      const wikiRoute = parsed.routes.find((r) => r.pathname === '/wiki/[[...slug]]');
      expect(wikiRoute).toBeDefined();
      expect(wikiRoute?.params).toEqual(['slug']);
      expect(wikiRoute?.sourceFile).toBe('app/wiki/[[...slug]]/page.tsx');

      // Verify Multi-Param Route: /org/[orgId]/projects/[projectId]
      const multiRoute = parsed.routes.find(
        (r) => r.pathname === '/org/[orgId]/projects/[projectId]'
      );
      expect(multiRoute).toBeDefined();
      expect(multiRoute?.params).toEqual(['orgId', 'projectId']);

      // Verify API Route with All Methods: /api/full
      const apiFullRoute = parsed.routes.find((r) => r.pathname === '/api/full');
      expect(apiFullRoute).toBeDefined();
      expect(apiFullRoute?.kind).toBe('api');
      expect(apiFullRoute?.sourceFile).toBe('app/api/full/route.ts');
      expect(apiFullRoute?.methods.sort()).toEqual([
        'DELETE',
        'GET',
        'HEAD',
        'OPTIONS',
        'PATCH',
        'POST',
        'PUT',
      ]);
      expect(apiFullRoute?.layouts).toEqual([]);

      // Verify Dynamic API Route: /api/users/[id]
      const apiUserRoute = parsed.routes.find((r) => r.pathname === '/api/users/[id]');
      expect(apiUserRoute).toBeDefined();
      expect(apiUserRoute?.kind).toBe('api');
      expect(apiUserRoute?.params).toEqual(['id']);
      expect(apiUserRoute?.methods.sort()).toEqual(['DELETE', 'GET']);

      // Verify API Route inside Route Group: /api/items (v1 group stripped)
      const apiGroupRoute = parsed.routes.find((r) => r.pathname === '/api/items');
      expect(apiGroupRoute).toBeDefined();
      expect(apiGroupRoute?.kind).toBe('api');
      expect(apiGroupRoute?.sourceFile).toBe('app/api/(v1)/items/route.ts');
      expect(apiGroupRoute?.methods.sort()).toEqual(['GET', 'POST']);
    });

    it('supports --format=json syntax and --json alias without ANSI escape codes', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(appDir, 'page.tsx'), `export default function P(){return null;}`);

      // Test with --format=json
      const resFormatEqual = await runCli(['describe', '--format=json'], { cwd: projectDir });
      expect(resFormatEqual.code).toBe(0);
      expect(resFormatEqual.stdout).not.toMatch(ANSI_REGEX);
      const parsed1 = JSON.parse(resFormatEqual.stdout.trim());
      expect(parsed1.routesCount).toBe(1);

      // Test with --json
      const resJsonFlag = await runCli(['describe', '--json'], { cwd: projectDir });
      expect(resJsonFlag.code).toBe(0);
      expect(resJsonFlag.stdout).not.toMatch(ANSI_REGEX);
      const parsed2 = JSON.parse(resJsonFlag.stdout.trim());
      expect(parsed2.routesCount).toBe(1);
    });

    it('returns exit code 1 with clean JSON diagnostics when route errors exist', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      // Page exists but missing root layout
      fs.writeFileSync(path.join(appDir, 'page.tsx'), `export default function P(){return null;}`);

      const res = await runCli(['describe', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const parsed: DescribeOutput = JSON.parse(res.stdout.trim());
      expect(parsed.routesCount).toBe(1);
      expect(parsed.diagnostics.length).toBeGreaterThan(0);
      expect(parsed.diagnostics[0]?.code).toBe('RANU_ROUTE_MISSING_ROOT_LAYOUT');
    });

    it('allows API-only projects without requiring a root layout', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app', 'api');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'route.ts'), `export async function GET(){return new Response('ok');}`);

      const res = await runCli(['describe', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(0);
      const parsed: DescribeOutput = JSON.parse(res.stdout.trim());
      expect(parsed.routesCount).toBe(1);
      expect(parsed.diagnostics).toEqual([]);
      expect(parsed.routes[0]?.kind).toBe('api');
    });

    it('demonstrates crash on broken config in describe --format json (stdout empty, stderr JSON)', async () => {
      const projectDir = createTestProject();
      fs.writeFileSync(path.join(projectDir, 'ranu.config.ts'), `export default { invalid syntax`);

      const res = await runCli(['describe', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      // stdout is completely empty because resolveProjectContext threw before describe could format JSON
      expect(res.stdout.trim()).toBe('');
      // error went to stderr as raw { error: "..." }
      expect(res.stderr).toContain('Failed to load configuration');
    });
  });

  describe('Suite 2: Stress-test `ranu check --format json` on Speed, Broken Configs, and Invariants', () => {
    it('benchmarks execution speed across 5, 10, and 25 routes (sub-second dry-run validation)', async () => {
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation(() => {});

      // Helper to generate a test project with N routes
      async function benchmarkRoutes(count: number): Promise<number> {
        const projectDir = createTestProject();
        const appDir = path.join(projectDir, 'app');
        fs.mkdirSync(appDir, { recursive: true });
        fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return <div>{children}</div>;}`);

        for (let i = 1; i <= count; i++) {
          const routeDir = path.join(appDir, `page-${i}`);
          fs.mkdirSync(routeDir, { recursive: true });
          fs.writeFileSync(
            path.join(routeDir, 'page.tsx'),
            `export default function Page${i}() { return <h1>Page ${i}</h1>; }`
          );
        }

        const start = performance.now();
        const exitCode = await runCheckCommand(
          { args: [], root: projectDir, format: 'json', json: true },
          logger
        );
        const elapsed = performance.now() - start;
        expect(exitCode).toBe(0);
        return elapsed;
      }

      const time5 = await benchmarkRoutes(5);
      const time10 = await benchmarkRoutes(10);
      const time25 = await benchmarkRoutes(25);

      // Verify sub-second execution (< 1000ms) for all scales
      expect(time5).toBeLessThan(500);
      expect(time10).toBeLessThan(500);
      // Document 25-route timing against 500ms target
      console.log(`[Benchmark] 5 routes: ${time5.toFixed(1)}ms, 10 routes: ${time10.toFixed(1)}ms, 25 routes: ${time25.toFixed(1)}ms`);
      expect(time25).toBeLessThan(1000); // Sub-second verified
    });

    it('diagnoses broken configuration syntax cleanly in JSON mode', async () => {
      const projectDir = createTestProject();
      fs.writeFileSync(path.join(projectDir, 'ranu.config.ts'), `export default { broken syntax`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);
      expect(report.summary.errors).toBeGreaterThanOrEqual(1);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_CONFIG_LOAD_FAILED');
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.location?.file).toContain('ranu.config.ts');
    });

    it('diagnoses broken configuration schema (invalid port) cleanly in JSON mode', async () => {
      const projectDir = createTestProject();
      fs.writeFileSync(path.join(projectDir, 'ranu.config.ts'), `export default { server: { port: -99 } };`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);
      expect(report.summary.errors).toBeGreaterThanOrEqual(1);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_CONFIG_INVALID');
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.message).toContain('server.port');
    });

    it('diagnoses missing root layout when pages exist', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'page.tsx'), `export default function Page(){return null;}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_MISSING_ROOT_LAYOUT');
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.hint).toContain('layout.tsx');
    });

    it('diagnoses non-terminal catch-all segments (RANU_ROUTE_INVALID_CATCH_ALL)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const badDir = path.join(appDir, 'docs', '[...slug]', 'extra');
      fs.mkdirSync(badDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(badDir, 'page.tsx'), `export default function P(){return null;}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_INVALID_CATCH_ALL');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('terminal');
      expect(diag?.hint).toContain('end of the route path');
    });

    it('diagnoses duplicate route parameters along path (RANU_ROUTE_DUPLICATE_PARAM)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const badDir = path.join(appDir, 'users', '[id]', 'orders', '[id]');
      fs.mkdirSync(badDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(badDir, 'page.tsx'), `export default function P(){return null;}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_DUPLICATE_PARAM');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('unique');
    });

    it('diagnoses reserved framework namespace misuse (RANU_ROUTE_INVALID_SEGMENT)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const badDir = path.join(appDir, '_ranu', 'status');
      fs.mkdirSync(badDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(badDir, 'page.tsx'), `export default function P(){return null;}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_INVALID_SEGMENT');
      expect(diag).toBeDefined();
      expect(diag?.hint).toBeDefined();
    });

    it('diagnoses invalid parameter identifier syntax (RANU_ROUTE_INVALID_PARAM)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const badDir = path.join(appDir, '[123invalid]');
      fs.mkdirSync(badDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(badDir, 'page.tsx'), `export default function P(){return null;}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_INVALID_PARAM');
      expect(diag).toBeDefined();
      expect(diag?.hint).toBeDefined();
    });

    it('diagnoses route kind collision between page and route (RANU_ROUTE_KIND_COLLISION)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const collideDir = path.join(appDir, 'users');
      fs.mkdirSync(collideDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return children;}`);
      fs.writeFileSync(path.join(collideDir, 'page.tsx'), `export default function P(){return null;}`);
      fs.writeFileSync(path.join(collideDir, 'route.ts'), `export async function GET(){return new Response('ok');}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_KIND_COLLISION');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('distinct directories');
    });

    it('diagnoses API route without any HTTP method exports (RANU_ROUTE_NO_METHODS)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const apiDir = path.join(appDir, 'api', 'empty');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(apiDir, 'route.ts'), `export const helper = 42;`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_NO_METHODS');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('uppercase HTTP handler');
    });

    it('diagnoses API route with mis-cased HTTP methods (RANU_ROUTE_INVALID_METHOD_CASE)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      const apiDir = path.join(appDir, 'api', 'miscased');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(apiDir, 'route.ts'), `export async function get(){return new Response('ok');}`);

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_ROUTE_INVALID_METHOD_CASE');
      expect(diag).toBeDefined();
      expect(diag?.message).toContain('HTTP method exports must be uppercase');
    });

    it('diagnoses Node built-in module import in client code with import trace (RANU_BUILD_NODE_BUILTIN_CLIENT)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return <div>{children}</div>;}`);

      fs.writeFileSync(
        path.join(appDir, 'ClientFs.tsx'),
        `"use client";
         import fs from 'node:fs';
         export function ClientFs() { return <div>{typeof fs}</div>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `import { ClientFs } from './ClientFs.js';
         export default function Page() { return <ClientFs />; }`
      );

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_BUILD_NODE_BUILTIN_CLIENT');
      expect(diag).toBeDefined();
      expect(diag?.importChain).toBeDefined();
      expect(diag?.hint).toBeDefined();
    });

    it('diagnoses server-only import in client code (RANU_BUILD_SERVER_ONLY_CLIENT)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return <div>{children}</div>;}`);

      fs.writeFileSync(
        path.join(appDir, 'ClientServerOnly.tsx'),
        `"use client";
         import 'ranu/server-only';
         export function Comp() { return <div>test</div>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `import { Comp } from './ClientServerOnly.js';
         export default function Page() { return <Comp />; }`
      );

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_BUILD_SERVER_ONLY_CLIENT');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('Remove server-only');
    });

    it('diagnoses private env var leak in client component (RANU_BUILD_PRIVATE_ENV_CLIENT)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return <div>{children}</div>;}`);

      fs.writeFileSync(
        path.join(appDir, 'ClientEnv.tsx'),
        `"use client";
         export function Comp() { const secret = process.env.API_SECRET_KEY; return <div>{secret}</div>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `import { Comp } from './ClientEnv.js';
         export default function Page() { return <Comp />; }`
      );

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('RANU_PUBLIC_');
    });

    it('diagnoses non-serializable function props passed to client components (RANU_BUILD_NON_SERIALIZABLE_PROP)', async () => {
      const projectDir = createTestProject();
      const appDir = path.join(projectDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(path.join(appDir, 'layout.tsx'), `export default function L({children}: any){return <div>{children}</div>;}`);

      fs.writeFileSync(
        path.join(appDir, 'Button.tsx'),
        `"use client";
         export function Button({ onClick }: any) { return <button onClick={onClick}>click</button>; }`
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `import { Button } from './Button.js';
         export default function Page() { return <Button onClick={() => alert('hi')} />; }`
      );

      const res = await runCli(['check', '--format', 'json'], { cwd: projectDir });
      expect(res.code).toBe(1);
      const report: DiagnosticReport = JSON.parse(res.stdout.trim());
      expect(report.success).toBe(false);

      const diag = report.diagnostics.find((d) => d.code === 'RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diag).toBeDefined();
      expect(diag?.hint).toContain('Move event handlers');
    });

    it('rejects invalid --format value with error message and exit code 1', async () => {
      const res = await runCli(['check', '--format', 'xml']);
      expect(res.code).toBe(1);
      expect(res.stderr + res.stdout).toContain('Flag "--format" requires "json" or "text"');
    });
  });
});
