import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject } from '@ranu/ai';
import {
  createCustomAI,
  custom,
  isDeepSeekR1,
  resolveBaseURL,
} from '../src/index.js';

describe('@ranu/ai-custom Model Driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CUSTOM_AI_BASE_URL'];
    delete process.env['OLLAMA_BASE_URL'];
    delete process.env['CUSTOM_AI_API_KEY'];
    delete process.env['CUSTOM_AI_KEY'];
    delete process.env['OLLAMA_API_KEY'];
    delete process.env['CUSTOM_AI_TENANT_ID'];
    delete process.env['CUSTOM_AI_ORG_ID'];
    delete process.env['CUSTOM_AI_ORGANIZATION_ID'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Model Creation & Ollama Defaults', () => {
    it('creates a custom provider with default Ollama localhost baseURL', () => {
      const provider = createCustomAI();
      expect(provider.name).toBe('custom');
      expect(resolveBaseURL(provider.config)).toBe('http://localhost:11434/v1');

      const llama = provider('llama3');
      expect(llama.provider).toBe('custom');
      expect(llama.modelId).toBe('llama3');

      const llama31 = provider.model('llama3.1');
      expect(llama31.modelId).toBe('llama3.1');

      const deepseek = provider.model('deepseek-r1');
      expect(deepseek.modelId).toBe('deepseek-r1');

      const qwen = provider.model('qwen2.5');
      expect(qwen.modelId).toBe('qwen2.5');

      const mistral = provider.model('mistral');
      expect(mistral.modelId).toBe('mistral');

      const phi3 = provider.model('phi3');
      expect(phi3.modelId).toBe('phi3');
    });

    it('creates default custom model factory instance', () => {
      const model = custom('llama3.2', { temperature: 0.5 });
      expect(model.provider).toBe('custom');
      expect(model.modelId).toBe('llama3.2');
      expect(model.settings?.temperature).toBe(0.5);
    });

    it('correctly identifies DeepSeek-R1 reasoning models', () => {
      expect(isDeepSeekR1('deepseek-r1')).toBe(true);
      expect(isDeepSeekR1('deepseek-r1:7b')).toBe(true);
      expect(isDeepSeekR1('DeepSeek-R1-Distill-Qwen-14B')).toBe(true);
      expect(isDeepSeekR1('deepseek-reasoner')).toBe(true);
      expect(isDeepSeekR1('llama3')).toBe(false);
      expect(isDeepSeekR1('mistral')).toBe(false);
      expect(isDeepSeekR1('gpt-4o')).toBe(false);
    });

    it('throws error when modelId is empty', () => {
      const provider = createCustomAI();
      expect(() => provider('')).toThrow('Model ID must be a non-empty string');
    });

    it('resolves baseURL hierarchy: config -> CUSTOM_AI_BASE_URL -> OLLAMA_BASE_URL -> default', () => {
      // 1. Default
      expect(resolveBaseURL({})).toBe('http://localhost:11434/v1');

      // 2. OLLAMA_BASE_URL
      process.env['OLLAMA_BASE_URL'] = 'http://192.168.1.50:11434/v1';
      expect(resolveBaseURL({})).toBe('http://192.168.1.50:11434/v1');

      // 3. CUSTOM_AI_BASE_URL overrides OLLAMA_BASE_URL
      process.env['CUSTOM_AI_BASE_URL'] = 'https://proxy.corp.internal/v1';
      expect(resolveBaseURL({})).toBe('https://proxy.corp.internal/v1');

      // 4. Config baseURL overrides all env vars
      expect(resolveBaseURL({ baseURL: 'https://vllm.ai.enterprise.org/v1' })).toBe(
        'https://vllm.ai.enterprise.org/v1',
      );
    });

    it('allows Ollama usage without API key without throwing', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedHeaders = init.headers;
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"Ollama response"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const provider = createCustomAI({ fetch: customFetch });
      const stream = await provider('llama3').doStream({ prompt: 'Hello Ollama' });
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(capturedUrl).toBe('http://localhost:11434/v1/chat/completions');
      expect(capturedHeaders['Authorization']).toBeUndefined();
      expect(capturedHeaders['Content-Type']).toBe('application/json');
      expect(chunks).toEqual([
        { type: 'text', text: 'Ollama response' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('Enterprise Authentication & Dynamic Headers', () => {
    it('supports static apiKey with default Bearer authorization', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: 'sk-corp-token-12345',
        fetch: customFetch,
      });

      const stream = await provider('llama3').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-corp-token-12345');
    });

    it('supports dynamic async apiKey function', async () => {
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: () => Promise.resolve('dynamic-auth-jwt-token'),
        fetch: customFetch,
      });

      const stream = await provider('qwen2.5').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer dynamic-auth-jwt-token');
    });

    it('supports monthly subscription sessionToken', async () => {
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        sessionToken: 'sess_sub_monthly_xyz987',
        fetch: customFetch,
      });

      const stream = await provider('llama3').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer sess_sub_monthly_xyz987');
    });

    it('supports custom authHeaderName and authHeaderPrefix', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: 'api-secret-key',
        authHeaderName: 'X-API-Key',
        authHeaderPrefix: 'Token ',
        fetch: customFetch,
      });

      const stream = await provider('mistral').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['X-API-Key']).toBe('Token api-secret-key');
      expect(capturedHeaders['Authorization']).toBeUndefined();
    });

    it('supports empty authHeaderPrefix (raw token)', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: 'raw-header-token',
        authHeaderName: 'x-custom-token',
        authHeaderPrefix: '',
        fetch: customFetch,
      });

      const stream = await provider('mistral').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['x-custom-token']).toBe('raw-header-token');
    });

    it('supports tenantId and organizationId enterprise headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        baseURL: 'https://vllm.gateway.corp/v1',
        apiKey: 'corp-key',
        tenantId: 'tenant-finance-team',
        organizationId: 'org-enterprise-456',
        fetch: customFetch,
      });

      const stream = await provider('llama3.1').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['x-tenant-id']).toBe('tenant-finance-team');
      expect(capturedHeaders['x-organization-id']).toBe('org-enterprise-456');
      expect(capturedHeaders['OpenAI-Organization']).toBe('org-enterprise-456');
    });

    it('resolves async custom headers and per-call options headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        headers: () => Promise.resolve({ 'X-Cluster-ID': 'us-east-1a' }),
        fetch: customFetch,
      });

      const stream = await provider('llama3').doStream({
        prompt: 'test',
        headers: { 'X-Request-Correlation': 'corr-999' },
      });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['X-Cluster-ID']).toBe('us-east-1a');
      expect(capturedHeaders['X-Request-Correlation']).toBe('corr-999');
    });

    it('falls back to environment variables for API key, tenant, and org', async () => {
      process.env['CUSTOM_AI_API_KEY'] = 'env-custom-api-key';
      process.env['CUSTOM_AI_TENANT_ID'] = 'env-tenant-id';
      process.env['CUSTOM_AI_ORG_ID'] = 'env-org-id';

      let capturedHeaders: Record<string, string> = {};
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({ fetch: customFetch });
      const stream = await provider('llama3').doStream({ prompt: 'env check' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedHeaders['Authorization']).toBe('Bearer env-custom-api-key');
      expect(capturedHeaders['x-tenant-id']).toBe('env-tenant-id');
      expect(capturedHeaders['x-organization-id']).toBe('env-org-id');
    });
  });

  describe('DeepSeek-R1 Reasoning & Content Deltas Extraction', () => {
    it('extracts reasoning_content deltas for DeepSeek-R1', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Let us analyze the problem step by step."}}]}',
        '',
        'data: {"choices":[{"delta":{"reasoning_content":" First, we consider edge cases."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"The definitive answer is 123."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":35,"total_tokens":55}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: customFetch })('deepseek-r1');

      const stream = await model.doStream({ prompt: 'Analyze edge cases' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Let us analyze the problem step by step.' },
        { type: 'reasoning', reasoning: ' First, we consider edge cases.' },
        { type: 'text', text: 'The definitive answer is 123.' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: 20,
            completionTokens: 35,
            totalTokens: 55,
          },
        },
      ]);
    });

    it('extracts reasoning field when proxy emits delta.reasoning instead of reasoning_content', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning":"Alternative reasoning field"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Answer text"}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: customFetch })('deepseek-r1');

      const stream = await model.doStream({ prompt: 'Test alternative reasoning field' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Alternative reasoning field' },
        { type: 'text', text: 'Answer text' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('Tool Calling Streaming Deltas', () => {
    it('streams tool call deltas with index tracking and arguments stitching', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_ollama_1","type":"function","function":{"name":"queryDatabase","arguments":"{\\"query\\": "}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"SELECT * FROM users\\""}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":30,"completion_tokens":25,"total_tokens":55}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: customFetch })('llama3.1');

      const stream = await model.doStream({ prompt: 'Run database query' });
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
            index: 0,
            id: 'call_ollama_1',
            name: 'queryDatabase',
            arguments: '{"query": ',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            index: 0,
            arguments: '"SELECT * FROM users"',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            index: 0,
            arguments: '}',
          },
        },
        {
          type: 'finish',
          finishReason: 'tool_calls',
          usage: {
            promptTokens: 30,
            completionTokens: 25,
            totalTokens: 55,
          },
        },
      ]);
    });
  });

  describe('Structured Outputs & JSON Mode', () => {
    it('forwards response_format: { type: "json_object" }', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{\\"status\\":\\"ok\\"}"},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createCustomAI({ fetch: customFetch })('llama3', {
        responseFormat: { type: 'json_object' },
      });

      await model.doStream({ prompt: 'Return JSON' });

      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    });

    it('forwards format: "json" for Ollama native structured output', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const model = createCustomAI({ fetch: customFetch })('llama3', {
        format: 'json',
      });

      await model.doStream({ prompt: 'Return JSON' });

      expect(capturedBody.format).toBe('json');
      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    });

    it('forwards response_format: { type: "json_schema", json_schema: ... }', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const schema = {
        type: 'object',
        properties: {
          server: { type: 'string' },
          port: { type: 'number' },
        },
        required: ['server', 'port'],
      };

      const model = createCustomAI({ fetch: customFetch })('qwen2.5', {
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'server_config',
            strict: true,
            schema,
          },
        },
      });

      await model.doStream({ prompt: 'Return config' });

      expect(capturedBody.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'server_config',
          strict: true,
          schema,
        },
      });
    });

    it('integrates seamlessly with generateObject from @ranu/ai', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"{\\"engine\\":\\"vLLM\\",\\"tokensPerSec\\":180}"},"finish_reason":"stop"}]}\n\n' +
          'data: [DONE]\n\n',
          { status: 200 },
        ),
      );

      const model = createCustomAI({ fetch: customFetch })('llama3');

      const testSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { engine: string; tokensPerSec: number };
            if (typeof v?.engine === 'string' && typeof v?.tokensPerSec === 'number') {
              return { value: v };
            }
            return { issues: [{ message: 'Schema mismatch' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: testSchema,
        prompt: 'Benchmark results',
      });

      expect(result.object).toEqual({ engine: 'vLLM', tokensPerSec: 180 });
      expect(result.rawText).toBe('{"engine":"vLLM","tokensPerSec":180}');
    });
  });

  describe('Integration with streamAI', () => {
    it('integrates seamlessly with streamAI W3C streaming kernel', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Custom "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Driver"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: customFetch })('llama3');

      const response = await streamAI({
        model,
        prompt: 'Check streaming',
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('data: {"text":"Custom "}');
      expect(text).toContain('data: {"text":"Driver"}');
      expect(text).toContain('data: {"finishReason":"stop"}');
    });
  });

  describe('Error Handling & AbortSignal Cancellation', () => {
    it('handles HTTP 401 Unauthorized API error', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized: Invalid bearer token', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = createCustomAI({ apiKey: 'invalid', fetch: customFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 401 Unauthorized: Unauthorized: Invalid bearer token/i,
      );
    });

    it('handles HTTP 404 Not Found error', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Model "unknown-model" not found', {
          status: 404,
          statusText: 'Not Found',
        }),
      );

      const model = createCustomAI({ fetch: customFetch })('unknown-model');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 404 Not Found: Model "unknown-model" not found/i,
      );
    });

    it('handles HTTP 500 Internal Server Error', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Internal server error in vLLM cluster', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      const model = createCustomAI({ fetch: customFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 500 Internal Server Error/i,
      );
    });

    it('throws error when response body is null', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const model = createCustomAI({ fetch: customFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(/empty response body/i);
    });

    it('rejects immediately when AbortSignal is pre-aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Pre-aborted signal'));

      const customFetch = vi.fn();
      const model = createCustomAI({ fetch: customFetch })('llama3');

      await expect(
        model.doStream({ prompt: 'test', signal: controller.signal }),
      ).rejects.toThrow('Pre-aborted signal');

      expect(customFetch).not.toHaveBeenCalled();
    });

    it('propagates AbortSignal to fetch and cancels reader cleanly', async () => {
      const controller = new AbortController();
      let capturedSignal: AbortSignal | undefined;

      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedSignal = init.signal;
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createCustomAI({ fetch: customFetch })('llama3');
      const stream = await model.doStream({ prompt: 'test', signal: controller.signal });
      expect(capturedSignal).toBe(controller.signal);

      const reader = stream.getReader();
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'First chunk' });

      // Cancel stream
      await reader.cancel('Client disconnected');
    });
  });
});
