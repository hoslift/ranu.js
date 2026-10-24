/**
 * Empirical Challenge & Stress Test Suite for @ranu/ai-custom
 *
 * Challenge Dimensions:
 * 1. DeepSeek-R1 reasoning stream: reasoning_content deltas ahead of content deltas,
 *    multibyte UTF-8 codepoints (Japanese, Chinese, Cyrillic, Greek, emojis),
 *    advanced math equations (LaTeX integrals, series), and multi-language code blocks.
 * 2. Extreme byte boundary fragmentation: 1-byte, 2-byte, and random byte boundaries,
 *    SSE keyword boundary splits, zero corruption, and exact text reassembly.
 * 3. Tool calling streaming deltas: multi-tool argument deltas with index tracking,
 *    interleaved deltas across indices, and full JSON reconstruction.
 * 4. Structured JSON mode: integration with @ranu/ai's generateObject under local model
 *    simulations (Ollama format: 'json', response_format: { type: 'json_object' },
 *    and response_format: { type: 'json_schema' }), code-fences, and schema validation.
 * 5. AbortSignal cancellation: rapid abort before inference, mid-stream abort,
 *    and network/connection drops.
 * 6. Core @ranu/ai integration with streamAI and generateObject under concurrent load.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamAI,
  generateObject,
  AIValidationError,
  type AIChunk,
  type StandardSchemaV1,
} from '@ranu/ai';
import {
  createCustomAI,
  custom,
  isDeepSeekR1,
  resolveBaseURL,
} from '../src/index.js';

// =============================================================================
// Helper Utilities for Stream Fragmentation & Chunk Collection
// =============================================================================

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

function sliceIntoFixedBytes(str: string, chunkSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const result: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    result.push(bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return result;
}

function sliceIntoRandomBytes(str: string, seed = 12345): Uint8Array[] {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const result: Uint8Array[] = [];
  let s = seed;
  const nextRand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  let offset = 0;
  while (offset < bytes.length) {
    const chunkLen = Math.floor(nextRand() * 7) + 1; // 1 to 7 bytes
    const end = Math.min(offset + chunkLen, bytes.length);
    result.push(bytes.subarray(offset, end));
    offset = end;
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

// =============================================================================
// Test Suite
// =============================================================================

describe('Empirical Challenge: @ranu/ai-custom Local Ollama & DeepSeek-R1 Stress Suite', () => {
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

  // ===========================================================================
  // 1. DeepSeek-R1 Reasoning Stream Verification
  // ===========================================================================
  describe('1. DeepSeek-R1 Reasoning Stream & Multibyte Codepoint Resilience', () => {
    it('1A: streams reasoning_content deltas strictly ahead of content deltas', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Step 1: Parse input tokens."}}]}',
        '',
        'data: {"choices":[{"delta":{"reasoning_content":" Step 2: Formulate mathematical proof."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Final "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Conclusion."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":28,"total_tokens":40}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1');

      const stream = await model.doStream({ prompt: 'Solve step by step' });
      const chunks = await collectChunks(stream);

      // Verify sequence: reasoning chunks come before text chunks
      const types = chunks.map((c) => c.type);
      expect(types).toEqual(['reasoning', 'reasoning', 'text', 'text', 'finish']);

      // Verify reasoning contents
      const reasoningChunks = chunks.filter((c): c is { type: 'reasoning'; reasoning: string } => c.type === 'reasoning');
      expect(reasoningChunks[0].reasoning).toBe('Step 1: Parse input tokens.');
      expect(reasoningChunks[1].reasoning).toBe(' Step 2: Formulate mathematical proof.');

      // Verify text contents
      const textChunks = chunks.filter((c): c is { type: 'text'; text: string } => c.type === 'text');
      expect(textChunks.map((c) => c.text).join('')).toBe('Final Conclusion.');

      // Verify usage and finishReason
      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'stop',
        usage: {
          promptTokens: 12,
          completionTokens: 28,
          totalTokens: 40,
        },
      });
    });

    it('1B: handles multibyte UTF-8 codepoints across Japanese, Chinese, Greek, Cyrillic, and Emojis in reasoning deltas', async () => {
      const reasoningSnippet =
        '【推論分析】日本語テスト: λ = 42 ⨂ \u221E. 中文分析：梯度下降优化算法。' +
        'Кириллица: Исследование сходимости ряда ∑ 1/n². ' +
        'Emojis: 🧠💡🔍⚡📐🧪🎯.';
      const contentSnippet = 'Result: 100% verified across UTF-8 codepoints.';

      const ssePayload = [
        `data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(reasoningSnippet)}}}]}`,
        '',
        `data: {"choices":[{"delta":{"content":${JSON.stringify(contentSnippet)}}}]}`,
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1:14b');

      const stream = await model.doStream({ prompt: 'Test multibyte reasoning' });
      const chunks = await collectChunks(stream);

      const reasoningChunk = chunks.find((c) => c.type === 'reasoning') as { type: 'reasoning'; reasoning: string };
      expect(reasoningChunk).toBeDefined();
      expect(reasoningChunk.reasoning).toBe(reasoningSnippet);

      const textChunk = chunks.find((c) => c.type === 'text') as { type: 'text'; text: string };
      expect(textChunk).toBeDefined();
      expect(textChunk.text).toBe(contentSnippet);
    });

    it('1C: preserves complex mathematical equations and LaTeX symbols inside reasoning_content', async () => {
      const mathEquation =
        '$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$ and ' +
        '$$\\nabla \\times \\mathbf{B} = \\mu_0 \\mathbf{J} + \\mu_0 \\epsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}$$';

      const ssePayload = [
        `data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(mathEquation)}}}]}`,
        '',
        'data: {"choices":[{"delta":{"content":"Gaussian integral evaluated successfully."}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-reasoner');

      const stream = await model.doStream({ prompt: 'Calculate Gaussian integral' });
      const chunks = await collectChunks(stream);

      const reasoning = chunks
        .filter((c): c is { type: 'reasoning'; reasoning: string } => c.type === 'reasoning')
        .map((c) => c.reasoning)
        .join('');
      expect(reasoning).toBe(mathEquation);
    });

    it('1D: handles multi-language code blocks with indentation, fences, and newlines in reasoning_content', async () => {
      const pythonSnippet =
        '```python\ndef solve_euler_totient(n: int) -> int:\n    result = n\n    p = 2\n    while p * p <= n:\n        if n % p == 0:\n            while n % p == 0:\n                n //= p\n            result -= result // p\n        p += 1\n    if n > 1:\n        result -= result // n\n    return result\n```';

      const ssePayload = [
        `data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(pythonSnippet)}}}]}`,
        '',
        'data: {"choices":[{"delta":{"content":"Function computed."}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1:70b');

      const stream = await model.doStream({ prompt: 'Write Euler totient in python' });
      const chunks = await collectChunks(stream);

      const reasoning = chunks
        .filter((c): c is { type: 'reasoning'; reasoning: string } => c.type === 'reasoning')
        .map((c) => c.reasoning)
        .join('');
      expect(reasoning).toBe(pythonSnippet);
    });

    it('1E: supports alternate proxy field delta.reasoning seamlessly', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning":"Proxy emitted reasoning field"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Target response."}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1');

      const stream = await model.doStream({ prompt: 'Test proxy compatibility' });
      const chunks = await collectChunks(stream);

      expect(chunks[0]).toEqual({ type: 'reasoning', reasoning: 'Proxy emitted reasoning field' });
      expect(chunks[1]).toEqual({ type: 'text', text: 'Target response.' });
      expect(chunks[2]).toEqual({ type: 'finish', finishReason: 'stop' });
    });
  });

  // ===========================================================================
  // 2. Extreme Byte Boundary Fragmentation
  // ===========================================================================
  describe('2. Extreme Byte Boundary Fragmentation & Reassembly', () => {
    const rawSseStream = [
      'data: {"choices":[{"delta":{"content":"The quick "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"brown fox "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"jumps over "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"the lazy "}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"dog. 🦊🐶"}}]}',
      '',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":15,"total_tokens":25}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    it('2A: 1-byte stream fragmentation (every single byte sent individually)', async () => {
      const byteChunks = sliceIntoFixedBytes(rawSseStream, 1);
      const stream = createChunkedByteStream(byteChunks);

      const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3.2');

      const aiStream = await model.doStream({ prompt: 'Test 1-byte chunks' });
      const chunks = await collectChunks(aiStream);

      const fullText = chunks
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      expect(fullText).toBe('The quick brown fox jumps over the lazy dog. 🦊🐶');

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
      });
    });

    it('2B: 2-byte stream fragmentation', async () => {
      const byteChunks = sliceIntoFixedBytes(rawSseStream, 2);
      const stream = createChunkedByteStream(byteChunks);

      const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const aiStream = await model.doStream({ prompt: 'Test 2-byte chunks' });
      const chunks = await collectChunks(aiStream);

      const fullText = chunks
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      expect(fullText).toBe('The quick brown fox jumps over the lazy dog. 🦊🐶');
    });

    it('2C: random byte boundaries (1 to 7 bytes pseudo-randomly partitioned)', async () => {
      for (const seed of [42, 1337, 99999]) {
        const byteChunks = sliceIntoRandomBytes(rawSseStream, seed);
        const stream = createChunkedByteStream(byteChunks);

        const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
        const model = createCustomAI({ fetch: mockFetch })('mistral');

        const aiStream = await model.doStream({ prompt: `Random seed ${seed}` });
        const chunks = await collectChunks(aiStream);

        const fullText = chunks
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');

        expect(fullText).toBe('The quick brown fox jumps over the lazy dog. 🦊🐶');
      }
    });

    it('2D: handles CRLF (\\r\\n) and mixed newlines split across byte boundaries', async () => {
      const crlfStream = [
        'data: {"choices":[{"delta":{"content":"Line 1\\r\\n"}}]}\r\n\r\n',
        ': sse keepalive comment\r\n\r\n',
        'data: {"choices":[{"delta":{"content":"Line 2\\n"}}]}\n\n',
        'data: [DONE]\r\n\r\n',
      ].join('');

      const byteChunks = sliceIntoFixedBytes(crlfStream, 3);
      const stream = createChunkedByteStream(byteChunks);

      const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('qwen2.5');

      const aiStream = await model.doStream({ prompt: 'Test CRLF' });
      const chunks = await collectChunks(aiStream);

      const fullText = chunks
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      expect(fullText).toBe('Line 1\r\nLine 2\n');
    });

    it('2E: splits multibyte 3-byte and 4-byte UTF-8 codepoints exactly in the middle across chunks', async () => {
      // 🚀 is 4 bytes: [0xF0, 0x9F, 0x99, 0x80]
      // 🔥 is 4 bytes: [0xF0, 0x9F, 0x94, 0xA5]
      // 桜 (Japanese cherry blossom) is 3 bytes: [0xE6, 0xA1, 0x9C]
      const utf8Text = 'Launch 🚀 and Fire 🔥 and Sakura 桜.';
      const ssePayload = `data: {"choices":[{"delta":{"content":${JSON.stringify(utf8Text)}}}]}\n\ndata: [DONE]\n\n`;

      // Split 1 byte at a time through all multibyte sequences
      const byteChunks = sliceIntoFixedBytes(ssePayload, 1);
      const stream = createChunkedByteStream(byteChunks);

      const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3.1');

      const aiStream = await model.doStream({ prompt: 'Test multibyte splitting' });
      const chunks = await collectChunks(aiStream);

      const fullText = chunks
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');

      expect(fullText).toBe(utf8Text);
    });
  });

  // ===========================================================================
  // 3. Tool Calling Streaming Deltas & JSON Reconstruction
  // ===========================================================================
  describe('3. Tool Calling Streaming Deltas & Index Tracking', () => {
    it('3A: streams multiple parallel tool calls with index tracking and arguments reconstruction', async () => {
      const ssePayload = [
        // Tool 0 initial delta
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_weather_101","type":"function","function":{"name":"getWeather","arguments":"{\\"city\\": "}}]}}]}',
        '',
        // Tool 1 initial delta
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_stocks_202","type":"function","function":{"name":"getStockQuote","arguments":"{\\"symbol\\": "}}]}}]}',
        '',
        // Tool 0 argument chunk
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Tokyo\\", \\"units\\": "}}]}}]}',
        '',
        // Tool 1 argument chunk
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\\"AAPL\\", \\"history\\": true}"}}]}}]}',
        '',
        // Tool 0 argument closing
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"metric\\"}"}}]}}]}',
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":45,"completion_tokens":60,"total_tokens":105}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3.1');

      const stream = await model.doStream({ prompt: 'Check Tokyo weather and AAPL stock' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c): c is { type: 'tool-call'; toolCall: any } => c.type === 'tool-call');
      expect(toolChunks.length).toBe(5);

      // Reconstruct tool call objects by index
      const toolCallsByIndex: Record<number, { id?: string; name?: string; arguments: string }> = {};
      for (const tc of toolChunks) {
        const idx = tc.toolCall.index ?? 0;
        if (!toolCallsByIndex[idx]) {
          toolCallsByIndex[idx] = { arguments: '' };
        }
        if (tc.toolCall.id) toolCallsByIndex[idx].id = tc.toolCall.id;
        if (tc.toolCall.name) toolCallsByIndex[idx].name = tc.toolCall.name;
        if (tc.toolCall.arguments) toolCallsByIndex[idx].arguments += tc.toolCall.arguments;
      }

      // Assert Tool 0 reconstruction
      expect(toolCallsByIndex[0].id).toBe('call_weather_101');
      expect(toolCallsByIndex[0].name).toBe('getWeather');
      expect(JSON.parse(toolCallsByIndex[0].arguments)).toEqual({
        city: 'Tokyo',
        units: 'metric',
      });

      // Assert Tool 1 reconstruction
      expect(toolCallsByIndex[1].id).toBe('call_stocks_202');
      expect(toolCallsByIndex[1].name).toBe('getStockQuote');
      expect(JSON.parse(toolCallsByIndex[1].arguments)).toEqual({
        symbol: 'AAPL',
        history: true,
      });

      // Assert finish reason
      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'tool_calls',
        usage: {
          promptTokens: 45,
          completionTokens: 60,
          totalTokens: 105,
        },
      });
    });

    it('3B: handles complex nested JSON arguments in tool calling stream', async () => {
      const nestedPayload = {
        transactionId: 'tx_987654321',
        operations: [
          { type: 'debit', account: 'acc_A', amount: 500.75, currency: 'USD' },
          { type: 'credit', account: 'acc_B', amount: 500.75, currency: 'USD' },
        ],
        metadata: {
          initiatedBy: 'service_worker',
          dryRun: false,
          nestedFlags: [true, false, null],
        },
      };

      const serialized = JSON.stringify(nestedPayload);
      // Split into 4 chunks
      const part1 = serialized.slice(0, 30);
      const part2 = serialized.slice(30, 80);
      const part3 = serialized.slice(80, 140);
      const part4 = serialized.slice(140);

      const ssePayload = [
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_batch_tx","type":"function","function":{"name":"executeBatch","arguments":${JSON.stringify(part1)}}}]}}]}`,
        '',
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(part2)}}}]}}]}`,
        '',
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(part3)}}}]}}]}`,
        '',
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(part4)}}}]}}]}`,
        '',
        'data: {"choices":[{"finish_reason":"tool_calls"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3.2');

      const stream = await model.doStream({ prompt: 'Execute nested batch transaction' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c): c is { type: 'tool-call'; toolCall: any } => c.type === 'tool-call');
      const assembledArgs = toolChunks.map((c) => c.toolCall.arguments ?? '').join('');
      const parsed = JSON.parse(assembledArgs);

      expect(parsed).toEqual(nestedPayload);
    });
  });

  // ===========================================================================
  // 4. Structured JSON Mode & generateObject Integration
  // ===========================================================================
  describe('4. Structured JSON Mode & generateObject Integration', () => {
    it('4A: Ollama native format: "json" passes format and response_format to request body', async () => {
      let capturedBody: any;
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{"content":"{\\"status\\":\\"success\\",\\"model\\":\\"llama3\\"}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
            { status: 200 },
          ),
        );
      });

      const model = createCustomAI({ fetch: mockFetch })('llama3', { format: 'json' });
      await model.doStream({ prompt: 'Generate JSON status' });

      expect(capturedBody.format).toBe('json');
      expect(capturedBody.response_format).toEqual({ type: 'json_object' });
    });

    it('4B: integrates with generateObject using Standard Schema v1', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"choices":[{"delta":{"content":"{\\"service\\":\\"ollama\\",\\"latencyMs\\":14.5,\\"healthy\\":true}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );

      const model = createCustomAI({ fetch: mockFetch })('mistral');

      const standardSchema: StandardSchemaV1<{ service: string; latencyMs: number; healthy: boolean }> = {
        '~standard': {
          version: 1,
          vendor: 'challenger-test',
          validate: (val: unknown) => {
            const v = val as { service: string; latencyMs: number; healthy: boolean };
            if (
              typeof v?.service === 'string' &&
              typeof v?.latencyMs === 'number' &&
              typeof v?.healthy === 'boolean'
            ) {
              return { value: v };
            }
            return { issues: [{ message: 'Invalid service health schema' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: standardSchema,
        prompt: 'Return health check JSON',
      });

      expect(result.object).toEqual({
        service: 'ollama',
        latencyMs: 14.5,
        healthy: true,
      });
      expect(result.rawText).toBe('{"service":"ollama","latencyMs":14.5,"healthy":true}');
    });

    it('4C: extracts JSON enclosed in markdown code fences emitted by local LLMs', async () => {
      const fencedOutput = 'Here is the requested output:\n```json\n{\n  "cluster": "local-vllm",\n  "nodes": 4\n}\n```\nHope this helps!';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(fencedOutput)}}, "finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createCustomAI({ fetch: mockFetch })('qwen2.5');

      const standardSchema: StandardSchemaV1<{ cluster: string; nodes: number }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { cluster: string; nodes: number };
            if (typeof v?.cluster === 'string' && typeof v?.nodes === 'number') {
              return { value: v };
            }
            return { issues: [{ message: 'Cluster schema mismatch' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: standardSchema,
        prompt: 'Return cluster info',
      });

      expect(result.object).toEqual({ cluster: 'local-vllm', nodes: 4 });
    });

    it('4D: throws AIValidationError when model output fails schema validation', async () => {
      // Missing required 'score' field
      const invalidJson = '{"name": "test-item"}';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(invalidJson)}}, "finish_reason":"stop"}]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const strictSchema: StandardSchemaV1<{ name: string; score: number }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { name: string; score: number };
            if (typeof v?.name === 'string' && typeof v?.score === 'number') {
              return { value: v };
            }
            return { issues: [{ message: 'Field "score" must be a number' }] };
          },
        },
      };

      await expect(
        generateObject({
          model,
          schema: strictSchema,
          prompt: 'Score this',
        }),
      ).rejects.toThrow(AIValidationError);
    });

    it('4E: throws SyntaxError when local model emits completely non-JSON gibberish', async () => {
      const nonJson = 'I am an AI and I cannot generate that for you.';

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          `data: {"choices":[{"delta":{"content":${JSON.stringify(nonJson)}}},"finish_reason":"stop"]}\n\ndata: [DONE]\n\n`,
          { status: 200 },
        ),
      );

      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const anySchema: StandardSchemaV1<unknown> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (val) => ({ value: val }),
        },
      };

      await expect(
        generateObject({
          model,
          schema: anySchema,
          prompt: 'Gibberish test',
        }),
      ).rejects.toThrow(SyntaxError);
    });
  });

  // ===========================================================================
  // 5. AbortSignal Cancellation & Resilience
  // ===========================================================================
  describe('5. AbortSignal Cancellation & Connection Resilience', () => {
    it('5A: rejects immediately when signal is pre-aborted before network request', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Pre-aborted test signal'));

      const mockFetch = vi.fn();
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      await expect(
        model.doStream({ prompt: 'test', signal: controller.signal }),
      ).rejects.toThrow('Pre-aborted test signal');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('5B: handles mid-stream abort: stops reading and cancels upstream reader', async () => {
      const controller = new AbortController();

      // Infinite stream simulator
      let streamCancelled = false;
      const infiniteStream = new ReadableStream<Uint8Array>({
        start(c) {
          const encoder = new TextEncoder();
          let count = 0;
          const interval = setInterval(() => {
            if (streamCancelled) {
              clearInterval(interval);
              return;
            }
            count++;
            c.enqueue(
              encoder.encode(`data: {"choices":[{"delta":{"content":"Chunk ${count} "}}]}\n\n`),
            );
          }, 10);
        },
        cancel() {
          streamCancelled = true;
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(infiniteStream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({ prompt: 'Infinite test', signal: controller.signal });
      const reader = stream.getReader();

      // Read first chunk
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Chunk 1 ' });

      // Read second chunk
      const second = await reader.read();
      expect(second.value).toEqual({ type: 'text', text: 'Chunk 2 ' });

      // Abort controller
      controller.abort(new Error('User aborted mid-stream'));

      // Cancel reader to ensure clean tear-down
      await reader.cancel('Aborted');
      expect(streamCancelled).toBe(true);
    });

    it('5C: handles network connection drops (fetch throws network error)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch: Connection refused'));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      await expect(model.doStream({ prompt: 'Test connection drop' })).rejects.toThrow(
        /Failed to fetch: Connection refused/i,
      );
    });

    it('5D: handles mid-stream network drop (ReadableStream errors out)', async () => {
      const encoder = new TextEncoder();
      let enqueued = false;
      const faultyStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!enqueued) {
            enqueued = true;
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"Initial part"}}]}\n\n'),
            );
          } else {
            // Simulate connection drop on subsequent read
            controller.error(new Error('TCP socket connection reset by peer'));
          }
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(faultyStream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({ prompt: 'Test TCP reset' });
      const reader = stream.getReader();

      // First chunk arrives
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Initial part' });

      // Next read encounters stream error
      await expect(reader.read()).rejects.toThrow(/TCP socket connection reset by peer/i);
    });
  });

  // ===========================================================================
  // 6. Core @ranu/ai Integration & Concurrent Load
  // ===========================================================================
  describe('6. Core @ranu/ai Integration with streamAI under Concurrent Load', () => {
    it('6A: streamAI formats SSE frames correctly with custom provider', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Analyze logic."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Execution finished."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":15,"completion_tokens":25,"total_tokens":40}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1');

      const response = await streamAI({
        model,
        prompt: 'Full stream test',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');

      const responseText = await response.text();
      expect(responseText).toContain('event: reasoning\ndata: {"reasoning":"Analyze logic.","text":"Analyze logic."}\n\n');
      expect(responseText).toContain('event: chunk\ndata: {"text":"Execution finished."}\n\n');
      expect(responseText).toContain('"finishReason":"stop"');
      expect(responseText).toContain('data: [DONE]\n\n');
    });

    it('6B: handles high concurrency (25 parallel streams) with zero cross-talk', async () => {
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        const body = JSON.parse(init.body);
        const prompt = body.messages[0].content;
        const sse = [
          `data: {"choices":[{"delta":{"content":"Echo: ${prompt}"}}]}`,
          '',
          'data: {"choices":[{"finish_reason":"stop"}]}',
          '',
          'data: [DONE]',
        ].join('\n');
        return Promise.resolve(new Response(sse, { status: 200 }));
      });

      const provider = createCustomAI({ fetch: mockFetch });

      // Run 25 simultaneous streams
      const concurrentTasks = Array.from({ length: 25 }, async (_, index) => {
        const model = provider(`llama3-${index}`);
        const response = await streamAI({
          model,
          prompt: `Request_${index}`,
        });
        const text = await response.text();
        return { index, text };
      });

      const results = await Promise.all(concurrentTasks);

      expect(results.length).toBe(25);
      for (const res of results) {
        expect(res.text).toContain(`Echo: Request_${res.index}`);
      }
    });

    it('6C: normalizes baseURL variations with and without trailing slashes and /chat/completions', () => {
      expect(resolveBaseURL({ baseURL: 'http://localhost:11434/v1/' })).toBe('http://localhost:11434/v1/');
      expect(resolveBaseURL({ baseURL: 'http://localhost:11434/v1' })).toBe('http://localhost:11434/v1');
      expect(resolveBaseURL({ baseURL: 'https://gateway.internal/v1/chat/completions' })).toBe(
        'https://gateway.internal/v1/chat/completions',
      );
    });
  });
});
