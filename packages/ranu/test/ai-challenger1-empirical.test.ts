import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 1. Source subpath imports
import * as aiSource from '../src/ai.js';
import * as geminiSource from '../src/ai/gemini.js';
import * as groqSource from '../src/ai/groq.js';
import * as claudeSource from '../src/ai/claude.js';
import * as openaiSource from '../src/ai/openai.js';
import * as customSource from '../src/ai/custom.js';

// 2. Built artifact dynamic imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

describe('Empirical Challenge 1 (PR #251): AI Subpath Exports & Provider Contract Adherence', () => {

  describe('Section 1: Zero Undefined Exports and Module Integrity', () => {
    const modules = [
      { name: 'ranu/ai', mod: aiSource },
      { name: 'ranu/ai/gemini', mod: geminiSource },
      { name: 'ranu/ai/groq', mod: groqSource },
      { name: 'ranu/ai/claude', mod: claudeSource },
      { name: 'ranu/ai/openai', mod: openaiSource },
      { name: 'ranu/ai/custom', mod: customSource },
    ];

    for (const { name, mod } of modules) {
      it(`asserts ${name} exports are non-empty and contains zero undefined exports`, () => {
        const exportKeys = Object.keys(mod);
        expect(exportKeys.length).toBeGreaterThan(0);
        for (const key of exportKeys) {
          expect((mod as Record<string, unknown>)[key], `Export "${key}" in ${name} must not be undefined`).toBeDefined();
        }
      });
    }

    it('verifies all 6 built dist artifacts export identical keys without undefined exports', async () => {
      const builtModules = [
        { name: 'dist/ai.js', path: path.join(distDir, 'ai.js'), expected: aiSource },
        { name: 'dist/ai/gemini.js', path: path.join(distDir, 'ai/gemini.js'), expected: geminiSource },
        { name: 'dist/ai/groq.js', path: path.join(distDir, 'ai/groq.js'), expected: groqSource },
        { name: 'dist/ai/claude.js', path: path.join(distDir, 'ai/claude.js'), expected: claudeSource },
        { name: 'dist/ai/openai.js', path: path.join(distDir, 'ai/openai.js'), expected: openaiSource },
        { name: 'dist/ai/custom.js', path: path.join(distDir, 'ai/custom.js'), expected: customSource },
      ];

      for (const { name, path: modPath, expected } of builtModules) {
        const built = await import(modPath);
        const expectedKeys = Object.keys(expected).sort();
        const builtKeys = Object.keys(built).filter((k) => k !== 'default').sort();

        expect(builtKeys, `Built ${name} must export same symbols as source`).toEqual(expectedKeys);
        for (const key of builtKeys) {
          expect(built[key], `Export "${key}" in ${name} must not be undefined`).toBeDefined();
        }
      }
    });
  });

  describe('Section 2: Provider and Model Instantiation Contracts', () => {
    describe('Gemini Provider', () => {
      it('instantiates via createGemini() and gemini() conforming to model contracts', () => {
        const provider = geminiSource.createGemini({ apiKey: 'empirical-gemini-key' });
        expect(provider.name).toBe('gemini');

        const modelFromProvider = provider('gemini-1.5-flash');
        expect(modelFromProvider.provider).toBe('gemini');
        expect(modelFromProvider.modelId).toBe('gemini-1.5-flash');
        expect(typeof modelFromProvider.doStream).toBe('function');
        expect(modelFromProvider).toHaveProperty('settings');

        const directModel = geminiSource.gemini('gemini-1.5-pro', {
          apiKey: 'empirical-gemini-key',
          temperature: 0.5,
        });
        expect(directModel.provider).toBe('gemini');
        expect(directModel.modelId).toBe('gemini-1.5-pro');
        expect(typeof directModel.doStream).toBe('function');
        expect(directModel.settings).toEqual({ apiKey: 'empirical-gemini-key', temperature: 0.5 });

        // Empirical check for streamChatCompletions vs doStream contract
        expect((modelFromProvider as any).streamChatCompletions).toBeUndefined();
      });
    });

    describe('Groq Provider', () => {
      it('instantiates via createGroq() and groq() conforming to model contracts', () => {
        const provider = groqSource.createGroq({ apiKey: 'empirical-groq-key' });
        expect(provider.name).toBe('groq');

        const modelFromProvider = provider('llama-3.3-70b-versatile');
        expect(modelFromProvider.provider).toBe('groq');
        expect(modelFromProvider.modelId).toBe('llama-3.3-70b-versatile');
        expect(typeof modelFromProvider.doStream).toBe('function');
        expect(modelFromProvider).toHaveProperty('settings');

        const directModel = groqSource.groq('mixtral-8x7b-32768', {
          apiKey: 'empirical-groq-key',
          temperature: 0.2,
        });
        expect(directModel.provider).toBe('groq');
        expect(directModel.modelId).toBe('mixtral-8x7b-32768');
        expect(typeof directModel.doStream).toBe('function');
        expect(directModel.settings).toEqual({ apiKey: 'empirical-groq-key', temperature: 0.2 });

        expect((modelFromProvider as any).streamChatCompletions).toBeUndefined();
      });
    });

    describe('Claude Provider', () => {
      it('instantiates via createClaude() and claude() conforming to model contracts', () => {
        const provider = claudeSource.createClaude({ apiKey: 'empirical-claude-key' });
        expect(provider.name).toBe('claude');

        const modelFromProvider = provider('claude-3-5-sonnet-20241022');
        expect(modelFromProvider.provider).toBe('claude');
        expect(modelFromProvider.modelId).toBe('claude-3-5-sonnet-20241022');
        expect(typeof modelFromProvider.doStream).toBe('function');
        expect(modelFromProvider).toHaveProperty('settings');

        const directModel = claudeSource.claude('claude-3-5-haiku-20241022', {
          apiKey: 'empirical-claude-key',
        });
        expect(directModel.provider).toBe('claude');
        expect(directModel.modelId).toBe('claude-3-5-haiku-20241022');
        expect(typeof directModel.doStream).toBe('function');

        expect((modelFromProvider as any).streamChatCompletions).toBeUndefined();
      });
    });

    describe('OpenAI Provider', () => {
      it('instantiates via createOpenAI() and openai() conforming to model contracts', () => {
        const provider = openaiSource.createOpenAI({ apiKey: 'empirical-openai-key' });
        expect(provider.name).toBe('openai');

        const modelFromProvider = provider('gpt-4o');
        expect(modelFromProvider.provider).toBe('openai');
        expect(modelFromProvider.modelId).toBe('gpt-4o');
        expect(typeof modelFromProvider.doStream).toBe('function');
        expect(modelFromProvider).toHaveProperty('settings');

        const directModel = openaiSource.openai('gpt-4o-mini', {
          apiKey: 'empirical-openai-key',
        });
        expect(directModel.provider).toBe('openai');
        expect(directModel.modelId).toBe('gpt-4o-mini');
        expect(typeof directModel.doStream).toBe('function');

        expect(openaiSource.isReasoningModel('o1-mini')).toBe(true);
        expect(openaiSource.isReasoningModel('gpt-4o')).toBe(false);

        expect((modelFromProvider as any).streamChatCompletions).toBeUndefined();
      });
    });

    describe('Custom AI Provider', () => {
      it('instantiates via createCustomAI() and custom() conforming to model contracts', () => {
        const provider = customSource.createCustomAI({
          baseURL: 'http://localhost:11434/v1',
          apiKey: 'ollama',
        });
        expect(provider.name).toBe('custom');

        const modelFromProvider = provider('llama3');
        expect(modelFromProvider.provider).toBe('custom');
        expect(modelFromProvider.modelId).toBe('llama3');
        expect(typeof modelFromProvider.doStream).toBe('function');
        expect(modelFromProvider).toHaveProperty('settings');

        const directModel = customSource.custom('deepseek-r1:8b', {
          temperature: 0.6,
        });
        expect(directModel.provider).toBe('custom');
        expect(directModel.modelId).toBe('deepseek-r1:8b');
        expect(typeof directModel.doStream).toBe('function');

        expect(customSource.isDeepSeekR1('deepseek-r1:8b')).toBe(true);
        expect(customSource.isDeepSeekR1('llama3')).toBe(false);

        expect((modelFromProvider as any).streamChatCompletions).toBeUndefined();
      });
    });
  });

  describe('Section 3: streamAI and generateObject Integration with Model Drivers', () => {
    it('executes streamAI with Gemini driver and streams response chunks', async () => {
      const mockSSE = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini!"}]}}]}\n\n',
        'data: {"candidates":[{"finishReason":"STOP","content":{"parts":[]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":4,"totalTokenCount":9}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const geminiProvider = geminiSource.createGemini({
        apiKey: 'test-key',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = geminiProvider('gemini-1.5-flash');

      const response = await aiSource.streamAI({
        model,
        prompt: 'Say hello',
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toContain('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        text += decoder.decode(value);
      }

      expect(text).toContain('Hello from Gemini!');
      expect(text).toContain('event: finish');
      expect(text).toContain('data: [DONE]');
      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    it('executes streamAI with Groq driver and streams response chunks', async () => {
      const mockSSE = [
        'data: {"choices":[{"delta":{"content":"Ultra fast Groq"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":3,"completion_tokens":3,"total_tokens":6}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const groqProvider = groqSource.createGroq({
        apiKey: 'test-groq-key',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = groqProvider('llama-3.3-70b-versatile');

      const response = await aiSource.streamAI({
        model,
        prompt: 'Fast response please',
      });

      expect(response).toBeInstanceOf(Response);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value);
      }

      expect(accumulated).toContain('Ultra fast Groq');
      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    it('executes streamAI with Claude driver and streams response chunks', async () => {
      const mockSSE = [
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello Claude"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const claudeProvider = claudeSource.createClaude({
        apiKey: 'test-claude-key',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = claudeProvider('claude-3-5-sonnet-20241022');

      const response = await aiSource.streamAI({
        model,
        prompt: 'Hello',
      });

      expect(response).toBeInstanceOf(Response);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }

      expect(text).toContain('Hello Claude');
    });

    it('executes streamAI with OpenAI driver and streams response chunks', async () => {
      const mockSSE = [
        'data: {"choices":[{"delta":{"content":"Hello OpenAI"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const openaiProvider = openaiSource.createOpenAI({
        apiKey: 'test-openai-key',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = openaiProvider('gpt-4o');

      const response = await aiSource.streamAI({
        model,
        prompt: 'Say hi',
      });

      expect(response).toBeInstanceOf(Response);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }

      expect(text).toContain('Hello OpenAI');
    });

    it('executes streamAI with Custom/Ollama driver and streams response chunks', async () => {
      const mockSSE = [
        'data: {"choices":[{"delta":{"content":"Ollama response"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const customProvider = customSource.createCustomAI({
        baseURL: 'http://localhost:11434/v1',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = customProvider('llama3');

      const response = await aiSource.streamAI({
        model,
        prompt: 'Local inference',
      });

      expect(response).toBeInstanceOf(Response);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }

      expect(text).toContain('Ollama response');
    });

    it('executes generateObject with OpenAI driver and Standard-Schema validation', async () => {
      const mockSSE = [
        'data: {"choices":[{"delta":{"content":"{\\"title\\":\\"Ranu Framework\\",\\"stars\\":100}"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const openaiProvider = openaiSource.createOpenAI({
        apiKey: 'test-openai-key',
        fetch: customFetch as unknown as typeof fetch,
      });
      const model = openaiProvider('gpt-4o');

      // Standard-Schema v1 compliant mock schema
      interface ProjectInfo {
        title: string;
        stars: number;
      }

      const standardSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test-validator',
          validate: (val: unknown) => {
            const obj = val as Record<string, unknown>;
            if (typeof obj?.title === 'string' && typeof obj?.stars === 'number') {
              return { value: { title: obj.title, stars: obj.stars } as ProjectInfo };
            }
            return { issues: [{ message: 'Invalid project info' }] };
          },
        },
      };

      const result = await aiSource.generateObject<ProjectInfo>({
        model,
        prompt: 'Return project info as JSON',
        schema: standardSchema,
      });

      expect(result.object).toEqual({
        title: 'Ranu Framework',
        stars: 100,
      });
      expect(result.rawText).toContain('"title":"Ranu Framework"');
    });

    it('rejects generateObject with AIValidationError on malformed JSON or schema violation', async () => {
      const mockSSE = [
        'data: {"choices":[{"delta":{"content":"{\\"badField\\":true}"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(mockSSE, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const model = openaiSource.createOpenAI({
        apiKey: 'test-openai-key',
        fetch: customFetch as unknown as typeof fetch,
      })('gpt-4o');

      const strictSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test-validator',
          validate: () => ({
            issues: [{ message: 'Field "expectedField" is required' }],
          }),
        },
      };

      await expect(
        aiSource.generateObject({
          model,
          prompt: 'Bad output test',
          schema: strictSchema,
        }),
      ).rejects.toThrow(aiSource.AIValidationError);
    });
  });

  describe('Section 4: Node.js Multi-Subpath Independent Resolution via Child Process', () => {
    it('imports all 6 built subpaths independently in clean Node.js ESM execution', () => {
      const nodeScript = [
        'import * as ai from "./dist/ai.js";',
        'import * as gemini from "./dist/ai/gemini.js";',
        'import * as groq from "./dist/ai/groq.js";',
        'import * as claude from "./dist/ai/claude.js";',
        'import * as openai from "./dist/ai/openai.js";',
        'import * as custom from "./dist/ai/custom.js";',
        'const checks = [',
        '  typeof ai.streamAI === "function",',
        '  typeof gemini.createGemini === "function",',
        '  typeof groq.createGroq === "function",',
        '  typeof claude.createClaude === "function",',
        '  typeof openai.createOpenAI === "function",',
        '  typeof custom.createCustomAI === "function",',
        '];',
        'if (checks.every(Boolean)) {',
        '  console.log("CHALLENGER_NODE_IMPORT_ALL_PASSED");',
        '  process.exit(0);',
        '} else {',
        '  process.exit(1);',
        '}',
      ].join(' ');

      const ranuDir = path.resolve(__dirname, '..');
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', nodeScript],
        { cwd: ranuDir, encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('CHALLENGER_NODE_IMPORT_ALL_PASSED');
    });
  });

  describe('Section 5: Adversarial Stress Tests & Failure Mode Analysis', () => {
    it('throws when modelId is empty or non-string across all providers', () => {
      const gProvider = geminiSource.createGemini({ apiKey: 'k' });
      expect(() => (gProvider as any)('')).toThrow();
      expect(() => (gProvider as any)(null)).toThrow();

      const qProvider = groqSource.createGroq({ apiKey: 'k' });
      expect(() => (qProvider as any)('')).toThrow();
      expect(() => (qProvider as any)(undefined)).toThrow();

      const cProvider = claudeSource.createClaude({ apiKey: 'k' });
      expect(() => (cProvider as any)('')).toThrow();

      const oProvider = openaiSource.createOpenAI({ apiKey: 'k' });
      expect(() => (oProvider as any)('')).toThrow();

      const uProvider = customSource.createCustomAI();
      expect(() => (uProvider as any)('')).toThrow();
    });

    it('handles HTTP error responses (401, 500) gracefully through doStream', async () => {
      const errorFetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized: Invalid API key', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = openaiSource.createOpenAI({
        apiKey: 'bad-key',
        fetch: errorFetch as unknown as typeof fetch,
      })('gpt-4o');

      await expect(
        aiSource.streamAI({
          model,
          prompt: 'fail test',
        }),
      ).rejects.toThrow(/Unauthorized/i);
    });

    it('propagates AbortSignal cancellation immediately to stream and fetch', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        if (init?.signal?.aborted) {
          throw new DOMException('The user aborted a request.', 'AbortError');
        }
        return new Promise(() => {});
      });

      const model = geminiSource.createGemini({
        apiKey: 'k',
        fetch: mockFetch as unknown as typeof fetch,
      })('gemini-1.5-flash');

      await expect(
        aiSource.streamAI({
          model,
          prompt: 'aborted test',
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it('survives high concurrency: executes 50 parallel streamAI requests across all 5 providers', async () => {
      const makeMockFetch = (providerText: string) => {
        return vi.fn().mockImplementation(async () => {
          const sse = `data: {"choices":[{"delta":{"content":"${providerText}"}}]}\n\ndata: [DONE]\n\n`;
          return new Response(sse, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          });
        });
      };

      const providers = [
        openaiSource.createOpenAI({ apiKey: 'k', fetch: makeMockFetch('openai-resp') as any })('gpt-4o'),
        groqSource.createGroq({ apiKey: 'k', fetch: makeMockFetch('groq-resp') as any })('llama-3.3-70b-versatile'),
        customSource.createCustomAI({ baseURL: 'http://localhost:11434/v1', fetch: makeMockFetch('custom-resp') as any })('llama3'),
      ];

      const tasks = Array.from({ length: 50 }, async (_, i) => {
        const model = providers[i % providers.length]!;
        const res = await aiSource.streamAI({
          model,
          prompt: `concurrent-${i}`,
        });
        expect(res.status).toBe(200);
        const reader = res.body!.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      });

      await expect(Promise.all(tasks)).resolves.toHaveLength(50);
    });
  });
});
