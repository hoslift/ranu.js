import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAgentGuideMarkdown, syncAgentContextGuide } from '../src/assets/agent-guide.js';
import type { RouteEntryInfo } from '../src/pipeline/stage-routes.js';

describe('AI Agent Context Guide & llms.txt synchronization', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-agent-guide-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates markdown guide with discovered routes and invariants', () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/',
        kind: 'page',
        pathnameTemplate: '/',
        params: [],
        sourceFile: 'app/page.tsx',
        renderMode: 'server',
        methods: ['GET'],
      },
      {
        routeId: 'api:/api/health',
        kind: 'api',
        pathnameTemplate: '/api/health',
        params: [],
        sourceFile: 'app/api/health/route.ts',
        renderMode: 'server',
        methods: ['GET', 'POST'],
      },
    ];

    const markdown = generateAgentGuideMarkdown(tempDir, routes);

    expect(markdown).toContain('# Ranu.js Project Architecture & AI Agent Guide');
    expect(markdown).toContain('Application Route Graph (2 routes)');
    expect(markdown).toContain('- **PAGE** `/` [server] -> `app/page.tsx`');
    expect(markdown).toContain('- **API** `/api/health` -> `app/api/health/route.ts`');
    expect(markdown).toContain('W3C Standard Web Primitives');
    expect(markdown).toContain('Component Boundaries');
    expect(markdown).toContain('Environment Security');
    expect(markdown).toContain('ranu check --format json');
    expect(markdown).toContain('ranu describe --format compact');
    expect(markdown).toContain('ranu fix');
  });

  it('handles empty route lists gracefully', () => {
    const markdown = generateAgentGuideMarkdown(tempDir, []);
    expect(markdown).toContain('Application Route Graph (0 routes)');
    expect(markdown).toContain('- *(No routes discovered)*');
  });

  it('syncAgentContextGuide writes public/llms.txt and .ranu/AGENT_GUIDE.md', () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/dashboard',
        kind: 'page',
        pathnameTemplate: '/dashboard',
        params: [],
        sourceFile: 'app/dashboard/page.tsx',
        renderMode: 'static',
        methods: ['GET'],
      },
    ];

    syncAgentContextGuide(tempDir, routes);

    const llmsTxtPath = path.join(tempDir, 'public', 'llms.txt');
    const agentGuidePath = path.join(tempDir, '.ranu', 'AGENT_GUIDE.md');

    expect(fs.existsSync(llmsTxtPath)).toBe(true);
    expect(fs.existsSync(agentGuidePath)).toBe(true);

    const llmsContent = fs.readFileSync(llmsTxtPath, 'utf8');
    const guideContent = fs.readFileSync(agentGuidePath, 'utf8');

    expect(llmsContent).toBe(guideContent);
    expect(llmsContent).toContain('/dashboard');
    expect(llmsContent).toContain('static');
  });
});
