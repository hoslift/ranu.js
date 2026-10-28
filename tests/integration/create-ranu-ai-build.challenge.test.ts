import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffoldProject } from '../../create-ranu/src/index.js';
import { build } from '@ranu/build';

describe('create-ranu AI Engine Multi-Model Integration Build Stress (Challenger 2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-scaffold-ai-build-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('scaffolds with --ai groq and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'groq-app');
    const result = scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      ai: 'groq',
      template: 'default',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('app/routes/api.ai.ts');
    expect(result.filesCreated).toContain('.cursorrules');
    expect(result.filesCreated).toContain('AGENTS.md');
    expect(result.filesCreated).toContain('CLAUDE.md');
    expect(result.filesCreated).toContain('.ranu/AGENT_GUIDE.md');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('Groq Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'server', 'entry.mjs'))).toBe(true);
  });

  it('scaffolds with --ai claude and template api-routes, and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'claude-api-routes-app');
    const result = scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      ai: 'claude',
      template: 'api-routes',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('app/routes/api.ai.ts');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('Claude API Routes Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
  });

  it('scaffolds with --ai openai and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'openai-app');
    const result = scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      ai: 'openai',
      template: 'default',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('app/routes/api.ai.ts');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('OpenAI Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
  });

  it('scaffolds with --ai custom and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'custom-app');
    const result = scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      ai: 'custom',
      template: 'default',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('app/routes/api.ai.ts');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('Custom AI Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
  });

  it('scaffolds with --ai none (Zero AI) and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'zero-ai-app');
    const result = scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      ai: 'none',
      template: 'default',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).not.toContain('app/routes/api.ai.ts');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('Zero AI Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
  });
});
