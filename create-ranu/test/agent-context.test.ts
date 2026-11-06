import { describe, it, expect } from 'vitest';
import {
  generateAgentContextFiles,
  generateCursorRules,
  generateAgentsMarkdown,
  generateClaudeMarkdown,
  generateAgentGuide,
} from '../src/agent-context.js';
import { generateTemplateFiles } from '../src/template.js';
import type { AIEngineName } from '../src/types.js';

describe('agent-context file generation & invariants', () => {
  const sinhalaRegex = /[\u0D80-\u0DFF]/;
  const aiEngines: AIEngineName[] = ['none', 'gemini', 'groq', 'claude', 'openai', 'custom'];

  it('generates zero-ai agent context files by default', () => {
    const files = generateAgentContextFiles({
      projectName: 'zero-app',
      packageManager: 'pnpm',
      aiEngine: 'none',
      template: 'default',
    });

    expect(files['.cursorrules']).toBeDefined();
    expect(files['AGENTS.md']).toBeDefined();
    expect(files['CLAUDE.md']).toBeDefined();
    expect(files['.ranu/AGENT_GUIDE.md']).toBeDefined();
    expect(files['public/llms.txt']).toBeDefined();

    // Verify Zero-AI specifics
    expect(files['.cursorrules']).toContain('Zero-AI Architecture');
    expect(files['.cursorrules']).toContain('Do NOT import `@ranu/ai`');
    expect(files['AGENTS.md']).toContain('Zero-AI Configuration');
    expect(files['AGENTS.md']).toContain('npx ranu describe --format json');
    expect(files['AGENTS.md']).toContain('npx ranu check --format json');
    expect(files['CLAUDE.md']).toContain('Zero AI / Traditional Web App');
    expect(files['CLAUDE.md']).toContain('pnpm dev');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('Application Route Graph');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: Zero AI');
    expect(files['public/llms.txt']).toBe(files['.ranu/AGENT_GUIDE.md']);
  });

  it('generates tailored context files for Google Gemini', () => {
    const files = generateAgentContextFiles({
      projectName: 'gemini-app',
      packageManager: 'npm',
      aiEngine: 'gemini',
    });

    expect(files['.cursorrules']).toContain('@ranu/ai-gemini');
    expect(files['.cursorrules']).toContain('GEMINI_API_KEY');
    expect(files['.cursorrules']).toContain('gemini-1.5-pro');
    expect(files['AGENTS.md']).toContain('@ranu/ai-gemini');
    expect(files['AGENTS.md']).toContain('app/routes/api.ai.ts');
    expect(files['CLAUDE.md']).toContain('GEMINI_API_KEY');
    expect(files['CLAUDE.md']).toContain('npm run dev');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: GEMINI');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('@ranu/ai-gemini');
  });

  it('generates tailored context files for Groq', () => {
    const files = generateAgentContextFiles({
      projectName: 'groq-app',
      packageManager: 'pnpm',
      aiEngine: 'groq',
    });

    expect(files['.cursorrules']).toContain('@ranu/ai-groq');
    expect(files['.cursorrules']).toContain('GROQ_API_KEY');
    expect(files['.cursorrules']).toContain('llama-3.3-70b-versatile');
    expect(files['AGENTS.md']).toContain('@ranu/ai-groq');
    expect(files['AGENTS.md']).toContain('GROQ_API_KEY');
    expect(files['CLAUDE.md']).toContain('GROQ_API_KEY');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: GROQ');
  });

  it('generates tailored context files for Claude', () => {
    const files = generateAgentContextFiles({
      projectName: 'claude-app',
      packageManager: 'yarn',
      aiEngine: 'claude',
    });

    expect(files['.cursorrules']).toContain('@ranu/ai-claude');
    expect(files['.cursorrules']).toContain('ANTHROPIC_API_KEY');
    expect(files['.cursorrules']).toContain('claude-3-5-sonnet-20241022');
    expect(files['AGENTS.md']).toContain('@ranu/ai-claude');
    expect(files['CLAUDE.md']).toContain('ANTHROPIC_API_KEY');
    expect(files['CLAUDE.md']).toContain('yarn dev');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: CLAUDE');
  });

  it('generates tailored context files for OpenAI', () => {
    const files = generateAgentContextFiles({
      projectName: 'openai-app',
      packageManager: 'bun',
      aiEngine: 'openai',
    });

    expect(files['.cursorrules']).toContain('@ranu/ai-openai');
    expect(files['.cursorrules']).toContain('OPENAI_API_KEY');
    expect(files['.cursorrules']).toContain('gpt-4o');
    expect(files['AGENTS.md']).toContain('@ranu/ai-openai');
    expect(files['CLAUDE.md']).toContain('OPENAI_API_KEY');
    expect(files['CLAUDE.md']).toContain('bun dev');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: OPENAI');
  });

  it('generates tailored context files for Custom / Local Ollama', () => {
    const files = generateAgentContextFiles({
      projectName: 'custom-app',
      packageManager: 'pnpm',
      aiEngine: 'custom',
    });

    expect(files['.cursorrules']).toContain('@ranu/ai-custom');
    expect(files['.cursorrules']).toContain('CUSTOM_AI_ENDPOINT');
    expect(files['AGENTS.md']).toContain('@ranu/ai-custom');
    expect(files['AGENTS.md']).toContain('CUSTOM_AI_ENDPOINT');
    expect(files['CLAUDE.md']).toContain('CUSTOM_AI_ENDPOINT');
    expect(files['.ranu/AGENT_GUIDE.md']).toContain('AI Engine Manifest: CUSTOM');
  });

  it.each(aiEngines)('enforces zero Sinhala characters and anti-hallucination invariants for ai: %s', (ai) => {
    const files = generateTemplateFiles('invariants-app', 'pnpm', { ai });

    const requiredFiles = ['.cursorrules', 'AGENTS.md', 'CLAUDE.md', '.ranu/AGENT_GUIDE.md'];
    for (const file of requiredFiles) {
      const content = files[file];
      expect(content, `File ${file} should exist`).toBeDefined();
      expect(content!.length).toBeGreaterThan(100);

      // Strict Zero-Sinhala check
      expect(
        sinhalaRegex.test(content!),
        `File ${file} must not contain any Sinhala characters`
      ).toBe(false);

      // Anti-hallucination checks
      expect(content).not.toContain("from 'next/");
      expect(content).not.toContain('from "@remix-run/');
      expect(content).not.toContain('req: IncomingMessage');
    }

    // Check all files in template
    for (const [filePath, content] of Object.entries(files)) {
      expect(
        sinhalaRegex.test(content),
        `Template file ${filePath} must not contain Sinhala characters`
      ).toBe(false);
    }
  });

  it('adapts route graph in agent guide for saas and api-routes templates', () => {
    const saasFiles = generateAgentContextFiles({
      projectName: 'saas-app',
      packageManager: 'pnpm',
      template: 'saas',
      aiEngine: 'none',
    });
    expect(saasFiles['.ranu/AGENT_GUIDE.md']).toContain('/dashboard');
    expect(saasFiles['.ranu/AGENT_GUIDE.md']).toContain('/api/auth/session');

    const apiFiles = generateAgentContextFiles({
      projectName: 'api-app',
      packageManager: 'pnpm',
      template: 'api-routes',
      aiEngine: 'none',
    });
    expect(apiFiles['.ranu/AGENT_GUIDE.md']).toContain('/api/hello');
  });
});
