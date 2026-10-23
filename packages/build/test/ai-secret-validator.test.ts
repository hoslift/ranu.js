import { describe, it, expect } from 'vitest';
import {
  validateClientSourceEnv,
  isKnownAiSecretKey,
  KNOWN_AI_SECRET_KEYS,
} from '../src/env/env-validator.js';

describe('AI API Key Protection Invariant (AST Static Analysis)', () => {
  it('recognizes all top AI partner secret keys', () => {
    const keys = [
      'GEMINI_API_KEY',
      'GROQ_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'CUSTOM_AI_KEY',
      'MISTRAL_API_KEY',
      'CEREBRAS_API_KEY',
      'AI_API_KEY',
      'MY_LLM_API_KEY',
      'BACKEND_AI_KEY',
    ];
    for (const key of keys) {
      expect(isKnownAiSecretKey(key)).toBe(true);
    }

    // Generic variables that are not AI keys
    expect(isKnownAiSecretKey('DATABASE_URL')).toBe(false);
    expect(isKnownAiSecretKey('PORT')).toBe(false);
    expect(isKnownAiSecretKey('NODE_ENV')).toBe(false);
  });

  it('detects process.env.GEMINI_API_KEY property access in client code', () => {
    const code = `
      'use client';
      export function ClientComponent() {
        const key = process.env.GEMINI_API_KEY;
        return <div>{key}</div>;
      }
    `;
    const diags = validateClientSourceEnv('app/client-page.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('GEMINI_API_KEY');
    expect(diags[0]?.message).toContain('Security Breach Prevention');
    expect(diags[0]?.hint).toContain('Move AI model calls to server route handlers');
  });

  it('detects import.meta.env.GROQ_API_KEY property access in client code', () => {
    const code = `
      'use client';
      const groqKey = import.meta.env.GROQ_API_KEY;
    `;
    const diags = validateClientSourceEnv('app/groq-view.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('GROQ_API_KEY');
  });

  it('detects element bracket notation process.env["ANTHROPIC_API_KEY"]', () => {
    const code = `
      'use client';
      const claudeKey = process.env['ANTHROPIC_API_KEY'];
    `;
    const diags = validateClientSourceEnv('app/chat.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('ANTHROPIC_API_KEY');
  });

  it('detects object destructuring declaration: const { OPENAI_API_KEY } = process.env', () => {
    const code = `
      'use client';
      const { OPENAI_API_KEY, RANU_PUBLIC_APP_NAME } = process.env;
    `;
    const diags = validateClientSourceEnv('app/header.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('OPENAI_API_KEY');
  });

  it('detects destructuring assignment: ({ CUSTOM_AI_KEY } = process.env)', () => {
    const code = `
      'use client';
      let CUSTOM_AI_KEY: string;
      ({ CUSTOM_AI_KEY } = process.env);
    `;
    const diags = validateClientSourceEnv('app/ollama.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('CUSTOM_AI_KEY');
  });

  it('detects nested destructuring: const { env: { MISTRAL_API_KEY } } = process', () => {
    const code = `
      'use client';
      const { env: { MISTRAL_API_KEY } } = process;
    `;
    const diags = validateClientSourceEnv('app/mistral.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_AI_SECRET_CLIENT_LEAK');
    expect(diags[0]?.message).toContain('MISTRAL_API_KEY');
  });

  it('detects aliased env pointer access: const myEnv = process.env; myEnv.CEREBRAS_API_KEY', () => {
    const code = `
      'use client';
      const myEnv = process.env;
      const key = myEnv.CEREBRAS_API_KEY;
    `;
    const diags = validateClientSourceEnv('app/fast-inference.tsx', code);
    expect(diags.some((d) => d.code === 'RANU_BUILD_AI_SECRET_CLIENT_LEAK')).toBe(true);
  });

  it('permits public AI configuration: process.env.RANU_PUBLIC_AI_MODEL', () => {
    const code = `
      'use client';
      export function ModelSelector() {
        const defaultModel = process.env.RANU_PUBLIC_AI_MODEL || 'gemini-2.5-flash';
        return <span>{defaultModel}</span>;
      }
    `;
    const diags = validateClientSourceEnv('app/selector.tsx', code);
    expect(diags.length).toBe(0);
  });
});
