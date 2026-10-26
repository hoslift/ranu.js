import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAI } from '@ranu/ai';
import { createClaude, claude } from '../src/index.js';

describe('@ranu/ai-claude Model Driver', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Model Creation', () => {
    it('creates a claude provider and model instances', () => {
      const provider = createClaude({ apiKey: 'sk-ant-test' });
      expect(provider.name).toBe('claude');
      expect(provider.config.apiKey).toBe('sk-ant-test');

      const sonnet = provider('claude-3-5-sonnet-20241022');
      expect(sonnet.provider).toBe('claude');
      expect(sonnet.modelId).toBe('claude-3-5-sonnet-20241022');

      const haiku = provider.model('claude-3-5-haiku-20241022');
      expect(haiku.provider).toBe('claude');
      expect(haiku.modelId).toBe('claude-3-5-haiku-20241022');

      const opus = provider.model('claude-3-opus-20240229');
      expect(opus.modelId).toBe('claude-3-opus-20240229');
    });

    it('creates default claude model factory', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-env';
      const model = claude('claude-3-5-sonnet-20241022', { temperature: 0.3, maxTokens: 2048 });
      expect(model.provider).toBe('claude');
      expect(model.modelId).toBe('claude-3-5-sonnet-20241022');
      expect(model.settings?.temperature).toBe(0.3);
      expect(model.settings?.maxTokens).toBe(2048);
    });

    it('throws error when modelId is empty', () => {
      const provider = createClaude({ apiKey: 'k' });
      expect(() => provider('')).toThrow('Model ID must be a non-empty string');
    });
  });

  describe('Dynamic API Key Resolution', () => {
    it('resolves static string apiKey', async () => {
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-api-key'];
        return Promise.resolve(
          new Response(
            'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n' +
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n' +
            'data: {"type":"message_stop"}\n\n',
            { status: 200 },
          ),
        );
      });

      const provider = createClaude({ apiKey: 'sk-ant-static-token', fetch: customFetch });
      const stream = await provider('claude-3-5-haiku-20241022').doStream({ prompt: 'hi' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('sk-ant-static-token');
    });

    it('resolves async function apiKey', async () => {
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-api-key'];
        return Promise.resolve(
          new Response(
            'data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n' +
            'data: {"type":"message_stop"}\n\n',
            { status: 200 },
          ),
        );
      });

      const provider = createClaude({
        apiKey: () => Promise.resolve('sk-ant-dynamic-async'),
        fetch: customFetch,
      });
      const stream = await provider('claude-3-5-sonnet-20241022').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('sk-ant-dynamic-async');
    });

    it('falls back to process.env.ANTHROPIC_API_KEY', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-env-production';
      let capturedKey = '';
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedKey = init.headers['x-api-key'];
        return Promise.resolve(
          new Response('data: {"type":"message_stop"}\n\n', { status: 200 }),
        );
      });

      const provider = createClaude({ fetch: customFetch });
      const stream = await provider('claude-3-5-sonnet-20241022').doStream({ prompt: 'test' });
      const reader = stream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedKey).toBe('sk-ant-env-production');
    });

    it('throws error when no API key is set', async () => {
      const provider = createClaude();
      await expect(provider('claude-3-5-sonnet-20241022').doStream({ prompt: 'test' })).rejects.toThrow(
        /Claude API key is required/i,
      );
    });
  });

  describe('Prompt Caching & System Instructions', () => {
    it('sets anthropic-beta header and cache_control on system when promptCaching is enabled', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"type":"message_stop"}\n\n', { status: 200 }),
        );
      });

      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022', {
        promptCaching: true,
        system: 'You are an expert full-stack developer specializing in Ranu.js.',
      });

      await model.doStream({ prompt: 'Create route' });

      expect(capturedHeaders['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(capturedBody.system).toEqual([
        {
          type: 'text',
          text: 'You are an expert full-stack developer specializing in Ranu.js.',
          cache_control: { type: 'ephemeral' },
        },
      ]);
    });

    it('handles structured system blocks with explicit cache_control', async () => {
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"type":"message_stop"}\n\n', { status: 200 }),
        );
      });

      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022', {
        system: [
          { type: 'text', text: 'Documentation guidelines' },
          { type: 'text', text: 'Large code index...', cache_control: { type: 'ephemeral' } },
        ],
      });

      await model.doStream({ prompt: 'Summarize index' });

      expect(capturedHeaders['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(capturedBody.system).toEqual([
        { type: 'text', text: 'Documentation guidelines' },
        { type: 'text', text: 'Large code index...', cache_control: { type: 'ephemeral' } },
      ]);
    });
  });

  describe('Streaming SSE Generation & Finish Reasons', () => {
    it('streams text deltas, usage, and finish reasons correctly', async () => {
      const ssePayload = [
        'event: message_start',
        'data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","usage":{"input_tokens":25,"cache_read_input_tokens":5}}}',
        '',
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello "}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Claude!"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":12}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'Say hello' });
      const reader = stream.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      expect(chunks).toEqual([
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'Claude!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: 30, // 25 + 5
            completionTokens: 12,
            totalTokens: 42,
          },
        },
      ]);
    });

    it('maps max_tokens to finishReason length', async () => {
      const ssePayload = [
        'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":100}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-opus-20240229');

      const stream = await model.doStream({ prompt: 'Long text' });
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toEqual({
        type: 'finish',
        finishReason: 'length',
        usage: { promptTokens: 0, completionTokens: 100, totalTokens: 100 },
      });
    });

    it('integrates seamlessly with streamAI W3C streaming kernel', async () => {
      const ssePayload = [
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming "}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"works!"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ].join('');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-haiku-20241022');

      const response = await streamAI({
        model,
        prompt: 'Check streaming',
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('data: {"text":"Streaming "}');
      expect(text).toContain('data: {"text":"works!"}');
      expect(text).toContain('data: {"finishReason":"stop"');
    });
  });

  describe('Tool Use Streaming Deltas', () => {
    it('streams tool-use calls with index tracking and input JSON deltas', async () => {
      const ssePayload = [
        'event: content_block_start',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01abc","name":"calculateSum","input":{}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"a\\": 10,"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" \\"b\\": 20}"}}',
        '',
        'event: content_block_stop',
        'data: {"type":"content_block_stop","index":0}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":35}}',
        '',
        'event: message_stop',
        'data: {"type":"message_stop"}',
      ].join('\n');

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'Add 10 and 20' });
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
            id: 'toolu_01abc',
            name: 'calculateSum',
            arguments: '',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            id: 'toolu_01abc',
            name: 'calculateSum',
            arguments: '{"a": 10,',
          },
        },
        {
          type: 'tool-call',
          toolCall: {
            id: 'toolu_01abc',
            name: 'calculateSum',
            arguments: ' "b": 20}',
          },
        },
        {
          type: 'finish',
          finishReason: 'tool_calls',
          usage: { promptTokens: 0, completionTokens: 35, totalTokens: 35 },
        },
      ]);
    });
  });

  describe('Multimodal Inputs & Tool Message Normalization', () => {
    it('normalizes tool message results into user role with tool_result block', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"type":"message_stop"}\n\n', { status: 200 }),
        );
      });

      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      await model.doStream({
        messages: [
          { role: 'user', content: 'What is 5 + 5?' },
          { role: 'assistant', content: 'Let me calculate' },
          { role: 'tool', toolCallId: 'toolu_calc', content: '10' },
        ],
      });

      expect(capturedBody.messages[2]).toEqual({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_calc',
            content: '10',
          },
        ],
      });
    });

    it('converts base64 image data URL and Uint8Array to Anthropic image blocks', async () => {
      let capturedBody: any;
      const customFetch = vi.fn().mockImplementation((_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Promise.resolve(
          new Response('data: {"type":"message_stop"}\n\n', { status: 200 }),
        );
      });

      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      const pngBytes = new Uint8Array([1, 2, 3, 4]);

      await model.doStream({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Inspect this image' },
              {
                type: 'image',
                image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
              },
              {
                type: 'image',
                image: pngBytes,
                mimeType: 'image/png',
              },
            ],
          },
        ],
      });

      const content = capturedBody.messages[0].content;
      expect(content[0]).toEqual({ type: 'text', text: 'Inspect this image' });
      expect(content[1]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
        },
      });
      expect(content[2]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: Buffer.from(pngBytes).toString('base64'),
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('handles HTTP error responses (e.g. 401 Unauthorized)', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response('{"type":"error","error":{"type":"authentication_error","message":"Invalid API Key"}}', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = createClaude({ apiKey: 'invalid-key', fetch: customFetch })('claude-3-5-sonnet-20241022');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Claude request failed with status 401 Unauthorized: {"type":"error"/i,
      );
    });

    it('throws error when response body is null', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(/empty response body/i);
    });

    it('emits error chunk when SSE sends error event', async () => {
      const ssePayload = 'data: {"type":"error","error":{"type":"overloaded_error","message":"Anthropic is temporarily overloaded"}}\n\n';

      const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
      const model = createClaude({ apiKey: 'k', fetch: customFetch })('claude-3-5-sonnet-20241022');

      const stream = await model.doStream({ prompt: 'test' });
      const reader = stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const errorChunk = chunks.find((c) => c.type === 'error') as any;
      expect(errorChunk).toBeDefined();
      expect(errorChunk.error.message).toBe('Anthropic is temporarily overloaded');
    });
  });
});
