/**
 * Empirical Challenge & Stress Test Suite for @ranu/ai-groq.
 *
 * Verifies:
 * 1. Latency measurement accuracy (sub-10ms precision, TTFT, TPS under rapid & delayed emission)
 * 2. Tool calling streaming (multi-tool argument deltas, index tracking, function call reconstruction)
 * 3. JSON mode (response_format: { type: 'json_object' }) and structured output extraction
 * 4. Concurrency stress (60+ simultaneous requests, zero metric cross-talk or race conditions)
 * 5. Network failure resilience (HTTP 401, 429, 503, mid-stream connection abort & disconnect)
 * 6. Integration with core @ranu/ai functions (streamAI and generateObject)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamAI,
  generateObject,
  AIValidationError,
  type AIChunk,
  type StandardSchemaV1,
} from '@ranu/ai';
import { createGroq, groq, type GroqMetrics } from '../src/index.js';

// --- Test Helpers ---

function createByteStreamResponse(
  chunks: (string | Uint8Array)[],
  options?: { delayMs?: number; chunkDelaysMs?: number[] },
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < chunks.length; i++) {
        const item = chunks[i]!;
        const delay = options?.chunkDelaysMs?.[i] ?? options?.delayMs;
        if (delay && delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        const bytes = typeof item === 'string' ? encoder.encode(item) : item;
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collectChunks(stream: ReadableStream<AIChunk>): Promise<AIChunk[]> {
  const reader = stream.getReader();
  const chunks: AIChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return chunks;
}

interface ReconstructedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function reconstructToolCalls(chunks: AIChunk[]): ReconstructedToolCall[] {
  const calls: ReconstructedToolCall[] = [];
  let current: ReconstructedToolCall | null = null;

  for (const chunk of chunks) {
    if (chunk.type === 'tool-call' && chunk.toolCall) {
      if (chunk.toolCall.id && chunk.toolCall.name) {
        current = {
          id: chunk.toolCall.id,
          name: chunk.toolCall.name,
          arguments: chunk.toolCall.arguments ?? '',
        };
        calls.push(current);
      } else if (current && chunk.toolCall.arguments) {
        current.arguments += chunk.toolCall.arguments;
      }
    }
  }

  return calls;
}

describe('@ranu/ai-groq Empirical Stress & Challenge Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GROQ_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Latency Measurement Accuracy (sub-10ms, TTFT, TPS, Rapid/Delayed)
  // =========================================================================
  describe('1. Latency Measurement Accuracy & Edge Cases', () => {
    it('1.1 Sub-10ms inference detection: captures microsecond-scale execution without zero-division', async () => {
      // Deterministically verify sub-10ms detection using high-resolution performance.now
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Lightning"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" fast!"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(ssePayload, { status: 200 }));
      });

      // Mock performance.now to simulate exactly 4.5ms total latency and 2.5ms TTFT
      const perfSpy = vi.spyOn(performance, 'now');
      perfSpy
        .mockReturnValueOnce(1000.0) // requestStartTime
        .mockReturnValueOnce(1002.5) // firstTokenTime (first delta)
        .mockReturnValueOnce(1004.5); // streamEndTime

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'Ultra fast benchmark' });
      const chunks = await collectChunks(stream);

      const finishChunk = chunks.find((c) => c.type === 'finish') as any;
      expect(finishChunk).toBeDefined();

      const metrics: GroqMetrics = finishChunk.metrics;
      expect(metrics).toBeDefined();
      expect(metrics.latencyMs).toBeCloseTo(4.5, 2);
      expect(metrics.latencyMs).toBeLessThan(10); // Strictly sub-10ms
      expect(metrics.ttft).toBeCloseTo(2.5, 2);
      expect(metrics.ttft).toBeLessThan(10);     // Strictly sub-10ms TTFT
      expect(metrics.ttft).toBeLessThanOrEqual(metrics.latencyMs);
      expect(metrics.completionTokens).toBe(2);
      expect(metrics.promptTokens).toBe(10);
      expect(metrics.totalTokens).toBe(12);

      // TPS = completionTokens / (4.5 / 1000) = 2 / 0.0045 = ~444.44
      expect(metrics.tps).toBeCloseTo(2 / 0.0045, 1);

      // Verify getLastMetrics matches finish chunk metrics
      expect(model.getLastMetrics()).toEqual(metrics);

      perfSpy.mockRestore();
    });

    it('1.1b Zero-elapsed edge case: enforces 0.1ms floor preventing divide-by-zero', async () => {
      const ssePayload = 'data: {"choices":[{"delta":{"content":"Zero"}},{"finish_reason":"stop"}]}\n\n';
      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));

      // Simulate identical timestamps across entire stream
      const perfSpy = vi.spyOn(performance, 'now').mockReturnValue(5000.0);

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'Zero delta' });
      const chunks = await collectChunks(stream);

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish.metrics.latencyMs).toBe(0.1); // Enforced floor
      expect(finish.metrics.ttft).toBe(0.1);
      expect(Number.isFinite(finish.metrics.tps)).toBe(true);

      perfSpy.mockRestore();
    });

    it('1.2 TTFT detection with delayed first chunk emission', async () => {
      // First chunk is delayed by 80ms, remaining chunks arrive quickly (10ms intervals)
      const sseChunks = [
        ': keep-alive\n\n',
        'data: {"choices":[{"delta":{"content":"Delayed "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"arrival"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2,"total_tokens":22}}\n\n',
        'data: [DONE]\n\n',
      ];

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(
          createByteStreamResponse(sseChunks, {
            chunkDelaysMs: [10, 80, 10, 10, 0],
          }),
        );
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.3-70b-versatile');
      const stream = await model.doStream({ prompt: 'Measure TTFT delay' });
      const chunks = await collectChunks(stream);

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish).toBeDefined();
      const metrics: GroqMetrics = finish.metrics;

      // TTFT must reflect the ~90ms delay before the first token delta arrived
      expect(metrics.ttft).toBeGreaterThanOrEqual(70);
      expect(metrics.latencyMs).toBeGreaterThanOrEqual(metrics.ttft);
      expect(metrics.tps).toBeGreaterThan(0);
      expect(metrics.tps).toBeLessThan(100); // Because elapsed duration >= 100ms for 2 tokens
    });

    it('1.3 High-throughput TPS under rapid burst emission (50 chunks)', async () => {
      // 50 rapid text chunks emitted with minimal delay
      const sseChunks: string[] = [];
      for (let i = 0; i < 50; i++) {
        sseChunks.push(`data: {"choices":[{"delta":{"content":"tok${i} "}}]}\n\n`);
      }
      sseChunks.push(
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":15,"completion_tokens":50,"total_tokens":65}}\n\n',
      );
      sseChunks.push('data: [DONE]\n\n');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(createByteStreamResponse(sseChunks, { delayMs: 1 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('mixtral-8x7b-32768');
      const stream = await model.doStream({ prompt: 'Rapid burst' });
      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === 'text');
      expect(textChunks.length).toBe(50);

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish.metrics.completionTokens).toBe(50);
      expect(finish.metrics.tps).toBeGreaterThan(0);
      // Theoretical calculation: completionTokens / (latencyMs / 1000)
      const expectedTps = finish.metrics.completionTokens / (finish.metrics.latencyMs / 1000);
      expect(Math.abs(finish.metrics.tps - expectedTps)).toBeLessThan(0.01);
    });

    it('1.4 Fallback token estimation when stream_options usage is omitted', async () => {
      // Response lacks usage object; groq driver must fallback to estimation
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Estimated token counting fallback test."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(ssePayload, { status: 200 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'No usage metadata' });
      const chunks = await collectChunks(stream);

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish.metrics.completionTokens).toBeGreaterThan(0);
      expect(finish.metrics.promptTokens).toBeUndefined();
      expect(finish.metrics.totalTokens).toBe(finish.metrics.completionTokens);
    });

    it('1.5 Empty response stream: TTFT falls back to latencyMs without NaN/infinite values', async () => {
      // Empty response (immediately finished without text deltas)
      const ssePayload = [
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(ssePayload, { status: 200 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'Empty' });
      const chunks = await collectChunks(stream);

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish).toBeDefined();
      expect(Number.isFinite(finish.metrics.latencyMs)).toBe(true);
      expect(Number.isFinite(finish.metrics.ttft)).toBe(true);
      expect(Number.isFinite(finish.metrics.tps)).toBe(true);
      expect(finish.metrics.ttft).toBe(finish.metrics.latencyMs);
    });

    it('1.6 Reasoning tokens correctly trigger firstTokenTime for TTFT', async () => {
      // First delta is reasoning (e.g. DeepSeek / Llama thinking delta), followed by text
      const sseChunks = [
        'data: {"choices":[{"delta":{"reasoning":"Analyzing input structure..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Conclusion reached."}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":12,"total_tokens":22}}\n\n',
        'data: [DONE]\n\n',
      ];

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(createByteStreamResponse(sseChunks, { delayMs: 15 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.3-70b-versatile');
      const stream = await model.doStream({ prompt: 'Reasoning test' });
      const chunks = await collectChunks(stream);

      const reasoningChunk = chunks.find((c) => c.type === 'reasoning');
      expect(reasoningChunk).toBeDefined();

      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish.metrics.ttft).toBeGreaterThan(0);
      expect(finish.metrics.ttft).toBeLessThanOrEqual(finish.metrics.latencyMs);
    });
  });

  // =========================================================================
  // 2. Tool Calling Streaming & Reconstruction
  // =========================================================================
  describe('2. Tool Calling Streaming & Reconstruction', () => {
    it('2.1 Multi-tool call argument deltas with index tracking and full reconstruction', async () => {
      // Two distinct tool calls emitted sequentially with multiple fragmented argument deltas
      const ssePayload = [
        // Tool 0: get_weather
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_weather_101","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\": "}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Tokyo, Japan\\", "}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"units\\": \\"celsius\\"}"}}]}}]}\n\n',
        // Tool 1: get_currency_rate
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_forex_202","type":"function","function":{"name":"get_currency_rate","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\\"from\\": \\"USD\\", "}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\\"to\\": \\"JPY\\"}"}}]}}]}\n\n',
        // Finish
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":35,"completion_tokens":28,"total_tokens":63}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(ssePayload, { status: 200 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.3-70b-versatile');
      const stream = await model.doStream({
        prompt: 'Weather and exchange rate for Tokyo',
        tools: [
          { type: 'function', function: { name: 'get_weather' } },
          { type: 'function', function: { name: 'get_currency_rate' } },
        ],
      });

      const chunks = await collectChunks(stream);

      // Verify tool call chunks were emitted
      const toolChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolChunks.length).toBe(7);

      // Reconstruct function calls
      const reconstructed = reconstructToolCalls(chunks);
      expect(reconstructed.length).toBe(2);

      // Verify Tool 1: get_weather
      expect(reconstructed[0]!.id).toBe('call_weather_101');
      expect(reconstructed[0]!.name).toBe('get_weather');
      const weatherArgs = JSON.parse(reconstructed[0]!.arguments);
      expect(weatherArgs).toEqual({
        location: 'Tokyo, Japan',
        units: 'celsius',
      });

      // Verify Tool 2: get_currency_rate
      expect(reconstructed[1]!.id).toBe('call_forex_202');
      expect(reconstructed[1]!.name).toBe('get_currency_rate');
      const forexArgs = JSON.parse(reconstructed[1]!.arguments);
      expect(forexArgs).toEqual({
        from: 'USD',
        to: 'JPY',
      });

      // Verify finish chunk
      const finish = chunks.find((c) => c.type === 'finish') as any;
      expect(finish.finishReason).toBe('tool_calls');
      expect(finish.usage?.completionTokens).toBe(28);
    });

    it('2.2 Survives extreme micro-fragmentation (1-character deltas across 35 chunks)', async () => {
      const fullArgs = JSON.stringify({
        database: 'production_analytics',
        query: 'SELECT count(*) FROM users WHERE status = "active"',
        limit: 100,
        safe_mode: true,
      });

      const sseChunks: string[] = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_sql_999","type":"function","function":{"name":"run_sql_query","arguments":""}}]}}]}\n\n',
      ];

      // Slice JSON into single characters
      for (let i = 0; i < fullArgs.length; i++) {
        const char = fullArgs[i]!;
        const escaped = JSON.stringify(char).slice(1, -1); // escape for JSON embedding
        sseChunks.push(
          `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"${escaped}"}}]}}]}\n\n`,
        );
      }
      sseChunks.push('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n');
      sseChunks.push('data: [DONE]\n\n');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(createByteStreamResponse(sseChunks));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.1-8b-instant');
      const stream = await model.doStream({ prompt: 'Run analytics query' });
      const chunks = await collectChunks(stream);

      const reconstructed = reconstructToolCalls(chunks);
      expect(reconstructed.length).toBe(1);
      expect(reconstructed[0]!.id).toBe('call_sql_999');
      expect(reconstructed[0]!.name).toBe('run_sql_query');
      expect(JSON.parse(reconstructed[0]!.arguments)).toEqual({
        database: 'production_analytics',
        query: 'SELECT count(*) FROM users WHERE status = "active"',
        limit: 100,
        safe_mode: true,
      });
    });

    it('2.3 Handles multi-tool calls with empty arguments and unicode payloads', async () => {
      const ssePayload = [
        // Tool 0: no-arg ping
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_ping","type":"function","function":{"name":"ping","arguments":"{}"}}]}}]}\n\n',
        // Tool 1: unicode message
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_echo","type":"function","function":{"name":"echo","arguments":"{\\"msg\\": \\"Hello 🌍 World! Привет! 🚀\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve(new Response(ssePayload, { status: 200 }));
      });

      const model = createGroq({ apiKey: 'gsk_test', fetch: customFetch })('llama-3.3-70b-versatile');
      const stream = await model.doStream({ prompt: 'Ping and Echo' });
      const chunks = await collectChunks(stream);

      const reconstructed = reconstructToolCalls(chunks);
      expect(reconstructed.length).toBe(2);
      expect(JSON.parse(reconstructed[0]!.arguments)).toEqual({});
      expect(JSON.parse(reconstructed[1]!.arguments)).toEqual({
        msg: 'Hello 🌍 World! Привет! 🚀',
      });
    });
  });

  // =========================================================================
  // 3. JSON Mode & Structured Output Extraction
  // =========================================================================
  describe('3. JSON Mode & Structured Output Extraction', () => {
    it('3.1 Triggers response_format: { type: "json_object" } across all configuration vectors', async () => {
      const capturedBodies: any[] = [];
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBodies.push(JSON.parse(init.body));
        return Promise.resolve(
          new Response('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGroq({ apiKey: 'k', fetch: customFetch });

      // Vector 1: settings.jsonMode === true
      await provider('llama-3.3-70b-versatile', { jsonMode: true }).doStream({ prompt: 'test' });
      expect(capturedBodies[0].response_format).toEqual({ type: 'json_object' });

      // Vector 2: settings.responseFormat === { type: 'json_object' }
      await provider('llama-3.3-70b-versatile', { responseFormat: { type: 'json_object' } }).doStream({ prompt: 'test' });
      expect(capturedBodies[1].response_format).toEqual({ type: 'json_object' });

      // Vector 3: options.jsonMode === true
      await provider('llama-3.1-8b-instant').doStream({ prompt: 'test', jsonMode: true });
      expect(capturedBodies[2].response_format).toEqual({ type: 'json_object' });

      // Vector 4: options.response_format === { type: 'json_object' }
      await provider('llama-3.1-8b-instant').doStream({ prompt: 'test', response_format: { type: 'json_object' } });
      expect(capturedBodies[3].response_format).toEqual({ type: 'json_object' });

      // Vector 5: options.schema provided (e.g. from generateObject)
      await provider('llama-3.1-8b-instant').doStream({ prompt: 'test', schema: { type: 'dummy' } });
      expect(capturedBodies[4].response_format).toEqual({ type: 'json_object' });
    });

    it('3.2 generateObject with Standard Schema v1 (~standard) and complex nested object', async () => {
      interface SystemConfig {
        host: string;
        port: number;
        ssl: boolean;
        routes: string[];
      }

      const standardSchema: StandardSchemaV1<unknown, SystemConfig> = {
        '~standard': {
          version: 1,
          vendor: 'test-standard',
          validate: (val: unknown) => {
            const v = val as any;
            if (
              typeof v?.host === 'string' &&
              typeof v?.port === 'number' &&
              typeof v?.ssl === 'boolean' &&
              Array.isArray(v?.routes)
            ) {
              return { value: v as SystemConfig };
            }
            return {
              issues: [
                { message: 'Invalid SystemConfig schema', path: ['host'] },
              ],
            };
          },
        },
      };

      const serverPayload = JSON.stringify({
        host: 'api.ranu.internal',
        port: 8443,
        ssl: true,
        routes: ['/v1/auth', '/v1/models', '/v1/telemetry'],
      });

      const ssePayload = [
        `data: {"choices":[{"delta":{"content":${JSON.stringify(serverPayload.slice(0, 30))}}}]}\n\n`,
        `data: {"choices":[{"delta":{"content":${JSON.stringify(serverPayload.slice(30))}}}]}\n\n`,
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":40,"completion_tokens":35,"total_tokens":75}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      const result = await generateObject({
        model,
        schema: standardSchema,
        prompt: 'Generate system config',
      });

      expect(result.object).toEqual({
        host: 'api.ranu.internal',
        port: 8443,
        ssl: true,
        routes: ['/v1/auth', '/v1/models', '/v1/telemetry'],
      });
      expect(result.finishReason).toBe('stop');
      expect(result.usage?.totalTokens).toBe(75);
    });

    it('3.3 Handles JSON wrapped in markdown code fences across chunk boundaries', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Here is the requested JSON:\\n```json\\n{\\"stat"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"us\\": \\"operational\\", \\"uptime\\": 99.98}\\n```"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: any) => ({ value: val }),
        },
      };

      const result = await generateObject({
        model,
        schema,
        prompt: 'Return health status',
      });

      expect(result.object).toEqual({
        status: 'operational',
        uptime: 99.98,
      });
    });

    it('3.4 Throws AIValidationError on schema constraint failure with issues and raw input', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"{\\"port\\": \\"not-a-number\\"}"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'validator',
          validate: (val: any) => {
            if (typeof val?.port === 'number') return { value: val };
            return {
              issues: [{ message: 'Expected port to be number', path: ['port'] }],
            };
          },
        },
      };

      await expect(
        generateObject({
          model,
          schema,
          prompt: 'Get port',
        }),
      ).rejects.toThrow(AIValidationError);
    });

    it('3.5 Throws SyntaxError on malformed unrecoverable JSON', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"{ invalid json syntax without quotes: 123 "},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'v',
          validate: (val: any) => ({ value: val }),
        },
      };

      await expect(
        generateObject({
          model,
          schema,
          prompt: 'Get broken json',
        }),
      ).rejects.toThrow(SyntaxError);
    });
  });

  // =========================================================================
  // 4. Concurrency Stress Test (60 Simultaneous Groq Model Requests)
  // =========================================================================
  describe('4. Concurrency Stress (60+ Simultaneous Requests)', () => {
    it('4.1 Runs 60 simultaneous Groq requests: zero metric cross-talk, zero race conditions', async () => {
      const TOTAL_CONCURRENT = 60;

      // Mock fetch providing unique, request-isolated SSE stream with variable delays
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        const userPrompt = body.messages[0]?.content ?? '';
        const match = /REQ_(\d+)/.exec(userPrompt);
        const reqId = match ? parseInt(match[1]!, 10) : 0;

        // Give each request a distinct token count and delay
        const tokenCount = reqId + 1;
        const sseLines = [
          `data: {"choices":[{"delta":{"content":"RESULT_${reqId}"}}]}\n\n`,
          `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":${tokenCount},"total_tokens":${10 + tokenCount}}}\n\n`,
          'data: [DONE]\n\n',
        ];

        // Stagger chunk delivery slightly based on reqId % 7 to force concurrency interleaving
        const delay = (reqId % 7) * 4;
        return Promise.resolve(createByteStreamResponse(sseLines, { delayMs: delay }));
      });

      const provider = createGroq({ apiKey: 'gsk_stress_token', fetch: customFetch });
      const model = provider('llama-3.3-70b-versatile');

      // Launch 60 concurrent requests
      const requestPromises = Array.from({ length: TOTAL_CONCURRENT }, async (_, i) => {
        const reqId = i;
        const stream = await model.doStream({ prompt: `Execute REQ_${reqId}` });
        const chunks = await collectChunks(stream);

        // Verify content integrity
        const textChunk = chunks.find((c) => c.type === 'text') as any;
        expect(textChunk).toBeDefined();
        expect(textChunk.text).toBe(`RESULT_${reqId}`);

        // Verify finish metrics isolation
        const finish = chunks.find((c) => c.type === 'finish') as any;
        expect(finish).toBeDefined();
        const expectedCompletionTokens = reqId + 1;
        expect(finish.usage.completionTokens).toBe(expectedCompletionTokens);
        expect(finish.metrics.completionTokens).toBe(expectedCompletionTokens);
        expect(finish.metrics.totalTokens).toBe(10 + expectedCompletionTokens);
        expect(finish.metrics.latencyMs).toBeGreaterThan(0);
        expect(finish.metrics.ttft).toBeGreaterThan(0);
        expect(finish.metrics.ttft).toBeLessThanOrEqual(finish.metrics.latencyMs);

        return { reqId, completionTokens: finish.metrics.completionTokens };
      });

      const results = await Promise.all(requestPromises);

      // Verify all 60 requests resolved successfully with unique, uncorrupted tokens
      expect(results.length).toBe(TOTAL_CONCURRENT);
      const completionTokenSet = new Set(results.map((r) => r.completionTokens));
      expect(completionTokenSet.size).toBe(TOTAL_CONCURRENT);
    });
  });

  // =========================================================================
  // 5. Network Failure Resilience
  // =========================================================================
  describe('5. Network Failure Resilience', () => {
    it('5.1 HTTP 401 Unauthorized: rejects with actionable authentication error', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Invalid API Key provided: gsk_invalid_test_key',
              type: 'invalid_request_error',
            },
          }),
          { status: 401, statusText: 'Unauthorized' },
        ),
      );

      const model = createGroq({ apiKey: 'bad_key', fetch: customFetch })('llama-3.1-8b-instant');
      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Groq request failed with status 401 Unauthorized: {"error":/i,
      );
    });

    it('5.2 HTTP 429 Rate Limit: rejects with rate-limit status and body', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit exceeded: 30 requests per minute limit reached',
              type: 'tokens',
            },
          }),
          { status: 429, statusText: 'Too Many Requests' },
        ),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');
      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /429 Too Many Requests: {"error":{"message":"Rate limit exceeded/i,
      );
    });

    it('5.3 HTTP 503 Service Unavailable: rejects with upstream status text', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('Groq inference cluster temporarily unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');
      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /503 Service Unavailable: Groq inference cluster temporarily unavailable/i,
      );
    });

    it('5.4 Mid-stream connection abort via AbortController signal', async () => {
      const abortController = new AbortController();
      let chunksEmitted = 0;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Chunk1"}}]}\n\n'));
          chunksEmitted++;
          // Wait for signal abort before emitting more
          abortController.signal.addEventListener('abort', () => {
            controller.error(abortController.signal.reason);
          });
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');
      const aiStream = await model.doStream({
        prompt: 'Abort mid-stream',
        signal: abortController.signal,
      });

      const reader = aiStream.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      expect(firstChunk.value).toEqual({ type: 'text', text: 'Chunk1' });

      // Trigger mid-stream abort
      abortController.abort(new Error('Connection aborted by client'));

      // Next read must reject with the abort reason
      await expect(reader.read()).rejects.toThrow('Connection aborted by client');
    });

    it('5.5 Mid-stream client stream.cancel(): releases lock cleanly without hanging', async () => {
      let underlyingCancelled = false;
      const underlyingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Part1"}}]}\n\n'));
        },
        cancel(reason) {
          underlyingCancelled = true;
          expect(reason).toBe('Client cancelled stream');
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(underlyingStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');
      const aiStream = await model.doStream({ prompt: 'Cancel test' });

      const reader = aiStream.getReader();
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Part1' });

      // Cancel stream
      await reader.cancel('Client cancelled stream');
      expect(underlyingCancelled).toBe(true);
    });

    it('5.6 Mid-stream TCP socket reset / connection drop terminates reader with error', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"P1"}}]}\n\n'));
          // Simulate sudden TCP disconnect
          setTimeout(() => {
            controller.error(new Error('ECONNRESET: socket hang up'));
          }, 10);
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');
      const aiStream = await model.doStream({ prompt: 'Socket drop' });

      const reader = aiStream.getReader();
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'P1' });

      await expect(reader.read()).rejects.toThrow('ECONNRESET: socket hang up');
    });
  });

  // =========================================================================
  // 6. Integration with Core @ranu/ai Functions
  // =========================================================================
  describe('6. Core @ranu/ai Integration (streamAI & generateObject)', () => {
    it('6.1 streamAI() integrates with Groq: returns streaming SSE Response with backpressure', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Ranu "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"+ Groq "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Streaming"}}]}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.3-70b-versatile');

      let chunkCount = 0;
      let totalBytesReceived = 0;

      const response = await streamAI({
        model,
        prompt: 'Integration test',
        highWaterMark: 1024,
        onChunk: (size, total) => {
          chunkCount++;
          totalBytesReceived = total;
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/event-stream');

      const bodyText = await response.text();
      expect(bodyText).toContain('data: {"text":"Ranu "}');
      expect(bodyText).toContain('data: {"text":"+ Groq "}');
      expect(bodyText).toContain('data: {"text":"Streaming"}');
      expect(bodyText).toContain('event: finish');
      expect(bodyText).toContain('"finishReason":"stop"');
      expect(bodyText).toContain('data: [DONE]');
      expect(chunkCount).toBeGreaterThan(0);
      expect(totalBytesReceived).toBeGreaterThan(0);
    });

    it('6.2 generateObject() integrates with Groq: extracts, parses, and validates structured outputs', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"{\\"status\\":\\"healthy\\",\\"activeConnections\\":42}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":25,"completion_tokens":12,"total_tokens":37}}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGroq({ apiKey: 'k', fetch: customFetch })('llama-3.1-8b-instant');

      interface HealthStatus {
        status: string;
        activeConnections: number;
      }

      const schema: StandardSchemaV1<unknown, HealthStatus> = {
        '~standard': {
          version: 1,
          vendor: 'groq-health-test',
          validate: (val: any) => {
            if (typeof val?.status === 'string' && typeof val?.activeConnections === 'number') {
              return { value: val as HealthStatus };
            }
            return { issues: [{ message: 'Invalid health payload' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema,
        prompt: 'Check system health',
      });

      expect(result.object).toEqual({
        status: 'healthy',
        activeConnections: 42,
      });
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({
        promptTokens: 25,
        completionTokens: 12,
        totalTokens: 37,
      });
    });
  });
});
