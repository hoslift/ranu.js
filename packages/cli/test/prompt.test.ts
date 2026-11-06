import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildArchitecturePrompt, discoverProjectInfo } from '../src/prompt-builder.js';
import { runPromptCommand, type PromptCommandResult } from '../src/commands/prompt.js';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli prompt command & builder', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-prompt-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupMockProject(): void {
    const pkgJson = {
      name: 'my-ranu-saas-app',
      version: '1.2.0',
      dependencies: {
        '@ranu/core': 'workspace:*',
        react: '^19.0.0',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
    fs.writeFileSync(path.join(tempDir, 'ranu.config.ts'), 'export default {};');

    const routesDir = path.join(tempDir, 'app', 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'page.tsx'), 'export default function Home() { return <div />; }');

    const apiDir = path.join(routesDir, 'api', 'ai');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'route.ts'), 'export async function POST() { return Response.json({}); }');
  }

  describe('discoverProjectInfo', () => {
    it('discovers package name, version, dependencies, and routes in project', () => {
      setupMockProject();
      const info = discoverProjectInfo(tempDir);

      expect(info.name).toBe('my-ranu-saas-app');
      expect(info.version).toBe('1.2.0');
      expect(info.hasRanuConfig).toBe(true);
      expect(info.dependencies).toContain('react');
      expect(info.routes).toContain('app/routes/page.tsx');
      expect(info.routes).toContain('app/routes/api/ai/route.ts');
    });
  });

  describe('buildArchitecturePrompt', () => {
    it('generates Claude XML formatted prompt with framework invariants', async () => {
      setupMockProject();
      const prompt = await buildArchitecturePrompt({ target: 'claude', projectRoot: tempDir });

      expect(prompt).toContain('<ranu_architecture_guide>');
      expect(prompt).toContain('<system_instructions>');
      expect(prompt).toContain('<framework_invariants>');
      expect(prompt).toContain('React 19 Streaming SSR');
      expect(prompt).toContain("'use client';");
      expect(prompt).toContain('RANU_PUBLIC_');
      expect(prompt).toContain('ranu/ai');
      expect(prompt).toContain('<project_context>');
      expect(prompt).toContain('Project Name: my-ranu-saas-app');
      expect(prompt).toContain('</ranu_architecture_guide>');
    });

    it('generates ChatGPT Markdown formatted prompt', async () => {
      setupMockProject();
      const prompt = await buildArchitecturePrompt({ target: 'chatgpt', projectRoot: tempDir });

      expect(prompt).toContain('# Ranu.js Architectural Context & Directives');
      expect(prompt).toContain('## System Directives');
      expect(prompt).toContain('## Core Framework Invariants');
      expect(prompt).toContain('## File & Routing Conventions');
      expect(prompt).toContain('## Current Project Context');
      expect(prompt).toContain('Project Name: my-ranu-saas-app');
    });

    it('generates Gemini formatted prompt with bullet directives', async () => {
      setupMockProject();
      const prompt = await buildArchitecturePrompt({ target: 'gemini', projectRoot: tempDir });

      expect(prompt).toContain('# Ranu.js Architecture Directives for Google Gemini');
      expect(prompt).toContain('## Directives:');
      expect(prompt).toContain('## Invariants:');
      expect(prompt).toContain('## Project Routing & Conventions:');
      expect(prompt).toContain('## Project Context:');
      expect(prompt).toContain('Project Name: my-ranu-saas-app');
    });

    it('generates universal architecture prompt when target is "all"', async () => {
      const prompt = await buildArchitecturePrompt({ target: 'all', projectRoot: tempDir });

      expect(prompt).toContain('# Ranu.js Universal Architecture & AI Prompt Guide');
      expect(prompt).toContain('React 19 Server Components Default');
      expect(prompt).toContain('W3C Web Standards');
    });
  });

  describe('runPromptCommand', () => {
    it('outputs prompt to stdout by default', async () => {
      const logger = createCliLogger({ quiet: true });
      const logSpy = vi.spyOn(logger, 'log');

      const exitCode = await runPromptCommand({ args: [], root: tempDir }, logger);

      expect(exitCode).toBe(0);
      expect(logSpy).toHaveBeenCalled();
      const logged = logSpy.mock.calls[0]?.[0] as string;
      expect(logged).toContain('Ranu.js');
    });

    it('copies to clipboard when --copy is passed and copy succeeds', async () => {
      const logger = createCliLogger({ quiet: true });
      const successSpy = vi.spyOn(logger, 'success');
      const mockCopy = vi.fn().mockResolvedValue(true);

      const exitCode = await runPromptCommand(
        { args: [], root: tempDir, copy: true, target: 'claude' },
        logger,
        { copyFn: mockCopy }
      );

      expect(exitCode).toBe(0);
      expect(mockCopy).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('copied to clipboard!'));
    });

    it('falls back to stdout when --copy fails due to unavailable clipboard', async () => {
      const logger = createCliLogger({ quiet: true });
      const warnSpy = vi.spyOn(logger, 'warn');
      const logSpy = vi.spyOn(logger, 'log');
      const mockCopy = vi.fn().mockResolvedValue(false);

      const exitCode = await runPromptCommand(
        { args: [], root: tempDir, copy: true },
        logger,
        { copyFn: mockCopy }
      );

      expect(exitCode).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unavailable in this environment'));
      expect(logSpy).toHaveBeenCalled();
    });

    it('supports --stdout alongside --copy', async () => {
      const logger = createCliLogger({ quiet: true });
      const successSpy = vi.spyOn(logger, 'success');
      const logSpy = vi.spyOn(logger, 'log');
      const mockCopy = vi.fn().mockResolvedValue(true);

      const exitCode = await runPromptCommand(
        { args: [], root: tempDir, copy: true, stdout: true },
        logger,
        { copyFn: mockCopy }
      );

      expect(exitCode).toBe(0);
      expect(successSpy).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    });

    it('outputs structured JSON when --json / --format json is specified', async () => {
      let jsonPayload: unknown;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data) => {
        jsonPayload = data;
      });

      const exitCode = await runPromptCommand(
        { args: [], root: tempDir, target: 'chatgpt', json: true, format: 'json' },
        logger
      );

      expect(exitCode).toBe(0);
      expect(jsonPayload).toBeDefined();
      const res = jsonPayload as PromptCommandResult;
      expect(res.success).toBe(true);
      expect(res.target).toBe('chatgpt');
      expect(typeof res.length).toBe('number');
      expect(res.prompt).toContain('Ranu.js');
    });
  });
});
