import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject, AIValidationError, type AIChunk } from '@ranu/ai';
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

describe('Empirical Challenge: @ranu/ai-gemini Multimodal & Streaming Stress Harness', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Multimodal Payloads Stress Tests', () => {
    it('1A: handles multi-image payloads in a single message with distinct data sources', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"Multi-image verified"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');

      const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
      const remoteJpgUrl = 'https://cdn.example.com/assets/visual.jpg';

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect these three images:' },
              { type: 'image', image: pngDataUrl },
              { type: 'image', image: gifBytes, mimeType: 'image/gif' },
              { type: 'image', image: remoteJpgUrl, mimeType: 'image/jpeg' },
            ],
          },
        ],
      });

      expect(capturedBody).toBeDefined();
      const parts = capturedBody.contents[0].parts;
      expect(parts).toHaveLength(4);

      expect(parts[0]).toEqual({ text: 'Inspect these three images:' });
      expect(parts[1]).toEqual({
        inlineData: {
          mimeType: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        },
      });
      expect(parts[2]).toEqual({
        inlineData: {
          mimeType: 'image/gif',
          data: Buffer.from(gifBytes).toString('base64'),
        },
      });
      expect(parts[3]).toEqual({
        fileData: {
          mimeType: 'image/jpeg',
          fileUri: remoteJpgUrl,
        },
      });
    });

    it('1B: preserves multi-turn conversation with multimodal attachments across roles', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"Turn completed"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-flash');

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Here is the diagram' },
              { type: 'image', image: 'https://example.com/diagram1.png', mimeType: 'image/png' },
            ],
          },
          {
            role: 'assistant',
            content: 'I observed the diagram. Please provide the updated version.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Here is diagram 2 and diagram 3' },
              { type: 'image', image: 'https://example.com/diagram2.png', mimeType: 'image/png' },
              { type: 'image', image: 'https://example.com/diagram3.png', mimeType: 'image/png' },
            ],
          },
        ],
      });

      expect(capturedBody.contents).toHaveLength(3);
      expect(capturedBody.contents[0].role).toBe('user');
      expect(capturedBody.contents[0].parts).toHaveLength(2);
      expect(capturedBody.contents[1].role).toBe('model');
      expect(capturedBody.contents[1].parts).toEqual([{ text: 'I observed the diagram. Please provide the updated version.' }]);
      expect(capturedBody.contents[2].role).toBe('user');
      expect(capturedBody.contents[2].parts).toHaveLength(3);
    });

    it('1C: handles audio mimeTypes (audio/mp3 and audio/wav) via raw base64, Uint8Array, and URL', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"Audio processed"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');

      const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00]);
      const mp3DataUrl = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA';
      const wavUrl = new URL('https://cloud.google.com/sample-audio.wav');

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'audio', audio: mp3DataUrl, mimeType: 'audio/mp3' },
              { type: 'audio', audio: wavBytes, mimeType: 'audio/wav' },
              { type: 'audio', audio: wavUrl, mimeType: 'audio/wav' },
            ],
          },
        ],
      });

      const parts = capturedBody.contents[0].parts;
      expect(parts).toHaveLength(3);

      expect(parts[0].inlineData).toEqual({
        mimeType: 'audio/mp3',
        data: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA',
      });
      expect(parts[1].inlineData).toEqual({
        mimeType: 'audio/wav',
        data: Buffer.from(wavBytes).toString('base64'),
      });
      expect(parts[2].fileData).toEqual({
        mimeType: 'audio/wav',
        fileUri: 'https://cloud.google.com/sample-audio.wav',
      });
    });

    it('1D: handles video remote URIs (https://, gs://) and URL instances', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"Video processed"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'video', video: 'https://storage.googleapis.com/videos/lecture.mp4', mimeType: 'video/mp4' },
              { type: 'video', video: 'gs://enterprise-bucket/raw-footage.webm', mimeType: 'video/webm' },
              { type: 'video', video: new URL('https://cdn.example.com/clip.mp4'), mimeType: 'video/mp4' },
            ],
          },
        ],
      });

      const parts = capturedBody.contents[0].parts;
      expect(parts).toHaveLength(3);
      expect(parts[0].fileData).toEqual({
        mimeType: 'video/mp4',
        fileUri: 'https://storage.googleapis.com/videos/lecture.mp4',
      });
      expect(parts[1].fileData).toEqual({
        mimeType: 'video/webm',
        fileUri: 'gs://enterprise-bucket/raw-footage.webm',
      });
      expect(parts[2].fileData).toEqual({
        mimeType: 'video/mp4',
        fileUri: 'https://cdn.example.com/clip.mp4',
      });
    });
  });

  describe('2. Fragmented Gemini SSE Stream Stress Tests', () => {
    it('2A: reconstructs SSE stream with 1-byte chunking across JSON boundaries', async () => {
      const fullSse = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Streamed "}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"content "}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"empirically verified."}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":6,"totalTokenCount":16}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      const byteChunks = sliceIntoBytes(fullSse, 1);
      expect(byteChunks.length).toBeGreaterThan(100);

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(byteChunks),
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');
      const stream = await model.doStream({ prompt: 'Generate' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Streamed ' },
        { type: 'text', text: 'content ' },
        { type: 'text', text: 'empirically verified.' },
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 },
        },
      ]);
    });

    it('2B: handles multi-byte UTF-8 split across arbitrary byte chunk boundaries', async () => {
      const unicodeText = 'Gemini 2.0 Flash 🚀 - Test unicode parsing: \u00E9\u00E8\u00E0 - \u2705 \uD83D\uDD25';
      const fullSse = `data: {"candidates":[{"content":{"parts":[{"text":"${unicodeText}"}]},"finishReason":"STOP"}]}\n\n`;

      const byteChunks = sliceIntoBytes(fullSse, 2);

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(byteChunks),
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-2.0-flash');
      const stream = await model.doStream({ prompt: 'Generate' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: unicodeText },
        { type: 'finish', finishReason: 'STOP' },
      ]);
    });

    it('2C: handles diverse finish reasons: STOP, MAX_TOKENS, SAFETY, RECITATION', async () => {
      const reasons = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION'];

      for (const reason of reasons) {
        const fullSse = [
          'data: {"candidates":[{"content":{"parts":[{"text":"Partial output"}]}}]}',
          '',
          `data: {"candidates":[{"finishReason":"${reason}"}],"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":10,"totalTokenCount":60}}`,
          '',
        ].join('\n');

        const customFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: createChunkedByteStream(sliceIntoBytes(fullSse, 7)),
        });

        const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');
        const stream = await model.doStream({ prompt: 'Test reason' });
        const chunks = await collectChunks(stream);

        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toEqual({ type: 'text', text: 'Partial output' });
        expect(chunks[1]).toEqual({
          type: 'finish',
          finishReason: reason,
          usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
        });
      }
    });

    it('2D: handles Windows CRLF (\\r\\n) and mixed line endings in SSE', async () => {
      const sseCrlf = 'data: {"candidates":[{"content":{"parts":[{"text":"CRLF 1"}]}}]}\r\n\r\ndata: {"candidates":[{"content":{"parts":[{"text":"CRLF 2"}]}}]}\r\n\r\ndata: {"candidates":[{"finishReason":"STOP"}]}\r\n\r\n';

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(sseCrlf, 5)),
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-flash');
      const stream = await model.doStream({ prompt: 'Test CRLF' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'CRLF 1' },
        { type: 'text', text: 'CRLF 2' },
        { type: 'finish', finishReason: 'STOP' },
      ]);
    });

    it('2E: extracts partial usageMetadata when only subset of token counts are provided', async () => {
      const ssePartialUsage = 'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":42}}\n\n';

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(ssePartialUsage, 10)),
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro');
      const stream = await model.doStream({ prompt: 'Test usage' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 42 },
        },
      ]);
    });
  });

  describe('3. Structured Output Mode with JSON Schema Injection', () => {
    it('3A: injects complex nested schema into generationConfig.responseSchema', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"{\\"name\\":\\"prod\\",\\"tags\\":[\\"v1\\",\\"stable\\"]}"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const nestedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          config: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              retries: { type: 'integer' },
            },
            required: ['enabled'],
          },
        },
        required: ['name', 'tags'],
      };

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-pro', {
        structuredOutputs: true,
        responseSchema: nestedSchema,
      });

      await model.doStream({ prompt: 'Return config' });

      expect(capturedBody.generationConfig).toBeDefined();
      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(capturedBody.generationConfig.responseSchema).toEqual(nestedSchema);
    });

    it('3B: accepts schema dynamically via StreamExecutionOptions', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"{\\"id\\":101}"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-1.5-flash');

      const dynamicSchema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
        },
        required: ['id'],
      };

      await model.doStream({
        prompt: 'Generate ID',
        responseMimeType: 'application/json',
        responseSchema: dynamicSchema,
      });

      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(capturedBody.generationConfig.responseSchema).toEqual(dynamicSchema);
    });

    it('3C: extracts jsonSchema wrapper from Standard Schema input', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"{\\"status\\":\\"ok\\"}"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'stress-key', fetch: customFetch })('gemini-2.0-flash');

      const schemaWithJsonSchema = {
        jsonSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'error'] },
          },
          required: ['status'],
        },
      };

      await model.doStream({
        prompt: 'Check status',
        schema: schemaWithJsonSchema,
      });

      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(capturedBody.generationConfig.responseSchema).toEqual(schemaWithJsonSchema.jsonSchema);
    });
  });

  describe('4. Error Conditions Stress Tests (400, 403, 429, 503)', () => {
    it('4A: handles 400 Bad Request (Invalid Argument)', async () => {
      const errorPayload = JSON.stringify({
        error: {
          code: 400,
          message: 'Invalid argument: models/gemini-invalid is not supported',
          status: 'INVALID_ARGUMENT',
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(errorPayload, {
          status: 400,
          statusText: 'Bad Request',
        }),
      );

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-invalid');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini request failed with status 400 Bad Request.*INVALID_ARGUMENT/i,
      );
    });

    it('4B: handles 403 Forbidden (API Key Invalid)', async () => {
      const errorPayload = JSON.stringify({
        error: {
          code: 403,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'PERMISSION_DENIED',
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(errorPayload, {
          status: 403,
          statusText: 'Forbidden',
        }),
      );

      const model = createGemini({ apiKey: 'bad-key', fetch: customFetch })('gemini-1.5-pro');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini request failed with status 403 Forbidden.*API key not valid/i,
      );
    });

    it('4C: handles 429 Too Many Requests (Resource Exhausted)', async () => {
      const errorPayload = JSON.stringify({
        error: {
          code: 429,
          message: 'Resource has been exhausted (e.g. check quota).',
          status: 'RESOURCE_EXHAUSTED',
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(errorPayload, {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini request failed with status 429 Too Many Requests.*RESOURCE_EXHAUSTED/i,
      );
    });

    it('4D: handles 503 Service Unavailable (Overloaded)', async () => {
      const errorPayload = JSON.stringify({
        error: {
          code: 503,
          message: 'The model is overloaded. Please try again later.',
          status: 'UNAVAILABLE',
        },
      });

      const customFetch = vi.fn().mockResolvedValue(
        new Response(errorPayload, {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-flash');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini request failed with status 503 Service Unavailable.*UNAVAILABLE/i,
      );
    });

    it('4E: handles empty response body without crashing', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini returned an empty response body/i,
      );
    });
  });

  describe('5. Core @ranu/ai Integration Tests (streamAI & generateObject)', () => {
    it('5A: streamAI delivers compliant W3C ReadableStream Response with backpressure and chunk framing', async () => {
      const fullSse = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Framework "}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"Empirical "}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"Testing"}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":12,"candidatesTokenCount":5,"totalTokenCount":17}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(fullSse, 8)),
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      const response = await streamAI({
        model,
        prompt: 'Run test',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();

      const decoder = new TextDecoder();
      let streamedBody = '';
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        streamedBody += decoder.decode(value, { stream: true });
      }

      expect(streamedBody).toContain('data: {"text":"Framework "}');
      expect(streamedBody).toContain('data: {"text":"Empirical "}');
      expect(streamedBody).toContain('data: {"text":"Testing"}');
      expect(streamedBody).toContain('"finishReason":"STOP"');
      expect(streamedBody).toContain('"usage":{"promptTokens":12,"completionTokens":5,"totalTokens":17}');
      expect(streamedBody).toContain('data: [DONE]');
    });

    it('5B: streamAI propagates AbortController cancellation immediately', async () => {
      let underlyingCancelled = false;
      const infiniteStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"first"}]}}]}\n\n'));
        },
        pull(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"more"}]}}]}\n\n'));
        },
        cancel() {
          underlyingCancelled = true;
        },
      });

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: infiniteStream,
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-flash');

      const abortController = new AbortController();
      const response = await streamAI({
        model,
        prompt: 'Stream indefinitely',
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);

      abortController.abort(new Error('User cancelled'));

      await expect(reader.read()).rejects.toThrow(/User cancelled/i);
    });

    it('5C: generateObject parses schema conforming JSON and strips markdown fences', async () => {
      const markdownJson = '```json\n{"project":"ranu.js","active":true,"stars":1500}\n```';
      const ssePayload = `data: {"candidates":[{"content":{"parts":[{"text":${JSON.stringify(markdownJson)}}]},"finishReason":"STOP"}]}\n\n`;

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(ssePayload, 4)),
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-2.0-flash');

      const schema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test-standard-schema',
          validate: (val: unknown) => {
            const v = val as { project: string; active: boolean; stars: number };
            if (typeof v?.project === 'string' && typeof v?.active === 'boolean' && typeof v?.stars === 'number') {
              return { value: v };
            }
            return { issues: [{ message: 'Schema validation failed' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema,
        prompt: 'Return repository stats',
      });

      expect(result.object).toEqual({
        project: 'ranu.js',
        active: true,
        stars: 1500,
      });
      expect(result.rawText).toContain('{"project":"ranu.js"');
    });

    it('5D: generateObject throws AIValidationError when model output violates schema constraints', async () => {
      const invalidOutput = '{"project":"ranu.js","active":"not-a-boolean","stars":"lots"}';
      const ssePayload = `data: {"candidates":[{"content":{"parts":[{"text":${JSON.stringify(invalidOutput)}}]},"finishReason":"STOP"}]}\n\n`;

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: createChunkedByteStream(sliceIntoBytes(ssePayload, 6)),
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      const strictSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'strict-validator',
          validate: (val: unknown) => {
            const v = val as { project: string; active: boolean; stars: number };
            if (typeof v?.active !== 'boolean') {
              return { issues: [{ message: 'Field "active" must be a boolean' }] };
            }
            return { value: v };
          },
        },
      };

      await expect(
        generateObject({
          model,
          schema: strictSchema,
          prompt: 'Generate metadata',
        }),
      ).rejects.toThrow(AIValidationError);
    });

    it('5E: propagates mid-stream network socket errors to downstream consumer', async () => {
      let pullCount = 0;
      const failingStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCount++;
          if (pullCount === 1) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Stream start"}]}}]}\n\n'));
          } else {
            controller.error(new Error('Network socket forcibly reset by peer (ECONNRESET)'));
          }
        },
      });

      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: failingStream,
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');
      const stream = await model.doStream({ prompt: 'Test error' });
      const reader = stream.getReader();

      const firstChunk = await reader.read();
      expect(firstChunk.value).toEqual({ type: 'text', text: 'Stream start' });

      await expect(reader.read()).rejects.toThrow(/ECONNRESET/i);
    });
  });

  describe('6. Edge Case Payloads & Safety Invariants', () => {
    it('6A: supports raw base64 strings and Uint8Array for audio and video', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      const rawBase64Audio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      const videoBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'audio', data: rawBase64Audio, mimeType: 'audio/wav' },
              { type: 'video', data: videoBytes, mimeType: 'video/mp4' },
            ],
          },
        ],
      });

      const parts = capturedBody.contents[0].parts;
      expect(parts[0].inlineData).toEqual({
        mimeType: 'audio/wav',
        data: rawBase64Audio,
      });
      expect(parts[1].inlineData).toEqual({
        mimeType: 'video/mp4',
        data: Buffer.from(videoBytes).toString('base64'),
      });
    });

    it('6B: passes through pre-formed inlineData and fileData without alteration', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro');

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { inlineData: { mimeType: 'image/webp', data: 'd2VicA==' } },
              { fileData: { mimeType: 'video/quicktime', fileUri: 'gs://bucket/sample.mov' } },
            ],
          },
        ],
      });

      const parts = capturedBody.contents[0].parts;
      expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/webp', data: 'd2VicA==' } });
      expect(parts[1]).toEqual({ fileData: { mimeType: 'video/quicktime', fileUri: 'gs://bucket/sample.mov' } });
    });

    it('6C: maps multiple safety settings and verifies harm category preservation', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"safe"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'test-key', fetch: customFetch })('gemini-1.5-pro', {
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
        ],
      });

      await model.doStream({ prompt: 'Analyze content' });

      expect(capturedBody.safetySettings).toHaveLength(4);
      expect(capturedBody.safetySettings).toEqual([
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
      ]);
    });
  });
});
