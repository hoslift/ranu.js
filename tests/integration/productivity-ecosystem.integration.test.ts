import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runGenerateCommand } from '../../packages/cli/src/commands/generate.js';
import { runAddCommand } from '../../packages/cli/src/commands/add.js';
import { runFixCommand } from '../../packages/cli/src/commands/fix.js';
import { createFormAction } from '../../packages/server/src/actions/form-action.js';
import { syncAgentContextGuide } from '../../packages/build/src/assets/agent-guide.js';
import {
  getDevToolsState,
  setDevToolsState,
  resetDevToolsState,
  recordStreamingChunk,
  recordRouteHierarchy,
  subscribeDevTools,
} from '../../packages/devtools/src/state.js';
import { createTestContext, expectStatus, expectJson, expectHeader, expectRedirect } from '../../packages/testing/src/index.js';
import type { StandardSchemaV1 } from '../../packages/core/src/actions.js';
import type { CliLogger } from '../../packages/cli/src/types.js';

function createMockLogger(): { logger: CliLogger; logs: string[]; errors: string[]; jsonOutput: any[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const jsonOutput: any[] = [];
  const logger: CliLogger = {
    info: (msg: string) => logs.push(msg),
    success: (msg: string) => logs.push(msg),
    warn: (msg: string) => logs.push(msg),
    error: (msg: string) => errors.push(msg),
    debug: (msg: string) => logs.push(msg),
    log: (msg: string) => logs.push(msg),
    json: (payload: unknown) => jsonOutput.push(payload),
  };
  return { logger, logs, errors, jsonOutput };
}

describe('Productivity & Developer Ecosystem Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-phase5-integration-'));
    resetDevToolsState();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignored on Windows file locks
    }
  });

  describe('1. M5.1: Deterministic Code Scaffolding (ranu generate)', () => {
    it('generates server route, client route, API handler, and shared component', async () => {
      const { logger } = createMockLogger();

      // 1. Generate page route
      const pageExit = await runGenerateCommand(
        { command: 'generate', args: ['route', '/dashboard/metrics'], root: tempDir },
        logger,
      );
      expect(pageExit).toBe(0);
      const pageFile = path.join(tempDir, 'app', 'routes', 'dashboard', 'metrics', 'page.tsx');
      expect(fs.existsSync(pageFile)).toBe(true);
      const pageContent = fs.readFileSync(pageFile, 'utf8');
      expect(pageContent).toContain('DashboardMetricsPage');
      expect(pageContent).not.toContain("'use client'");

      // 2. Generate client page route with client: true
      const clientPageExit = await runGenerateCommand(
        { command: 'generate', args: ['route', '/editor'], client: true, root: tempDir },
        logger,
      );
      expect(clientPageExit).toBe(0);
      const clientFile = path.join(tempDir, 'app', 'routes', 'editor', 'page.tsx');
      expect(fs.existsSync(clientFile)).toBe(true);
      const clientContent = fs.readFileSync(clientFile, 'utf8');
      expect(clientContent.startsWith("'use client';")).toBe(true);

      // 3. Generate API endpoint route handler
      const apiExit = await runGenerateCommand(
        { command: 'generate', args: ['api', '/api/v1/telemetry'], root: tempDir },
        logger,
      );
      expect(apiExit).toBe(0);
      const apiFile = path.join(tempDir, 'app', 'routes', 'api', 'v1', 'telemetry', 'route.ts');
      expect(fs.existsSync(apiFile)).toBe(true);
      const apiContent = fs.readFileSync(apiFile, 'utf8');
      expect(apiContent).toContain('export async function GET(request: Request');

      // 4. Generate UI component
      const compExit = await runGenerateCommand(
        { command: 'generate', args: ['component', 'MetricsCard'], root: tempDir },
        logger,
      );
      expect(compExit).toBe(0);
      const compFile = path.join(tempDir, 'app', 'components', 'MetricsCard.tsx');
      expect(fs.existsSync(compFile)).toBe(true);
      const compContent = fs.readFileSync(compFile, 'utf8');
      expect(compContent).toContain('export function MetricsCard');
    });
  });

  describe('2. M5.2: AI Context Engine Live Synchronization', () => {
    it('generates public/llms.txt and .ranu/AGENT_GUIDE.md with route topology', () => {
      const mockRoutes = [
        {
          id: 'route-home',
          pathnameTemplate: '/',
          sourceFile: 'app/routes/page.tsx',
          kind: 'page' as const,
          renderMode: 'ssr' as const,
          componentPath: 'app/routes/page.tsx',
          entryName: 'home',
          isDynamic: false,
          paramNames: [],
          score: 100,
        },
        {
          id: 'route-api',
          pathnameTemplate: '/api/health',
          sourceFile: 'app/routes/api/health/route.ts',
          kind: 'endpoint' as const,
          renderMode: 'server' as const,
          componentPath: 'app/routes/api/health/route.ts',
          entryName: 'api-health',
          isDynamic: false,
          paramNames: [],
          score: 90,
        },
      ];

      syncAgentContextGuide(tempDir, mockRoutes);

      const llmsFile = path.join(tempDir, 'public', 'llms.txt');
      const agentGuideFile = path.join(tempDir, '.ranu', 'AGENT_GUIDE.md');

      expect(fs.existsSync(llmsFile)).toBe(true);
      expect(fs.existsSync(agentGuideFile)).toBe(true);

      const llmsContent = fs.readFileSync(llmsFile, 'utf8');
      expect(llmsContent).toContain('Ranu.js Project Architecture & AI Agent Guide');
      expect(llmsContent).toContain('`app/routes/page.tsx`');
      expect(llmsContent).toContain('`app/routes/api/health/route.ts`');
      expect(llmsContent).toContain('W3C Standard Web Primitives');
    });
  });

  describe('3. M5.3: Self-Healing Diagnostic Auto-Fixer (ranu fix)', () => {
    it('analyzes workspace and reports health or repairs broken configurations', async () => {
      const { logger } = createMockLogger();

      // Create valid minimal project
      const appDir = path.join(tempDir, 'app');
      fs.mkdirSync(appDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, 'layout.tsx'),
        `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(appDir, 'page.tsx'),
        `export default function HomePage() { return <h1>Home</h1>; }`,
        'utf8',
      );

      const fixExit = await runFixCommand(
        { command: 'fix', args: [], root: tempDir },
        logger,
      );
      expect(fixExit).toBe(0);
    });
  });

  describe('4. M5.4: In-Browser DevTools Dock Store (@ranu/devtools)', () => {
    it('tracks streaming waterfall chunks, route navigation, and tab states', () => {
      const initialState = getDevToolsState();
      expect(initialState.isOpen).toBe(false);
      expect(initialState.activeTab).toBe('waterfall');

      // 1. Toggle open/close
      setDevToolsState({ isOpen: true, activeTab: 'routes' });
      expect(getDevToolsState().isOpen).toBe(true);
      expect(getDevToolsState().activeTab).toBe('routes');

      // 2. Record streaming chunk events
      recordStreamingChunk(1024, '<div>Streaming chunk</div>');

      const updated = getDevToolsState();
      expect(updated.streamingChunks).toHaveLength(1);
      expect(updated.streamingChunks[0].bytes).toBe(1024);

      // 3. Record active route info
      recordRouteHierarchy({
        pathname: '/dashboard',
        layoutHierarchy: ['root-layout', 'dashboard-layout'],
      });

      expect(getDevToolsState().currentRoute?.pathname).toBe('/dashboard');
      expect(getDevToolsState().currentRoute?.layoutHierarchy).toEqual(['root-layout', 'dashboard-layout']);
    });
  });

  describe('5. M5.5: Standard Schema Form Actions (createFormAction)', () => {
    it('executes type-safe validation, handles FormData, and reports field and form errors', async () => {
      const testSchema: StandardSchemaV1<{ title: string; count: number }> = {
        '~standard': {
          version: 1,
          vendor: 'vitest-validator',
          validate(value: any) {
            const issues = [];
            if (!value?.title || typeof value.title !== 'string') {
              issues.push({ message: 'Title is required', path: ['title'] });
            }
            const countNum = Number(value?.count);
            if (Number.isNaN(countNum) || countNum < 1) {
              issues.push({ message: 'Count must be at least 1', path: ['count'] });
            }
            if (issues.length > 0) {
              return { issues };
            }
            return { value: { title: String(value.title).trim(), count: countNum } };
          },
        },
      };

      const action = createFormAction({
        schema: testSchema,
        handler: async (data) => {
          return { savedId: 'item_101', savedTitle: data.title, total: data.count * 10 };
        },
      });

      // 1. Invalid payload returns structured errors
      const invalidRes = await action({ title: '', count: -5 });
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.errors?.title).toContain('Title is required');
      expect(invalidRes.errors?.count).toContain('Count must be at least 1');

      // 2. Valid FormData submission
      const form = new FormData();
      form.append('title', 'Productivity Release Standard');
      form.append('count', '5');

      const validRes = await action(form);
      expect(validRes.success).toBe(true);
      expect(validRes.data).toEqual({
        savedId: 'item_101',
        savedTitle: 'Productivity Release Standard',
        total: 50,
      });

      // 3. Raw execution bypasses form transport
      const rawRes = await action.raw({ title: 'Direct Raw Call', count: 2 });
      expect(rawRes).toEqual({
        savedId: 'item_101',
        savedTitle: 'Direct Raw Call',
        total: 20,
      });
    });
  });

  describe('6. M5.6: CLI Add-On Manager (ranu add)', () => {
    it('adds tailwind, drizzle, and auth add-on assets cleanly', async () => {
      const { logger } = createMockLogger();

      // Create minimal package.json
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-app', version: '0.0.1', dependencies: {}, devDependencies: {} }, null, 2),
        'utf8',
      );
      fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'app', 'layout.tsx'), 'export default function Layout({ children }: any) { return children; }', 'utf8');

      // Add tailwind
      const tailwindExit = await runAddCommand(
        { command: 'add', args: ['tailwind'], root: tempDir },
        logger,
      );
      expect(tailwindExit).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'app', 'globals.css'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'postcss.config.mjs'))).toBe(true);

      // Add drizzle
      const drizzleExit = await runAddCommand(
        { command: 'add', args: ['drizzle'], root: tempDir },
        logger,
      );
      expect(drizzleExit).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'drizzle.config.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'db', 'schema.ts'))).toBe(true);

      // Add auth
      const authExit = await runAddCommand(
        { command: 'add', args: ['auth'], root: tempDir },
        logger,
      );
      expect(authExit).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'lib', 'auth.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'app', 'api', 'auth', '[...auth]', 'route.ts'))).toBe(true);
    });
  });

  describe('7. M5.7: Headless In-Memory Test Sandbox (@ranu/testing)', () => {
    it('dispatches mock requests and executes status, header, json, and redirect assertions in memory', async () => {
      const context = createTestContext({
        routes: {
          '/api/status': async () => {
            return Response.json({ status: 'operational', uptime: 100 }, {
              headers: { 'X-Framework': 'Ranu.js' },
            });
          },
          '/old-home': async () => {
            return new Response(null, {
              status: 302,
              headers: { Location: '/new-home' },
            });
          },
        },
      });

      // Test JSON endpoint
      const res1 = await context.fetch('/api/status');
      expectStatus(res1, 200);
      expectHeader(res1, 'X-Framework', 'Ranu.js');
      const body = await expectJson<{ status: string; uptime: number }>(res1);
      expect(body.status).toBe('operational');
      expect(body.uptime).toBe(100);

      // Test redirect endpoint
      const res2 = await context.fetch('/old-home');
      expectStatus(res2, 302);
      expectRedirect(res2, '/new-home', 302);
    });
  });
});
