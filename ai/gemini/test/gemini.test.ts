import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI, generateObject } from '@ranu/ai';
import { createGemini, gemini } from '../src/index.js';

describe('@ranu/ai-gemini Model Driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Model Creation', () => {
    it('creates a gemini provider and model instances', () => {
      const provider = createGemini({ apiKey: 'test-key' });
      expect(provider.name).toBe('gemini');
      expect(provider.config.apiKey).toBe('test-key');

      const model = provider('gemini-1.5-pro');
      expect(model.provider).toBe('gemini');
      expect(model.modelId).toBe('gemini-1.5-pro');

      const flashModel = provider.model('gemini-1.5-flash');
      expect(flashModel.provider).toBe('gemini');
      expect(flashModel.modelId).toBe('gemini-1.5-flash');

      const flash2 = provider.model('gemini-2.0-flash');
      expect(flash2.modelId).toBe('gemini-2.0-flash');
    });

    it('creates default gemini model factory', () => {
      process.env['GEMINI_API_KEY'] = 'env-key';
      const model = gemini('gemini-1.5-pro', { temperature: 0.2 });
      expect(model.provider).toBe('gemini');
      expect(model.modelId).toBe('gemini-1.5-pro');
      expect(model.settings?.temperature).toBe(0.2);
    });

    it('throws error when modelId is invalid', () => {
      const provider = createGemini({ apiKey: 'key' });
      expect(() => provider('')).toThrow('Model ID must be a non-empty string');
    });
  });

  describe('Dynamic API Key Resolution', () => {
    it('resolves static string apiKey', async () => {
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-goog-api-key'];
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        );
      });

      const provider = createGemini({ apiKey: 'custom-static-key', fetch: customFetch });
      const stream = await provider('gemini-1.5-flash').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('custom-static-key');
    });

    it('resolves async function apiKey', async () => {
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-goog-api-key'];
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGemini({
        apiKey: () => Promise.resolve('resolved-dynamic-key'),
        fetch: customFetch,
      });
      const stream = await provider('gemini-1.5-pro').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('resolved-dynamic-key');
    });

    it('falls back to process.env.GEMINI_API_KEY', async () => {
      process.env['GEMINI_API_KEY'] = 'env-gemini-token';
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-goog-api-key'];
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const provider = createGemini({ fetch: customFetch });
      const stream = await provider('gemini-1.5-pro').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('env-gemini-token');
    });

    it('throws error when no API key is available', async () => {
      const provider = createGemini();
      await expect(provider('gemini-1.5-pro').doStream({ prompt: 'hi' })).rejects.toThrow(
        /Gemini API key is required/i,
      );
    });
  });

  describe('Streaming SSE Generation', () => {
    it('streams SSE text chunks and finish usage', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":" World!"}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":8,"candidatesTokenCount":5,"totalTokenCount":13}}',
        '',
        'data: [DONE]',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(
        new Response(ssePayload, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro');
      const stream = await model.doStream({ prompt: 'Say hello' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: ' World!' },
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 8, completionTokens: 5, totalTokens: 13 },
        },
      ]);
    });

    it('integrates seamlessly with streamAI W3C streaming kernel', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Ranu "}]}}]}',
        '',
        'data: {"candidates":[{"content":{"parts":[{"text":"AI"}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}]}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-2.0-flash');

      const response = await streamAI({
        model,
        prompt: 'Generate',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      const text = await response.text();
      expect(text).toContain('data: {"text":"Ranu "}');
      expect(text).toContain('data: {"text":"AI"}');
      expect(text).toContain('data: {"finishReason":"STOP"}');
    });

    it('handles function calling SSE chunks', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"lookupUser","args":{"id":42}}}]}}]}',
        '',
        'data: {"candidates":[{"finishReason":"STOP"}]}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro');

      const stream = await model.doStream({ prompt: 'Find user 42' });
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
            name: 'lookupUser',
            arguments: JSON.stringify({ id: 42 }),
          },
        },
        {
          type: 'finish',
          finishReason: 'STOP',
        },
      ]);
    });
  });

  describe('Multimodal Payloads', () => {
    it('converts base64 data URL, raw base64, Uint8Array, and URL to Gemini parts', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"parsed"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro');

      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const audioUrl = new URL('https://storage.googleapis.com/test-bucket/audio.mp3');

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze these multimodal files:' },
              {
                type: 'image',
                image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              },
              {
                type: 'image',
                image: pngBytes,
                mimeType: 'image/png',
              },
              {
                type: 'image',
                image: 'https://example.com/photo.jpg',
              },
              {
                type: 'audio',
                audio: audioUrl,
                mimeType: 'audio/mp3',
              },
              {
                type: 'video',
                video: 'https://storage.googleapis.com/videos/sample.mp4',
                mimeType: 'video/mp4',
              },
            ],
          },
        ],
      });

      expect(capturedBody).toBeDefined();
      const parts = capturedBody.contents[0].parts;
      expect(parts.length).toBe(6);

      // 1. Text part
      expect(parts[0]).toEqual({ text: 'Analyze these multimodal files:' });

      // 2. Data URL image
      expect(parts[1].inlineData).toBeDefined();
      expect(parts[1].inlineData.mimeType).toBe('image/png');
      expect(parts[1].inlineData.data).toContain('iVBORw0KGgo');

      // 3. Uint8Array image
      expect(parts[2].inlineData).toBeDefined();
      expect(parts[2].inlineData.mimeType).toBe('image/png');
      expect(parts[2].inlineData.data).toBe(Buffer.from(pngBytes).toString('base64'));

      // 4. Remote image URL
      expect(parts[3].fileData).toBeDefined();
      expect(parts[3].fileData.fileUri).toBe('https://example.com/photo.jpg');

      // 5. Remote audio URL
      expect(parts[4].fileData).toBeDefined();
      expect(parts[4].fileData.fileUri).toBe('https://storage.googleapis.com/test-bucket/audio.mp3');
      expect(parts[4].fileData.mimeType).toBe('audio/mp3');

      // 6. Remote video URL
      expect(parts[5].fileData).toBeDefined();
      expect(parts[5].fileData.fileUri).toBe('https://storage.googleapis.com/videos/sample.mp4');
      expect(parts[5].fileData.mimeType).toBe('video/mp4');
    });
  });

  describe('Structured JSON Output Mode', () => {
    it('sets responseMimeType and responseSchema in generationConfig', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"{\\"name\\":\\"Ranu\\",\\"version\\":\\"0.1.0\\"}"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['name', 'version'],
      };

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro', {
        structuredOutputs: true,
        responseSchema: schema,
      });

      await model.doStream({ prompt: 'Return package manifest' });

      expect(capturedBody.generationConfig).toBeDefined();
      expect(capturedBody.generationConfig.responseMimeType).toBe('application/json');
      expect(capturedBody.generationConfig.responseSchema).toEqual(schema);
    });

    it('works with generateObject from @ranu/ai', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(
          'data: {"candidates":[{"content":{"parts":[{"text":"{\\"city\\":\\"Colombo\\",\\"temp\\":30}"}]},"finishReason":"STOP"}]}\n\n',
          { status: 200 },
        ),
      );

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-flash');

      const weatherSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { city: string; temp: number };
            if (typeof v?.city === 'string' && typeof v?.temp === 'number') {
              return { value: v };
            }
            return { issues: [{ message: 'Invalid weather format' }] };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: weatherSchema,
        prompt: 'Weather in Colombo',
      });

      expect(result.object).toEqual({ city: 'Colombo', temp: 30 });
      expect(result.rawText).toBe('{"city":"Colombo","temp":30}');
    });
  });

  describe('System Instructions and Safety Settings', () => {
    it('correctly maps system messages and safety settings', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"candidates":[{"content":{"parts":[{"text":"done"}]},"finishReason":"STOP"}]}\n\n', {
            status: 200,
          }),
        );
      });

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro', {
        systemInstruction: 'You are an expert engineer.',
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_LOW_AND_ABOVE',
          },
        ],
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      });

      await model.doStream({
        messages: [
          { role: 'system', content: 'Follow strict types.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'Provide code' },
        ],
      });

      expect(capturedBody.systemInstruction.parts).toEqual([
        { text: 'You are an expert engineer.' },
        { text: 'Follow strict types.' },
      ]);

      expect(capturedBody.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
        { role: 'user', parts: [{ text: 'Provide code' }] },
      ]);

      expect(capturedBody.safetySettings).toEqual([
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        },
      ]);

      expect(capturedBody.generationConfig).toEqual({
        temperature: 0.5,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      });
    });
  });

  describe('Error Handling', () => {
    it('throws error when server responds with 403 Forbidden', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('API key not valid. Please pass a valid API key.', {
          status: 403,
          statusText: 'Forbidden',
        }),
      );

      const model = createGemini({ apiKey: 'invalid-key', fetch: customFetch })('gemini-1.5-pro');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Gemini request failed with status 403 Forbidden: API key not valid/i,
      );
    });

    it('throws error when response body is empty', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const model = createGemini({ apiKey: 'k', fetch: customFetch })('gemini-1.5-pro');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(/empty response body/i);
    });
  });
});
