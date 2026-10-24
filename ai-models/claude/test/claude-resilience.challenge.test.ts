import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamAI,
  generateObject,
  AIValidationError,
  type AIChunk,
  type StandardSchemaV1,
} from '@ranu/ai';
import { createClaude, claude } from '../src/index.js';

// --- Test Helpers ---

function createByteStreamResponse(chunks: Uint8Array[], status = 200, statusText = 'OK'): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    statusText,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

function sliceIntoByteChunks(text: string, chunkSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const allBytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < allBytes.length; i += chunkSize) {
    chunks.push(allBytes.slice(i, i + chunkSize));
  }
  return chunks;
}

function sliceIntoRandomByteChunks(text: string, minSize: number, maxSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const allBytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < allBytes.length) {
    const size = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    chunks.push(allBytes.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

async function collectChunks(stream: ReadableStream<AIChunk>): Promise<AIChunk[]> {
  const reader = stream.getReader();
  const chunks: AIChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

function createStandardSchema<T>(
  validateFn: (value: unknown) =>
    | { value: T; issues?: undefined }
    | { issues: readonly { message: string; path?: readonly (string | number | symbol)[] }[]; value?: undefined },
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'challenge-vendor',
      validate: validateFn,
    },
  };
}

// --- Test Suite ---

describe('@ranu/ai-claude Empirical Challenge & Stress Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Fragmented Anthropic SSE Streams', () => {
    it('1.1 survives 1-byte extreme byte boundary fragmentation with text deltas and UTF-8 multibyte characters', async () => {
      const sseText = [
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_frag_1","role":"assistant","usage":{"input_tokens":12}}}\n\n',
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello 🚀 "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world € "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"こんにちは!"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const singleByteChunks = sliceIntoByteChunks(sseText, 1);
      const mockFetch = vi.fn().mockResolvedValue(createByteStreamResponse(singleByteChunks));

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');
      const stream = await model.doStream({ prompt: 'Say hello with emojis' });
      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === 'text');
      const fullText = textChunks.map((c) => (c.type === 'text' ? c.text : '')).join('');
      expect(fullText).toBe('Hello 🚀 world € こんにちは!');

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      });
    });

    it('1.2 survives 2-byte fragmentation across input_json_delta JSON boundaries', async () => {
      const sseText = [
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_2byte","name":"configure_server"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"port\\": 8080, "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"host\\": \\"0.0.0.0\\", "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"ssl\\": true}"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":25}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const twoByteChunks = sliceIntoByteChunks(sseText, 2);
      const mockFetch = vi.fn().mockResolvedValue(createByteStreamResponse(twoByteChunks));

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');
      const stream = await model.doStream({ prompt: 'Configure server' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolChunks.length).toBe(4); // 1 start + 3 deltas

      expect(toolChunks[0]?.toolCall).toEqual({
        id: 'toolu_2byte',
        name: 'configure_server',
        arguments: '',
      });

      const assembledJson = toolChunks.slice(1).map((c) => c.toolCall?.arguments ?? '').join('');
      expect(JSON.parse(assembledJson)).toEqual({
        port: 8080,
        host: '0.0.0.0',
        ssl: true,
      });

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk?.finishReason).toBe('tool_calls');
    });

    it('1.3 survives irregular multi-byte jitter (3, 7, 13 bytes) with comments and CRLF splits', async () => {
      const sseText = [
        ': sse keepalive ping\r\n\r\n',
        'event: content_block_start\r\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\r\n\r\n',
        ': arbitrary comment in middle\r\n',
        'event: content_block_delta\r\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Line 1\\r\\nLine 2"}}\r\n\r\n',
        'event: content_block_stop\r\n',
        'data: {"type":"content_block_stop","index":0}\r\n\r\n',
        'event: message_stop\r\n',
        'data: {"type":"message_stop"}\r\n\r\n',
      ].join('');

      const randomChunks = sliceIntoRandomByteChunks(sseText, 3, 13);
      const mockFetch = vi.fn().mockResolvedValue(createByteStreamResponse(randomChunks));

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-haiku-20241022');
      const stream = await model.doStream({ prompt: 'Multi-line text' });
      const chunks = await collectChunks(stream);

      const textChunk = chunks.find((c) => c.type === 'text');
      expect(textChunk).toEqual({ type: 'text', text: 'Line 1\r\nLine 2' });
    });
  });

  describe('2. Prompt Caching & Metadata Tracking', () => {
    it('2.1 generates anthropic-beta header and merges with existing beta headers without duplicates', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: {"type":"message_stop"}\n\n', { status: 200 }));
      });

      // Config with existing beta header
      const model = createClaude({
        apiKey: 'sk-ant-test',
        headers: { 'anthropic-beta': 'messages-2023-12-15' },
        fetch: mockFetch,
      })('claude-3-5-sonnet-20241022', {
        promptCaching: true,
        system: 'System prompt',
      });

      await model.doStream({ prompt: 'test' });

      expect(capturedHeaders['anthropic-beta']).toBe('messages-2023-12-15,prompt-caching-2024-07-31');
    });

    it('2.2 generates anthropic-beta when enabled via per-call options', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: {"type":"message_stop"}\n\n', { status: 200 }));
      });

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');
      await model.doStream({ prompt: 'test', promptCaching: true, system: 'Cache me' } as any);

      expect(capturedHeaders['anthropic-beta']).toBe('prompt-caching-2024-07-31');
    });

    it('2.3 assigns ephemeral cache_control specifically to the last system block in array', async () => {
      let capturedBody: any;
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(new Response('data: {"type":"message_stop"}\n\n', { status: 200 }));
      });

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022', {
        promptCaching: true,
        system: [
          { type: 'text', text: 'Block 1: Rules' },
          { type: 'text', text: 'Block 2: API reference' },
          { type: 'text', text: 'Block 3: Large codebase index' },
        ],
      });

      await model.doStream({ prompt: 'Refactor code' });

      expect(capturedBody.system).toHaveLength(3);
      expect(capturedBody.system[0]).toEqual({ type: 'text', text: 'Block 1: Rules' });
      expect(capturedBody.system[1]).toEqual({ type: 'text', text: 'Block 2: API reference' });
      expect(capturedBody.system[2]).toEqual({
        type: 'text',
        text: 'Block 3: Large codebase index',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('2.4 accurately calculates total promptTokens from input_tokens + cache_creation + cache_read', async () => {
      const sseText = [
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_cache_usage","usage":{"input_tokens":1200,"cache_creation_input_tokens":450,"cache_read_input_tokens":800}}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Cached response"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":150}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'test' });
      const chunks = await collectChunks(stream);

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'stop',
        usage: {
          promptTokens: 2450, // 1200 + 450 + 800
          completionTokens: 150,
          totalTokens: 2600, // 2450 + 150
        },
      });
    });
  });

  describe('3. Tool Calling Streaming & Reconstruction', () => {
    it('3.1 handles multiple sequential tools with discrete index tracking', async () => {
      const sseText = [
        // Tool 1: read_file (index 0)
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_read_01","name":"read_file"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\": \\"index.ts\\"}"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":0}\n\n',

        // Tool 2: write_file (index 1)
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_write_02","name":"write_file"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"target\\": \\"out.ts\\", \\"content\\": \\"export const a = 1;\\"}"}}\n\n',
        'event: content_block_stop\n',
        'data: {"type":"content_block_stop","index":1}\n\n',

        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":45}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'Read and write' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolChunks).toHaveLength(4);

      // Tool 1 verification
      expect(toolChunks[0]?.toolCall?.id).toBe('tool_read_01');
      expect(toolChunks[0]?.toolCall?.name).toBe('read_file');
      expect(JSON.parse(toolChunks[1]?.toolCall?.arguments ?? '')).toEqual({ path: 'index.ts' });

      // Tool 2 verification
      expect(toolChunks[2]?.toolCall?.id).toBe('tool_write_02');
      expect(toolChunks[2]?.toolCall?.name).toBe('write_file');
      expect(JSON.parse(toolChunks[3]?.toolCall?.arguments ?? '')).toEqual({
        target: 'out.ts',
        content: 'export const a = 1;',
      });
    });

    it('3.2 handles interleaved multi-tool deltas correctly routing to respective tool ID by index', async () => {
      const sseText = [
        // Start Tool 0
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_alpha","name":"alphaAction"}}\n\n',
        // Start Tool 1
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_beta","name":"betaAction"}}\n\n',
        // Interleaved deltas: delta 0, delta 1, delta 0, delta 1
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"step\\": 1,"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"flag\\": true,"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" \\"done\\": false}"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" \\"count\\": 99}"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'Interleaved execution' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolChunks).toHaveLength(6); // 2 starts + 4 deltas

      // Reconstruct Alpha (tool_alpha)
      const alphaDeltas = toolChunks
        .filter((c) => c.toolCall?.id === 'tool_alpha' && c.toolCall?.arguments)
        .map((c) => c.toolCall?.arguments ?? '')
        .join('');
      expect(JSON.parse(alphaDeltas)).toEqual({ step: 1, done: false });

      // Reconstruct Beta (tool_beta)
      const betaDeltas = toolChunks
        .filter((c) => c.toolCall?.id === 'tool_beta' && c.toolCall?.arguments)
        .map((c) => c.toolCall?.arguments ?? '')
        .join('');
      expect(JSON.parse(betaDeltas)).toEqual({ flag: true, count: 99 });
    });

    it('3.3 reconstructs a large 50KB nested payload split across 40+ partial deltas', async () => {
      const largePayload = {
        meta: { generated: true, timestamp: 1729270000 },
        records: Array.from({ length: 300 }, (_, i) => ({
          id: `rec_${i}`,
          data: `data-chunk-${i}-with-extra-padding-string-for-volume`,
          valid: i % 2 === 0,
        })),
      };
      const jsonStr = JSON.stringify(largePayload);
      expect(jsonStr.length).toBeGreaterThan(20000);

      // Split into 40 deltas
      const deltaSize = Math.ceil(jsonStr.length / 40);
      const deltas: string[] = [];
      for (let i = 0; i < jsonStr.length; i += deltaSize) {
        deltas.push(jsonStr.slice(i, i + deltaSize));
      }

      const sseParts: string[] = [
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_large_json","name":"process_large"}}\n\n',
      ];
      for (const d of deltas) {
        sseParts.push(
          'event: content_block_delta\n',
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(d)}}}\n\n`,
        );
      }
      sseParts.push(
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      );

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseParts.join(''), { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'Process big json' });
      const chunks = await collectChunks(stream);

      const toolChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolChunks).toHaveLength(1 + deltas.length);

      const reconstructed = toolChunks.slice(1).map((c) => c.toolCall?.arguments ?? '').join('');
      expect(reconstructed).toBe(jsonStr);
      expect(JSON.parse(reconstructed)).toEqual(largePayload);
    });
  });

  describe('4. Concurrency Stress Test (60 Simultaneous Requests)', () => {
    it('4.1 runs 60 simultaneous Claude requests with zero cross-talk, distinct responses and token accounting', async () => {
      const concurrency = 60;

      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        const body = JSON.parse(init.body);
        const userPrompt = body.messages[0].content;
        const match = /request_id:(\d+)/.exec(userPrompt);
        const reqId = match ? parseInt(match[1], 10) : 0;

        // Produce a unique SSE stream with synthetic delay
        const sseText = [
          `event: message_start\n`,
          `data: {"type":"message_start","message":{"id":"msg_${reqId}","usage":{"input_tokens":${10 + reqId}}}}\n\n`,
          `event: content_block_delta\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Response for ${reqId} [part A]"}}\n\n`,
          `event: content_block_delta\n`,
          `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" - [part B ${reqId}]"}}\n\n`,
          `event: message_delta\n`,
          `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":${5 + reqId}}}\n\n`,
          `event: message_stop\n`,
          `data: {"type":"message_stop"}\n\n`,
        ].join('');

        const encoder = new TextEncoder();
        const bytes = encoder.encode(sseText);

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            // Slight jitter
            await new Promise((r) => setTimeout(r, Math.random() * 10));
            controller.enqueue(bytes.slice(0, 50));
            await new Promise((r) => setTimeout(r, Math.random() * 10));
            controller.enqueue(bytes.slice(50));
            controller.close();
          },
        });

        return Promise.resolve(new Response(stream, { status: 200 }));
      });

      const provider = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch });
      const model = provider('claude-3-5-sonnet-20241022');

      const tasks = Array.from({ length: concurrency }, async (_, i) => {
        const stream = await model.doStream({ prompt: `request_id:${i}` });
        const chunks = await collectChunks(stream);
        return { reqId: i, chunks };
      });

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(concurrency);

      for (const res of results) {
        const text = res.chunks
          .filter((c) => c.type === 'text')
          .map((c) => (c.type === 'text' ? c.text : ''))
          .join('');

        expect(text).toBe(`Response for ${res.reqId} [part A] - [part B ${res.reqId}]`);

        const finish = res.chunks.find((c) => c.type === 'finish');
        expect(finish).toEqual({
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: 10 + res.reqId,
            completionTokens: 5 + res.reqId,
            totalTokens: 15 + 2 * res.reqId,
          },
        });
      }
    });
  });

  describe('5. Network Failure Resilience', () => {
    it('5.1 rejects with HTTP 401 Unauthorized details', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{"type":"error","error":{"type":"authentication_error","message":"Invalid API Key provided"}}', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = createClaude({ apiKey: 'bad-key', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Claude request failed with status 401 Unauthorized: {"type":"error"/i,
      );
    });

    it('5.2 rejects with HTTP 429 Rate Limit error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{"type":"error","error":{"type":"rate_limit_error","message":"Usage limit exceeded"}}', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Claude request failed with status 429 Too Many Requests: {"type":"error"/i,
      );
    });

    it('5.3 rejects with HTTP 529 Anthropic Overloaded error', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('{"type":"error","error":{"type":"overloaded_error","message":"Anthropic is overloaded"}}', {
          status: 529,
          statusText: 'Site Overloaded',
        }),
      );

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Claude request failed with status 529 Site Overloaded: {"type":"error"/i,
      );
    });

    it('5.4 handles mid-stream client cancellation via AbortSignal', async () => {
      const abortCtrl = new AbortController();

      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Start"}}\n\n');
      const chunk2 = encoder.encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" Middle"}}\n\n');

      let streamCancelled = false;

      const upstreamStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk1);
          controller.enqueue(chunk2);
        },
        pull(controller) {
          // Keep open until cancelled
        },
        cancel() {
          streamCancelled = true;
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(upstreamStream, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'test', signal: abortCtrl.signal });
      const reader = stream.getReader();

      const firstRead = await reader.read();
      expect(firstRead.value).toEqual({ type: 'text', text: 'Start' });

      const secondRead = await reader.read();
      expect(secondRead.value).toEqual({ type: 'text', text: ' Middle' });

      // Now cancel the reader mid-stream
      await reader.cancel('Client abort reason');
      expect(streamCancelled).toBe(true);
    });

    it('5.5 propagates stream errors when upstream connection drops abruptly', async () => {
      let pullCount = 0;
      const upstreamStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount === 0) {
            pullCount++;
            controller.enqueue(new TextEncoder().encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Chunk"}}\n\n'));
          } else {
            controller.error(new Error('Connection reset by peer'));
          }
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(upstreamStream, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'test' });
      const reader = stream.getReader();

      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Chunk' });

      await expect(reader.read()).rejects.toThrow('Connection reset by peer');
    });

    it('5.6 emits error chunk on SSE error event payload', async () => {
      const ssePayload = 'data: {"type":"error","error":{"type":"api_error","message":"Internal model execution fault"}}\n\n';
      const mockFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));

      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');
      const stream = await model.doStream({ prompt: 'test' });
      const chunks = await collectChunks(stream);

      const errChunk = chunks.find((c) => c.type === 'error');
      expect(errChunk).toBeDefined();
      expect((errChunk as any).error.message).toBe('Internal model execution fault');
    });
  });

  describe('6. Integration with Core @ranu/ai (streamAI & generateObject)', () => {
    it('6.1 integrates with streamAI returning standard SSE Response with headers and frames', async () => {
      const sseText = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"world!"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const response = await streamAI({
        model,
        prompt: 'Say hello',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const bodyText = await response.text();
      expect(bodyText).toContain('event: chunk\ndata: {"text":"Hello "}\n\n');
      expect(bodyText).toContain('event: chunk\ndata: {"text":"world!"}\n\n');
      expect(bodyText).toContain('event: finish\n');
      expect(bodyText).toContain('data: [DONE]\n\n');
    });

    it('6.2 integrates with streamAI emitting tool-call SSE frames', async () => {
      const sseText = [
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_sse_01","name":"queryWeather"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\": \\"Tokyo\\"}"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const response = await streamAI({
        model,
        prompt: 'Check weather',
      });

      const bodyText = await response.text();
      expect(bodyText).toContain('event: tool-call\n');
      expect(bodyText).toContain('"id":"tool_sse_01"');
      expect(bodyText).toContain('"name":"queryWeather"');
    });

    it('6.3 integrates with generateObject parsing strict JSON from Claude text stream', async () => {
      interface UserProfile {
        name: string;
        roles: string[];
      }

      const schema = createStandardSchema<UserProfile>((value) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          typeof (value as any).name === 'string' &&
          Array.isArray((value as any).roles)
        ) {
          return { value: value as UserProfile };
        }
        return { issues: [{ message: 'Invalid UserProfile schema' }] };
      });

      const sseText = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"name\\": \\"Alice\\", "}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"\\"roles\\": [\\"admin\\", \\"developer\\"]}"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const result = await generateObject({
        model,
        schema,
        prompt: 'Return user profile',
      });

      expect(result.object).toEqual({
        name: 'Alice',
        roles: ['admin', 'developer'],
      });
      expect(result.finishReason).toBe('stop');
    });

    it('6.4 integrates with generateObject extracting JSON inside markdown code fence', async () => {
      interface ConfigObj {
        timeout: number;
        enabled: boolean;
      }

      const schema = createStandardSchema<ConfigObj>((value) => {
        const v = value as any;
        if (typeof v === 'object' && v !== null && typeof v.timeout === 'number' && typeof v.enabled === 'boolean') {
          return { value: v as ConfigObj };
        }
        return { issues: [{ message: 'Invalid ConfigObj' }] };
      });

      const sseText = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Here is your configuration:\\n```json\\n{\\n  \\"timeout\\": 5000,\\n  \\"enabled\\": true\\n}\\n```\\nEnjoy!"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const result = await generateObject({
        model,
        schema,
        prompt: 'Generate config',
      });

      expect(result.object).toEqual({
        timeout: 5000,
        enabled: true,
      });
    });

    it('6.5 integrates with generateObject extracting object from tool-call arguments', async () => {
      interface SearchQuery {
        query: string;
        limit: number;
      }

      const schema = createStandardSchema<SearchQuery>((value) => {
        const v = value as any;
        if (typeof v === 'object' && v !== null && typeof v.query === 'string' && typeof v.limit === 'number') {
          return { value: v as SearchQuery };
        }
        return { issues: [{ message: 'Invalid SearchQuery' }] };
      });

      const sseText = [
        'event: content_block_start\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_obj_01","name":"search"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\": \\"ranu framework\\", \\"limit\\": 10}"}}\n\n',
        'event: message_delta\n',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      const result = await generateObject({
        model,
        schema,
        prompt: 'Search',
      });

      expect(result.object).toEqual({
        query: 'ranu framework',
        limit: 10,
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('6.6 throws AIValidationError when model output fails schema validation in generateObject', async () => {
      const schema = createStandardSchema<{ count: number }>((value) => {
        const v = value as any;
        if (typeof v === 'object' && v !== null && typeof v.count === 'number') {
          return { value: v };
        }
        return { issues: [{ message: 'Property count must be a number' }] };
      });

      const sseText = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"count\\": \\"NOT_A_NUMBER\\"}"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseText, { status: 200 }));
      const model = createClaude({ apiKey: 'sk-ant-test', fetch: mockFetch })('claude-3-5-sonnet-20241022');

      await expect(generateObject({ model, schema, prompt: 'Give count' })).rejects.toThrow(AIValidationError);
    });
  });
});
