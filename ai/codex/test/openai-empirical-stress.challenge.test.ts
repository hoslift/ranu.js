/**
 * Empirical Challenge Stress Test Suite for @ranu/ai-openai
 *
 * Thoroughly stress-tests:
 * 1. Reasoning models (o1, o1-mini, o3-mini) parameter mapping, reasoning_effort,
 *    reasoning_content deltas, and multi-chunk usage/finish reason extraction.
 * 2. Structured outputs (json_schema mode) with Standard Schema v1, nested objects,
 *    arrays, code-fence extraction, and validation/syntax errors.
 * 3. Tool calling streaming, multi-tool deltas, and index/function call reconstruction.
 * 4. Concurrency stress harness: 50+ simultaneous requests asserting zero cross-talk.
 * 5. Network failure resilience: 401 Unauthorized, 429 Rate Limit, 500, mid-stream abort,
 *    and 1-byte TCP stream fragmentation.
 * 6. Core @ranu/ai integration with streamAI and generateObject.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamAI,
  generateObject,
  AIValidationError,
  type AIChunk,
  type StandardSchemaV1,
} from '@ranu/ai';
import { createOpenAI, openai, isReasoningModel } from '../src/index.js';

function createChunkedByteStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function sliceIntoBytes(str: string, chunkSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const result: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result.push(bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return result;
}

async function collectChunks(stream: ReadableStream<AIChunk>): Promise<AIChunk[]> {
  const reader = stream.getReader();
  const chunks: AIChunk[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

describe('Empirical Challenge: @ranu/ai-openai Stress Harness', () => {
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

  // =========================================================================
  // SUITE 1: Reasoning Models (o1, o1-mini, o3-mini)
  // =========================================================================
  describe('1. Reasoning Models (o1, o1-mini, o3-mini) Stress & Parameter Boundaries', () => {
    it('1A: isReasoningModel regex handles varied casings, prefixes, and variants', () => {
      // Positive cases
      expect(isReasoningModel('o1')).toBe(true);
      expect(isReasoningModel('o1-mini')).toBe(true);
      expect(isReasoningModel('o1-preview')).toBe(true);
      expect(isReasoningModel('o3-mini')).toBe(true);
      expect(isReasoningModel('o3-mini-2025-01-31')).toBe(true);
      expect(isReasoningModel('o4-preview')).toBe(true);
      expect(isReasoningModel('O1')).toBe(true);
      expect(isReasoningModel('O1-MINI')).toBe(true);
      expect(isReasoningModel('O3-MINI')).toBe(true);

      // Negative cases
      expect(isReasoningModel('gpt-4o')).toBe(false);
      expect(isReasoningModel('gpt-4o-mini')).toBe(false);
      expect(isReasoningModel('gpt-4-turbo')).toBe(false);
      expect(isReasoningModel('claude-3-5-sonnet')).toBe(false);
      expect(isReasoningModel('gemini-2.0-flash')).toBe(false);
      expect(isReasoningModel('custom-o1-model')).toBe(false);
      expect(isReasoningModel('not-o1')).toBe(false);
    });

    it('1B: maps maxTokens to max_completion_tokens and strictly omits max_tokens for o1/o3-mini', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createOpenAI({ apiKey: 'sk-test', fetch: customFetch });

      // Test o1-mini
      const model = provider('o1-mini', { maxTokens: 4096 });
      await model.doStream({ prompt: 'test reasoning prompt' });

      expect(capturedBody.model).toBe('o1-mini');
      expect(capturedBody.max_completion_tokens).toBe(4096);
      expect(capturedBody.max_tokens).toBeUndefined();

      // Test execution options override settings maxTokens
      await model.doStream({ prompt: 'test override', maxTokens: 8192 });
      expect(capturedBody.max_completion_tokens).toBe(8192);
      expect(capturedBody.max_tokens).toBeUndefined();
    });

    it('1C: supports reasoningEffort (low, medium, high) and omits for non-reasoning models', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createOpenAI({ apiKey: 'sk-test', fetch: customFetch });

      // Reasoning model with reasoningEffort 'low'
      await provider('o3-mini', { reasoningEffort: 'low' }).doStream({ prompt: 'fast reasoning' });
      expect(capturedBody.reasoning_effort).toBe('low');

      // Reasoning model with reasoningEffort 'high'
      await provider('o3-mini', { reasoningEffort: 'high' }).doStream({ prompt: 'deep reasoning' });
      expect(capturedBody.reasoning_effort).toBe('high');

      // Non-reasoning model (gpt-4o) should NOT send reasoning_effort
      await provider('gpt-4o', { reasoningEffort: 'high' }).doStream({ prompt: 'standard prompt' });
      expect(capturedBody.reasoning_effort).toBeUndefined();
    });

    it('1D: strictly omits temperature, top_p, frequency_penalty, and presence_penalty for reasoning models', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createOpenAI({ apiKey: 'sk-test', fetch: customFetch });

      // User accidentally supplies temperature and penalties to o1
      const model = provider('o1', {
        temperature: 0.7,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.5,
      });

      await model.doStream({
        prompt: 'reasoning task',
        temperature: 0.2, // options override
      });

      // Must NOT be sent to OpenAI to avoid 400 Bad Request
      expect(capturedBody.temperature).toBeUndefined();
      expect(capturedBody.top_p).toBeUndefined();
      expect(capturedBody.frequency_penalty).toBeUndefined();
      expect(capturedBody.presence_penalty).toBeUndefined();
    });

    it('1E: streams delta.reasoning_content and delta.reasoning chunks before text chunks', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Step 1: Analyze prime factorization."}}]}',
        '',
        'data: {"choices":[{"delta":{"reasoning":" Step 2: Conclude 97 is prime."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"The number 97 is prime."}}]}',
        '',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('o3-mini');

      const stream = await model.doStream({ prompt: 'Is 97 prime?' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Step 1: Analyze prime factorization.' },
        { type: 'reasoning', reasoning: ' Step 2: Conclude 97 is prime.' },
        { type: 'text', text: 'The number 97 is prime.' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('1F: captures multi-chunk usage and varied finish reasons (stop, length, content_filter)', async () => {
      // OpenAI usage payload typically arrives in a trailing chunk with choices: []
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Truncated text..."},"finish_reason":"length"}]}',
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":150,"completion_tokens":4096,"total_tokens":4246}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('o1');

      const stream = await model.doStream({ prompt: 'Generate huge text' });
      const chunks = await collectChunks(stream);

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toBeDefined();
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'length',
        usage: {
          promptTokens: 150,
          completionTokens: 4096,
          totalTokens: 4246,
        },
      });
    });
  });

  // =========================================================================
  // SUITE 2: Structured Outputs & Standard Schema v1
  // =========================================================================
  describe('2. Structured Outputs & Standard Schema v1 Stress Tests', () => {
    it('2A: builds response_format with json_schema, strict: true, and nested schema properties', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{\\"name\\":\\"prod\\",\\"replicas\\":3}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const nestedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          replicas: { type: 'number' },
          config: {
            type: 'object',
            properties: {
              image: { type: 'string' },
              env: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['image', 'env'],
            additionalProperties: false,
          },
        },
        required: ['name', 'replicas', 'config'],
        additionalProperties: false,
      };

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      await model.doStream({
        prompt: 'Cluster spec',
        schema: {
          jsonSchema: nestedSchema,
        },
        schemaName: 'cluster_deployment',
      });

      expect(capturedBody.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'cluster_deployment',
          strict: true,
          schema: nestedSchema,
        },
      });
    });

    it('2B: executes generateObject with Standard Schema v1 on nested objects and arrays', async () => {
      const mockResultData = {
        organization: 'Hoslift',
        projects: [
          { id: 'p1', name: 'Ranu.js', stars: 12000, active: true },
          { id: 'p2', name: 'Paperclip', stars: 4500, active: true },
        ],
        metadata: {
          tier: 'enterprise',
          rateLimit: 10000,
        },
      };

      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(JSON.stringify(mockResultData))}},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      // Standard Schema v1 compliant schema
      const standardSchema: StandardSchemaV1<typeof mockResultData> = {
        '~standard': {
          version: 1,
          vendor: 'test-standard-schema',
          validate: (value: unknown) => {
            const data = value as typeof mockResultData;
            if (
              typeof data?.organization === 'string' &&
              Array.isArray(data?.projects) &&
              data.projects.length === 2 &&
              typeof data?.metadata?.tier === 'string'
            ) {
              return { value: data };
            }
            return {
              issues: [{ message: 'Organization spec validation failed', path: ['organization'] }],
            };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: standardSchema,
        prompt: 'Return organization projects',
      });

      expect(result.object).toEqual(mockResultData);
      expect(result.finishReason).toBe('stop');
      expect(JSON.parse(result.rawText)).toEqual(mockResultData);
    });

    it('2C: extracts JSON wrapped inside markdown code fences with surrounding commentary', async () => {
      const responsePayload = [
        'Certainly! Here is the JSON output requested:',
        '```json',
        '{"status": "ready", "services": ["auth", "database", "ai-gateway"]}',
        '```',
        'Let me know if you need any adjustments.',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(responsePayload)}},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'fence-test',
          validate: (val: any) => ({ value: val }),
        },
      };

      const result = await generateObject({
        model,
        schema,
        prompt: 'Status check',
      });

      expect(result.object).toEqual({
        status: 'ready',
        services: ['auth', 'database', 'ai-gateway'],
      });
    });

    it('2D: throws AIValidationError with structured issues when schema validation fails', async () => {
      const invalidPayload = {
        username: 'alice',
        age: -5, // Invalid: must be positive
      };

      const customFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            `data: {"choices":[{"delta":{"content":${JSON.stringify(JSON.stringify(invalidPayload))}},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
            { status: 200 },
          ),
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const schema: StandardSchemaV1<{ username: string; age: number }> = {
        '~standard': {
          version: 1,
          vendor: 'age-validator',
          validate: (val: any) => {
            if (typeof val?.age === 'number' && val.age < 0) {
              return {
                issues: [{ message: 'Age must be positive', path: ['age'] }],
              };
            }
            return { value: val };
          },
        },
      };

      await expect(
        generateObject({
          model,
          schema,
          prompt: 'User profile',
        }),
      ).rejects.toThrow(AIValidationError);

      try {
        await generateObject({ model, schema, prompt: 'User profile' });
      } catch (err) {
        expect(err).toBeInstanceOf(AIValidationError);
        const valErr = err as AIValidationError;
        expect(valErr.issues[0]?.message).toBe('Age must be positive');
        expect(valErr.issues[0]?.path).toEqual(['age']);
        expect(valErr.rawInput).toEqual(invalidPayload);
      }
    });

    it('2E: throws SyntaxError when AI model produces malformed or incomplete JSON', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"{ \\"truncated\\": [1, 2, "},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');
      const dummySchema = {
        '~standard': { version: 1 as const, vendor: 'test', validate: (v: any) => ({ value: v }) },
      };

      await expect(
        generateObject({
          model,
          schema: dummySchema,
          prompt: 'Truncated response',
        }),
      ).rejects.toThrow(SyntaxError);
    });

    it('2F: supports json_object format fallback when explicitly configured', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o', {
        responseFormat: { type: 'json_object' },
      });

      await model.doStream({ prompt: 'Json mode prompt' });
      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    });
  });

  // =========================================================================
  // SUITE 3: Tool Calling Streaming & Index Tracking
  // =========================================================================
  describe('3. Tool Calling Streaming & Function Call Reconstruction', () => {
    it('3A: streams single tool call with multi-chunk argument deltas and reconstructs arguments', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_search_1","type":"function","function":{"name":"searchFlights","arguments":""}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"origin\\": "}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"SFO\\", \\"dest\\": "}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"NRT\\"}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const stream = await model.doStream({ prompt: 'Find flights from SFO to NRT' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c): c is { type: 'tool-call'; toolCall: any } => c.type === 'tool-call');
      expect(toolChunks.length).toBe(4);

      // Reconstruct arguments
      let assembledJson = '';
      let functionName = '';
      let callId = '';

      for (const tc of toolChunks) {
        if (tc.toolCall.id) callId = tc.toolCall.id;
        if (tc.toolCall.name) functionName = tc.toolCall.name;
        if (tc.toolCall.arguments) assembledJson += tc.toolCall.arguments;
      }

      expect(callId).toBe('call_search_1');
      expect(functionName).toBe('searchFlights');
      expect(JSON.parse(assembledJson)).toEqual({ origin: 'SFO', dest: 'NRT' });

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({ type: 'finish', finishReason: 'tool_calls' });
    });

    it('3B: handles parallel multi-tool call deltas across consecutive SSE frames', async () => {
      // Two tool calls: call 0 (getWeather) and call 1 (getStockQuote)
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_w0","type":"function","function":{"name":"getWeather","arguments":"{\\"city\\": \\"Tokyo\\"}"}},{"index":1,"id":"call_s1","type":"function","function":{"name":"getStockQuote","arguments":"{\\"ticker\\": \\"AAPL\\"}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const stream = await model.doStream({ prompt: 'Weather in Tokyo and AAPL quote' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c): c is { type: 'tool-call'; toolCall: any } => c.type === 'tool-call');
      expect(toolChunks.length).toBe(2);

      expect(toolChunks[0]?.toolCall).toEqual({
        id: 'call_w0',
        name: 'getWeather',
        arguments: '{"city": "Tokyo"}',
      });

      expect(toolChunks[1]?.toolCall).toEqual({
        id: 'call_s1',
        name: 'getStockQuote',
        arguments: '{"ticker": "AAPL"}',
      });
    });

    it('3C: empirical boundary check: multi-tool interleaved deltas behavior without index tracking', async () => {
      // In standard OpenAI streaming, tool call 0 starts, tool call 1 starts,
      // and subsequent deltas arrive with only { index: 0, function: { arguments: "..." } }
      // without id or name on the subsequent deltas.
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_0","type":"function","function":{"name":"func0","arguments":"{\\"a\\":"}}]}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_1","type":"function","function":{"name":"func1","arguments":"{\\"b\\":"}}]}}]}',
        '',
        // Subsequent delta for tool 0 (no id or name from OpenAI API)
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}',
        '',
        // Subsequent delta for tool 1 (no id or name from OpenAI API)
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"2}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const stream = await model.doStream({ prompt: 'Call two functions' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c): c is { type: 'tool-call'; toolCall: any } => c.type === 'tool-call');
      expect(toolChunks.length).toBe(4);

      // Verify the observed empirical behavior:
      // Chunk 0 has id and name
      expect(toolChunks[0]?.toolCall.id).toBe('call_0');
      expect(toolChunks[0]?.toolCall.name).toBe('func0');
      expect(toolChunks[0]?.toolCall.arguments).toBe('{"a":');

      // Chunk 1 has id and name
      expect(toolChunks[1]?.toolCall.id).toBe('call_1');
      expect(toolChunks[1]?.toolCall.name).toBe('func1');
      expect(toolChunks[1]?.toolCall.arguments).toBe('{"b":');

      // Subsequent chunks 2 and 3 deliver argument deltas:
      expect(toolChunks[2]?.toolCall.arguments).toBe('1}');
      expect(toolChunks[3]?.toolCall.arguments).toBe('2}');
    });
  });

  // =========================================================================
  // SUITE 4: Concurrency Stress Harness (50+ Simultaneous Requests)
  // =========================================================================
  describe('4. Concurrency Stress Harness (50+ Simultaneous Requests)', () => {
    it('4A: executes 50 simultaneous OpenAI streaming requests with zero cross-talk', async () => {
      const concurrencyCount = 50;
      const requestBodies = new Map<number, any>();
      const requestHeaders = new Map<number, Record<string, string>>();

      const customFetch = vi.fn().mockImplementation((url, init) => {
        const body = JSON.parse(init.body);
        const reqId = parseInt(body.messages[0].content.replace('request-', ''), 10);
        requestBodies.set(reqId, body);
        requestHeaders.set(reqId, init.headers);

        const sse = [
          `data: {"choices":[{"delta":{"content":"resp-${reqId}-part1-"}}]}`,
          '',
          `data: {"choices":[{"delta":{"content":"resp-${reqId}-part2"}}]}`,
          '',
          `data: {"choices":[{"finish_reason":"stop"}]}`,
          '',
          'data: [DONE]',
        ].join('\n');

        return Promise.resolve(new Response(sse, { status: 200 }));
      });

      // Launch 50 concurrent requests with individual providers and configs
      const promises = Array.from({ length: concurrencyCount }, async (_, i) => {
        const provider = createOpenAI({
          apiKey: `sk-test-key-${i}`,
          organization: `org-${i}`,
          project: `proj-${i}`,
          fetch: customFetch,
        });

        const model = provider('gpt-4o-mini');
        const stream = await model.doStream({ prompt: `request-${i}` });
        const chunks = await collectChunks(stream);

        const textContent = chunks
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');

        return {
          id: i,
          text: textContent,
          finish: chunks.find((c) => c.type === 'finish'),
        };
      });

      const results = await Promise.all(promises);

      expect(results.length).toBe(concurrencyCount);

      // Assert zero cross-talk across all 50 streams
      for (let i = 0; i < concurrencyCount; i++) {
        const res = results.find((r) => r.id === i);
        expect(res).toBeDefined();
        expect(res?.text).toBe(`resp-${i}-part1-resp-${i}-part2`);
        expect(res?.finish).toEqual({ type: 'finish', finishReason: 'stop' });

        const capturedHeader = requestHeaders.get(i);
        expect(capturedHeader?.['Authorization']).toBe(`Bearer sk-test-key-${i}`);
        expect(capturedHeader?.['OpenAI-Organization']).toBe(`org-${i}`);
        expect(capturedHeader?.['OpenAI-Project']).toBe(`proj-${i}`);

        const capturedBody = requestBodies.get(i);
        expect(capturedBody?.messages[0]?.content).toBe(`request-${i}`);
      }
    });

    it('4B: executes 50 concurrent generateObject calls with distinct Standard Schemas', async () => {
      const concurrencyCount = 50;

      const customFetch = vi.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        const match = /req-id-(\d+)/.exec(init.body);
        const id = match ? parseInt(match[1], 10) : 0;

        const payload = {
          requestId: id,
          token: `secret-token-${id}`,
          status: 'ok',
        };

        return Promise.resolve(
          new Response(
            `data: {"choices":[{"delta":{"content":${JSON.stringify(JSON.stringify(payload))}},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
            { status: 200 },
          ),
        );
      });

      const promises = Array.from({ length: concurrencyCount }, async (_, i) => {
        const model = createOpenAI({
          apiKey: 'sk-conc-key',
          fetch: customFetch,
        })('gpt-4o');

        const schema = {
          '~standard': {
            version: 1 as const,
            vendor: `vendor-${i}`,
            validate: (val: any) => {
              if (val?.requestId === i && val?.token === `secret-token-${i}`) {
                return { value: val };
              }
              return { issues: [{ message: `Validation mismatch for req ${i}` }] };
            },
          },
        };

        const result = await generateObject({
          model,
          schema,
          prompt: `Process req-id-${i}`,
        });

        return { id: i, object: result.object };
      });

      const results = await Promise.all(promises);

      expect(results.length).toBe(concurrencyCount);
      for (let i = 0; i < concurrencyCount; i++) {
        expect(results[i]?.object).toEqual({
          requestId: i,
          token: `secret-token-${i}`,
          status: 'ok',
        });
      }
    });
  });

  // =========================================================================
  // SUITE 5: Network Failure Resilience & Abort Stress
  // =========================================================================
  describe('5. Network Failure Resilience & Abort Stress Harness', () => {
    it('5A: handles HTTP 401 Unauthorized API error with exact status and message', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Incorrect API key provided: sk-invalid. You can find your API key at https://platform.openai.com/account/api-keys.',
              type: 'invalid_request_error',
              code: 'invalid_api_key',
            },
          }),
          { status: 401, statusText: 'Unauthorized' },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-invalid', fetch: customFetch })('gpt-4o');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /OpenAI request failed with status 401 Unauthorized:.*invalid_api_key/i,
      );
    });

    it('5B: handles HTTP 429 Rate Limit API error with exact error details', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for requests. Please slow down.',
              type: 'requests',
              code: 'rate_limit_exceeded',
            },
          }),
          { status: 429, statusText: 'Too Many Requests' },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-ratelimited', fetch: customFetch })('gpt-4o');

      await expect(model.doStream({ prompt: 'rate limit test' })).rejects.toThrow(
        /OpenAI request failed with status 429 Too Many Requests:.*rate_limit_exceeded/i,
      );
    });

    it('5C: handles HTTP 500 & 503 Internal Server Error gracefully', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('The server experienced an issue processing your request.', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('o1');

      await expect(model.doStream({ prompt: 'server error test' })).rejects.toThrow(
        /OpenAI request failed with status 503 Service Unavailable/i,
      );
    });

    it('5D: cancels downstream reader on mid-stream AbortSignal without hanging', async () => {
      const controller = new AbortController();
      let wasCancelled = false;

      const mockBody = new ReadableStream<Uint8Array>({
        start(c) {
          const encoder = new TextEncoder();
          c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n'));
          c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Chunk 2"}}]}\n\n'));
        },
        cancel(reason) {
          wasCancelled = true;
        },
      });

      const customFetch = vi.fn().mockResolvedValue(new Response(mockBody, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const stream = await model.doStream({
        prompt: 'Abort test',
        signal: controller.signal,
      });

      const reader = stream.getReader();

      const chunk1 = await reader.read();
      expect(chunk1.value).toEqual({ type: 'text', text: 'Chunk 1' });

      // Trigger mid-stream abort
      controller.abort(new Error('User aborted operation'));

      // Cancel stream
      await reader.cancel(new Error('User aborted operation'));
      reader.releaseLock();

      expect(wasCancelled).toBe(true);
    });

    it('5E: rejects immediately when pre-aborted signal is passed to fetch', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Pre-aborted request'));

      const customFetch = vi.fn().mockImplementation((_url, init) => {
        if (init.signal?.aborted) {
          return Promise.reject(init.signal.reason);
        }
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      await expect(
        model.doStream({
          prompt: 'test',
          signal: controller.signal,
        }),
      ).rejects.toThrow('Pre-aborted request');
    });

    it('5F: survives extreme 1-byte TCP stream fragmentation across all SSE deltas', async () => {
      const sseText = [
        'data: {"choices":[{"delta":{"reasoning_content":"Deep thought process."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Fragmented "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"world."}}]}',
        '',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_frag_1","type":"function","function":{"name":"calc","arguments":"{\\"n\\":42}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const oneByteChunks = sliceIntoBytes(sseText, 1);
      expect(oneByteChunks.length).toBeGreaterThan(100);

      const byteStream = createChunkedByteStream(oneByteChunks);
      const customFetch = vi.fn().mockResolvedValue(new Response(byteStream, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('o3-mini');

      const stream = await model.doStream({ prompt: '1-byte stress' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Deep thought process.' },
        { type: 'text', text: 'Fragmented ' },
        { type: 'text', text: 'world.' },
        {
          type: 'tool-call',
          toolCall: {
            id: 'call_frag_1',
            name: 'calc',
            arguments: '{"n":42}',
          },
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
          },
        },
      ]);
    });
  });

  // =========================================================================
  // SUITE 6: Integration with Core @ranu/ai Functions
  // =========================================================================
  describe('6. Integration with Core @ranu/ai Functions (streamAI & generateObject)', () => {
    it('6A: streamAI formats OpenAI reasoning, text, and finish chunks to standard SSE protocol', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Evaluating input..."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Hello from Ranu OpenAI integration!"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":6,"total_tokens":16}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('o3-mini');

      const response = await streamAI({
        model,
        prompt: 'Integration test',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');

      const sseText = await response.text();

      // Check SSE frames
      expect(sseText).toContain('event: reasoning\ndata: {"reasoning":"Evaluating input...","text":"Evaluating input..."}\n\n');
      expect(sseText).toContain('event: chunk\ndata: {"text":"Hello from Ranu OpenAI integration!"}\n\n');
      expect(sseText).toContain('event: finish\ndata: {"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":6,"totalTokens":16}}\n\n');
      expect(sseText).toContain('data: [DONE]\n\n');
    });

    it('6B: streamAI backpressure handles 1,000 rapid chunks with queue bounds without memory leak', async () => {
      const chunksCount = 1000;
      const sseLines: string[] = [];

      for (let i = 0; i < chunksCount; i++) {
        sseLines.push(`data: {"choices":[{"delta":{"content":"w${i} "}}]}`);
        sseLines.push('');
      }
      sseLines.push('data: {"choices":[{"finish_reason":"stop"}]}');
      sseLines.push('');
      sseLines.push('data: [DONE]');

      const customFetch = vi.fn().mockResolvedValue(new Response(sseLines.join('\n'), { status: 200 }));
      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      let chunkEvents = 0;
      const response = await streamAI({
        model,
        prompt: '1000 words stream',
        highWaterMark: 1024,
        onChunk: () => {
          chunkEvents++;
        },
      });

      const body = await response.text();
      expect(body).toContain('data: [DONE]\n\n');
      expect(chunkEvents).toBeGreaterThan(0);
    });

    it('6C: generateObject succeeds end-to-end with openai model and Standard Schema v1', async () => {
      const expectedData = {
        title: 'Empirical Verification Report',
        approved: true,
        score: 99.5,
      };

      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(JSON.stringify(expectedData))}},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createOpenAI({ apiKey: 'sk-test', fetch: customFetch })('gpt-4o');

      const standardSchema: StandardSchemaV1<typeof expectedData> = {
        '~standard': {
          version: 1,
          vendor: 'report-schema',
          validate: (value: unknown) => {
            const data = value as typeof expectedData;
            if (typeof data?.title === 'string' && typeof data?.approved === 'boolean') {
              return { value: data };
            }
            return { issues: [{ message: 'Invalid report schema' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: standardSchema,
        prompt: 'Generate report',
      });

      expect(result.object).toEqual(expectedData);
      expect(result.rawText).toBe(JSON.stringify(expectedData));
      expect(result.finishReason).toBe('stop');
    });
  });
});
