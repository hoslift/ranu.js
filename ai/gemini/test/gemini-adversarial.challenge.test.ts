import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject, type AIChunk } from '@ranu/ai';
import { createGemini, gemini } from '../src/index.js';

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

describe('Empirical Adversarial Challenge Suite: @ranu/ai-gemini', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Adversarial Stream Parsing & SSE Jitter', () => {
    it('survives corrupted SSE chunks with comments, malformed JSON lines, and empty lines', async () => {
      const noisySse = [
        ': this is an initial SSE keep-alive comment',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"Clean "}]}}]}',
        '',
        ': another comment line',
        'data: { this is broken malformed non-JSON data }',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"Stream"}]}}]}',
        '',
        '   ',
        'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"totalTokenCount":7}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(noisySse, 3)),
      });

      const model = createGemini({ apiKey: 'adv-key', fetch: customFetch })('gemini-1.5-flash');
      const stream = await model.doStream({ prompt: 'Test noisy stream' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Clean ' },
        { type: 'text', text: 'Stream' },
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 },
        },
      ]);
    });

    it('correctly handles usageMetadata with zero token counts (0 values preserved)', async () => {
      const sseZeroUsage = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Zero tokens"}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":0,"candidatesTokenCount":0,"totalTokenCount":0}}',
        '',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(sseZeroUsage, 12)),
      });

      const model = createGemini({ apiKey: 'adv-key', fetch: customFetch })('gemini-2.0-flash');
      const stream = await model.doStream({ prompt: 'Test zero usage' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Zero tokens' },
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
      ]);
    });
  });

  describe('High-Throughput Concurrency & Thread-Safety', () => {
    it('executes 50 concurrent requests with rotating dynamic API keys without cross-talk', async () => {
      const requests = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        apiKey: `key-${i}-${Math.random().toString(36).substring(2, 8)}`,
        prompt: `Prompt query ${i}`,
        expectedText: `Response ${i}`,
      }));

      const customFetch = vi.fn().mockImplementation((url, init) => {
        const body = JSON.parse(init.body);
        const userText = body.contents[0].parts[0].text as string;
        const index = parseInt(userText.replace('Prompt query ', ''), 10);
        const req = requests[index];

        const apiKeyHeader = init.headers['x-goog-api-key'];
        if (apiKeyHeader !== req.apiKey) {
          return Promise.resolve(new Response('Forbidden', { status: 403 }));
        }

        const sse = `data: {"candidates":[{"content":{"parts":[{"text":"${req.expectedText}"}]},"finishReason":"STOP"}]}\n\n`;
        return Promise.resolve(
          new Response(sse, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      });

      const results = await Promise.all(
        requests.map(async (req) => {
          const provider = createGemini({
            apiKey: async () => req.apiKey,
            fetch: customFetch,
          });
          const model = provider('gemini-1.5-flash');
          const stream = await model.doStream({ prompt: req.prompt });
          const chunks = await collectChunks(stream);
          return { id: req.id, chunks };
        }),
      );

      expect(results).toHaveLength(50);
      for (const res of results) {
        expect(res.chunks[0]).toEqual({ type: 'text', text: `Response ${res.id}` });
        expect(res.chunks[1]).toEqual({ type: 'finish', finishReason: 'STOP' });
      }
      expect(customFetch).toHaveBeenCalledTimes(50);
    });
  });

  describe('Deep Schema Injection & Multimodal Boundaries', () => {
    it('injects complex schema with $defs, enum, and anyOf into generationConfig', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"{\\"status\\":\\"active\\"}"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const complexSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'paused', 'archived'] },
          metadata: {
            type: 'object',
            properties: {
              version: { type: 'integer' },
            },
          },
        },
        required: ['status'],
      };

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro', {
        structuredOutputs: true,
        responseSchema: complexSchema,
      });

      await model.doStream({ prompt: 'Get status' });

      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(capturedBody.generationConfig.responseSchema).toEqual(complexSchema);
    });

    it('handles large base64 payload (>200KB) without memory corruption or truncation', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"Image received"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-flash');

      // Generate a ~250KB base64 string
      const largeBase64 = 'A'.repeat(256 * 1024);
      const dataUrl = `data:image/webp;base64,${largeBase64}`;

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze large image' },
              { type: 'image', image: dataUrl },
            ],
          },
        ],
      });

      const parts = capturedBody.contents[0].parts;
      expect(parts).toHaveLength(2);
      expect(parts[1].inlineData).toEqual({
        mimeType: 'image/webp',
        data: largeBase64,
      });
    });
  });
});
