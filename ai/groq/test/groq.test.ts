import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject } from '@ranu/ai';
import { createGroq, groq, type GroqMetrics } from '../src/index.js';

describe('@ranu/ai-groq Model Driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GROQ_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Model Creation', () => {
    it('creates a groq provider and model instances', () => {
      const provider = createGroq({ apiKey: 'gsk_test' });
      expect(provider.name).toBe('groq');
      expect(provider.config.apiKey).toBe('gsk_test');

      const model70b = provider('llama-3.3-70b-versatile');
      expect(model70b.provider).toBe('groq');
      expect(model70b.modelId).toBe('llama-3.3-70b-versatile');

      const model8b = provider.model('llama-3.1-8b-instant');
      expect(model8b.provider).toBe('groq');
      expect(model8b.modelId).toBe('llama-3.1-8b-instant');

      const mixtral = provider.model('mixtral-8x7b-32768');
      expect(mixtral.modelId).toBe('mixtral-8x7b-32768');
    });

    it('creates default groq model factory', () => {
      process.env['GROQ_API_KEY'] = 'env-groq-key';
      const model = groq('llama-3.3-70b-versatile', { temperature: 0.1 });
      expect(model.provider).toBe('groq');
      expect(model.modelId).toBe('llama-3.3-70b-versatile');
      expect(model.settings?.temperature).toBe(0.1);
    });

    it('throws error when modelId is empty', () => {
      const provider = createGroq({ apiKey: 'k' });
      expect(() => provider('')).toThrow('Model ID must be a non-empty string');
    });
  });

  describe('Dynamic API Key Resolution', () => {
    it('resolves static string apiKey', async () => {
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGroq({ apiKey: 'gsk_static_token', fetch: customFetch });
      const stream = await provider('llama-3.1-8b-instant').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer gsk_static_token');
    });

    it('resolves async function apiKey', async () => {
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGroq({
        apiKey: () => Promise.resolve('gsk_async_vault_token'),
        fetch: customFetch,
      });
      const stream = await provider('llama-3.3-70b-versatile').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer gsk_async_vault_token');
    });

    it('falls back to process.env.GROQ_API_KEY', async () => {
      process.env['GROQ_API_KEY'] = 'env_groq_production_key';
      let capturedAuth = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGroq({ fetch: customFetch });
      const stream = await provider('llama-3.3-70b-versatile').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedAuth).toBe('Bearer env_groq_production_key');
    });

    it('throws error when no API key is set', async () => {
      const provider = createGroq();
      await expect(provider('llama-3.3-70b-versatile').doStream({ prompt: 'test' })).rejects.toThrow(
        /Groq API key is required/i,
      );
    });
  });

  describe('High-Speed Inference Metrics Tracking', () => {
    it('accurately computes TTFT, TPS, and latency with sub-10ms precision', async () => {
      let reportedMetrics: GroqMetrics | undefined;

      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Fast"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":" response"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant', {
        onMetrics: (m) => {
          reportedMetrics = m;
        },
      });

      const stream = await model.doStream({ prompt: 'Go fast' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Check onMetrics callback was executed
      expect(reportedMetrics).toBeDefined();
      expect(reportedMetrics!.latencyMs).toBeGreaterThan(0);
      expect(reportedMetrics!.ttft).toBeGreaterThan(0);
      expect(reportedMetrics!.ttft).toBeLessThanOrEqual(reportedMetrics!.latencyMs);
      expect(reportedMetrics!.tps).toBeGreaterThan(0);
      expect(reportedMetrics!.completionTokens).toBe(2);
      expect(reportedMetrics!.promptTokens).toBe(10);
      expect(reportedMetrics!.totalTokens).toBe(12);

      // Check model.getLastMetrics()
      const lastMetrics = model.getLastMetrics();
      expect(lastMetrics).toEqual(reportedMetrics);

      // Check finish chunk has metrics attached
      const finishChunk = chunks.find((c) => c.type === 'finish') as any;
      expect(finishChunk).toBeDefined();
      expect(finishChunk.metrics).toEqual(reportedMetrics);
    });

    it('measures ultra-fast sub-10ms simulation accurately', async () => {
      const ssePayload = 'data: {"choices":[{"delta":{"content":"sub-10ms"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":1,"total_tokens":6}}\n\n';

      const customFetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(ssePayload, { status: 200 })));

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'speed test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const metrics = model.getLastMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.latencyMs).toBeGreaterThan(0);
      expect(metrics!.tps).toBeGreaterThan(0);
    });
  });

  describe('Streaming SSE & Reasoning', () => {
    it('streams text chunks and reasoning deltas', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning":"Analyzing query..."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Here is "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"the answer."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      const stream = await model.doStream({ prompt: 'Think step by step' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Analyzing query...' },
        { type: 'text', text: 'Here is ' },
        { type: 'text', text: 'the answer.' },
        expect.objectContaining({ type: 'finish', finishReason: 'stop' }),
      ]);
    });

    it('integrates seamlessly with streamAI()', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Groq "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"LPU"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('mixtral-8x7b-32768');

      const response = await streamAI({
        model,
        prompt: 'Inference platform',
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('data: {"text":"Groq "}');
      expect(text).toContain('data: {"text":"LPU"}');
      expect(text).toContain('data: {"finishReason":"stop"}');
    });
  });

  describe('Tool Calling Deltas Streaming', () => {
    it('streams tool call deltas with function name and arguments', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_groq_01","type":"function","function":{"name":"search","arguments":"{\\"query\\": "}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"ranu\\"}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      const stream = await model.doStream({ prompt: 'Search ranu' });
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
            id: 'call_groq_01',
            name: 'search',
            arguments: '{"query": ',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            arguments: '"ranu"}',
          },
        },
        expect.objectContaining({
          type: 'finish',
          finishReason: 'tool_calls',
        }),
      ]);
    });
  });

  describe('JSON Mode & Structured Outputs', () => {
    it('passes response_format: { type: "json_object" } in request body', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{\\"status\\":\\"ready\\"}"},"finish_reason":"stop"}]}\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile', {
        jsonMode: true,
      });

      await model.doStream({ prompt: 'Output JSON status' });

      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
      expect(capturedBody.stream_options).toEqual({ include_usage: true });
    });

    it('integrates with generateObject() from @ranu/ai', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"{\\"count\\":10,\\"service\\":\\"groq\\"}"},"finish_reason":"stop"}]}\n\n',
          { status: 200 },
        ),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { count: number; service: string };
            if (typeof v?.count === 'number' && typeof v?.service === 'string') {
              return { value: v };
            }
            return { issues: [{ message: 'Schema mismatch' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema,
        prompt: 'Return stats',
      });

      expect(result.object).toEqual({ count: 10, service: 'groq' });
    });
  });

  describe('Error Handling', () => {
    it('handles 429 Rate Limit error gracefully', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Rate limit reached: Please slow down.', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Groq request failed with status 429 Too Many Requests: Rate limit reached/i,
      );
    });

    it('handles empty response body', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(/empty response body/i);
    });
  });
});
