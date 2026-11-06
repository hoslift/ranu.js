import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject } from '@ranu/ai';
import { createOpenAI, openai, isReasoningModel } from '../src/index.js';

describe('@ranu/ai-openai Model Driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_ORG_ID'];
    delete process.env['OPENAI_ORGANIZATION'];
    delete process.env['OPENAI_PROJECT_ID'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Model Creation & Helpers', () => {
    it('creates an openai provider and model instances', () => {
      const provider = createOpenAI({ apiKey: 'sk-proj-test' });
      expect(provider.name).toBe('openai');
      expect(provider.config.apiKey).toBe('sk-proj-test');

      const gpt4o = provider('gpt-4o');
      expect(gpt4o.provider).toBe('openai');
      expect(gpt4o.modelId).toBe('gpt-4o');

      const gpt4oMini = provider.model('gpt-4o-mini');
      expect(gpt4oMini.modelId).toBe('gpt-4o-mini');

      const o1 = provider.model('o1');
      expect(o1.modelId).toBe('o1');

      const o3Mini = provider.model('o3-mini');
      expect(o3Mini.modelId).toBe('o3-mini');
    });

    it('creates default openai model factory', () => {
      process.env['OPENAI_API_KEY'] = 'sk-proj-env';
      const model = openai('gpt-4o', { temperature: 0.7 });
      expect(model.provider).toBe('openai');
      expect(model.modelId).toBe('gpt-4o');
      expect(model.settings?.temperature).toBe(0.7);
    });

    it('correctly identifies reasoning models', () => {
      expect(isReasoningModel('o1')).toBe(true);
      expect(isReasoningModel('o1-mini')).toBe(true);
      expect(isReasoningModel('o1-preview')).toBe(true);
      expect(isReasoningModel('o3-mini')).toBe(true);
      expect(isReasoningModel('gpt-4o')).toBe(false);
      expect(isReasoningModel('gpt-4o-mini')).toBe(false);
      expect(isReasoningModel('claude-3-5-sonnet')).toBe(false);
    });

    it('throws error when modelId is empty', () => {
      const provider = createOpenAI({ apiKey: 'k' });
      expect(() => provider('')).toThrow('Model ID must be a non-empty string');
    });
  });

  describe('Dynamic API Key, Organization & Project Headers', () => {
    it('resolves static string apiKey and custom organization / project headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const provider = createOpenAI({
        apiKey: 'sk-static-key',
        organization: 'org-ranu-dev',
        project: 'proj-ranu-123',
        fetch: customFetch,
      });

      const stream = await provider('gpt-4o-mini').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-static-key');
      expect(capturedHeaders['OpenAI-Organization']).toBe('org-ranu-dev');
      expect(capturedHeaders['OpenAI-Project']).toBe('proj-ranu-123');
    });

    it('resolves async function apiKey', async () => {
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(
          new Response('data: [DONE]\n\n', { status: 200 }),
        );
      });

      const provider = createOpenAI({
        apiKey: () => Promise.resolve('sk-dynamic-token'),
        fetch: customFetch,
      });

      const stream = await provider('gpt-4o').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer sk-dynamic-token');
    });

    it('falls back to process.env.OPENAI_API_KEY, OPENAI_ORG_ID, and OPENAI_PROJECT_ID', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-env-production-key';
      process.env['OPENAI_ORG_ID'] = 'org-env-999';
      process.env['OPENAI_PROJECT_ID'] = 'proj-env-888';

      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createOpenAI({ fetch: customFetch });
      const stream = await provider('gpt-4o').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-env-production-key');
      expect(capturedHeaders['OpenAI-Organization']).toBe('org-env-999');
      expect(capturedHeaders['OpenAI-Project']).toBe('proj-env-888');
    });

    it('throws error when no API key is provided', async () => {
      const provider = createOpenAI();
      await expect(provider('gpt-4o').doStream({ prompt: 'test' })).rejects.toThrow(
        /OpenAI API key is required/i,
      );
    });
  });

  describe('Reasoning Models (o1, o1-mini, o3-mini)', () => {
    it('maps maxTokens to max_completion_tokens and sets reasoning_effort', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"reasoning_content":"Thinking deeply..."}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":"Answer: 42"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('o3-mini', {
        maxTokens: 2000,
        reasoningEffort: 'high',
        temperature: 0.5, // should be omitted for reasoning models
      });

      const stream = await model.doStream({ prompt: 'Solve puzzle' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(capturedBody.model).toBe('o3-mini');
      expect(capturedBody.max_completion_tokens).toBe(2000);
      expect(capturedBody.max_tokens).toBeUndefined();
      expect(capturedBody.reasoning_effort).toBe('high');
      expect(capturedBody.temperature).toBeUndefined();

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Thinking deeply...' },
        { type: 'text', text: 'Answer: 42' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('handles o1 model without temperature or penalties', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('o1', {
        maxTokens: 5000,
        reasoningEffort: 'medium',
      });

      await model.doStream({ prompt: 'Complex task' });

      expect(capturedBody.max_completion_tokens).toBe(5000);
      expect(capturedBody.reasoning_effort).toBe('medium');
      expect(capturedBody.temperature).toBeUndefined();
      expect(capturedBody.top_p).toBeUndefined();
      expect(capturedBody.presence_penalty).toBeUndefined();
    });
  });

  describe('Standard Models & Parameter Mapping (gpt-4o)', () => {
    it('correctly maps standard parameters: max_tokens, temperature, top_p, penalties', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o', {
        maxTokens: 1024,
        temperature: 0.8,
        topP: 0.95,
        frequencyPenalty: 0.5,
        presencePenalty: 0.2,
      });

      await model.doStream({ prompt: 'Write poem' });

      expect(capturedBody.max_tokens).toBe(1024);
      expect(capturedBody.max_completion_tokens).toBeUndefined();
      expect(capturedBody.temperature).toBe(0.8);
      expect(capturedBody.top_p).toBe(0.95);
      expect(capturedBody.frequency_penalty).toBe(0.5);
      expect(capturedBody.presence_penalty).toBe(0.2);
    });
  });

  describe('Structured Outputs (json_schema mode)', () => {
    it('sets response_format with json_schema and strict: true', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{\\"user\\":\\"Ranu\\",\\"score\\":100}"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const schema = {
        type: 'object',
        properties: {
          user: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['user', 'score'],
        additionalProperties: false,
      };

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o', {
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'user_score',
            strict: true,
            schema,
          },
        },
      });

      await model.doStream({ prompt: 'Return user score' });

      expect(capturedBody.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'user_score',
          strict: true,
          schema,
        },
      });
    });

    it('integrates seamlessly with generateObject from @ranu/ai', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"{\\"framework\\":\\"Ranu.js\\",\\"speed\\":\\"ultra-fast\\"}"},"finish_reason":"stop"}]}\n\n' +
          'data: [DONE]\n\n',
          { status: 200 },
        ),
      );

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o-mini');

      const testSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { framework: string; speed: string };
            if (typeof v?.framework === 'string' && typeof v?.speed === 'string') {
              return { value: v };
            }
            return { issues: [{ message: 'Schema mismatch' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: testSchema,
        prompt: 'Framework details',
      });

      expect(result.object).toEqual({ framework: 'Ranu.js', speed: 'ultra-fast' });
      expect(result.rawText).toBe('{"framework":"Ranu.js","speed":"ultra-fast"}');
    });
  });

  describe('Tool Calling Deltas Streaming', () => {
    it('streams tool call deltas with index tracking and arguments stitching', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_open_1","type":"function","function":{"name":"fetchData","arguments":"{\\"id\\": "}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"123}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":15,"completion_tokens":10,"total_tokens":25}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o');

      const stream = await model.doStream({ prompt: 'Fetch 123' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        {
          type: 'tool-call',
          toolCall: {
            id: 'call_open_1',
            name: 'fetchData',
            arguments: '{"id": ',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            arguments: '123}',
          },
        },
        {
          type: 'finish',
          finishReason: 'tool_calls',
          usage: {
            promptTokens: 15,
            completionTokens: 10,
            totalTokens: 25,
          },
        },
      ]);
    });
  });

  describe('Integration with streamAI & Error Handling', () => {
    it('integrates seamlessly with streamAI W3C streaming kernel', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"OpenAI "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Integration"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o');

      const response = await streamAI({
        model,
        prompt: 'Check streaming',
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('data: {"text":"OpenAI "}');
      expect(text).toContain('data: {"text":"Integration"}');
      expect(text).toContain('data: {"finishReason":"stop"}');
    });

    it('handles 401 Unauthorized API error', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Incorrect API key provided', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = createOpenAI({ apiKey: 'wrong-key', fetch: customFetch })('gpt-4o');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /OpenAI request failed with status 401 Unauthorized: Incorrect API key provided/i,
      );
    });

    it('throws error when response body is null', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const model = createOpenAI({ apiKey: 'k', fetch: customFetch })('gpt-4o');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(/empty response body/i);
    });
  });
});
