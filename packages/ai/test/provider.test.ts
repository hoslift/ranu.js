import { describe, it, expect, vi } from 'vitest';
import {
  createAIProvider,
  type AIChunk,
  type AIMessage,
  type AIProviderConfig,
  type StreamExecutionOptions,
} from '../src/index.js';

function createMockStreamResponse(lines: string[], status = 200, statusText = 'OK'): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line + '\n'));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    statusText,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
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

describe('@ranu/ai — createAIProvider Universal Interface', () => {
  describe('Provider Initialization & Validation', () => {
    it('throws when config is missing or invalid', () => {
      // @ts-expect-error Testing invalid config
      expect(() => createAIProvider()).toThrow(/createAIProvider requires a valid AIProviderConfig/);
      // @ts-expect-error Testing missing name
      expect(() => createAIProvider({ baseURL: 'https://api.openai.com/v1' })).toThrow(
        /AIProviderConfig.name must be a non-empty string/,
      );
      // @ts-expect-error Testing missing baseURL
      expect(() => createAIProvider({ name: 'openai' })).toThrow(
        /AIProviderConfig.baseURL must be a non-empty string/,
      );
    });

    it('throws when modelId is empty', () => {
      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
      });

      expect(() => provider('')).toThrow(/Model ID must be a non-empty string/);
      expect(() => provider.model('')).toThrow(/Model ID must be a non-empty string/);
    });

    it('creates a callable provider instance and preserves metadata', () => {
      const config: AIProviderConfig = {
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
      };

      const provider = createAIProvider(config);

      expect(provider.name).toBe('openai');
      expect(provider.config).toBe(config);

      const model1 = provider('gpt-4o');
      expect(model1.provider).toBe('openai');
      expect(model1.modelId).toBe('gpt-4o');
      expect(typeof model1.doStream).toBe('function');

      const model2 = provider.model('gpt-4o-mini');
      expect(model2.provider).toBe('openai');
      expect(model2.modelId).toBe('gpt-4o-mini');
      expect(typeof model2.doStream).toBe('function');
    });
  });

  describe('Dynamic Authorization & Monthly Subscriptions', () => {
    it('dynamically resolves headers per request for monthly subscription tokens', async () => {
      let currentToken = 'sub-token-month-1';
      const capturedRequests: Array<{ url: string; headers: Headers }> = [];

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        capturedRequests.push({ url: String(url), headers });

        return createMockStreamResponse([
          'data: {"choices": [{"delta": {"content": "ok"}}]}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        name: 'enterprise-subscription',
        baseURL: 'https://ai-gateway.corp.internal/v1',
        headers: () => ({
          Authorization: `Bearer ${currentToken}`,
          'X-Enterprise-Org': 'org-ranu-corp',
          'X-Monthly-Quota-Tier': 'vip-enterprise',
        }),
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('custom-model');

      // First call with month 1 token
      const stream1 = await model.doStream({ prompt: 'Ping 1' });
      await collectChunks(stream1);

      expect(capturedRequests[0]?.headers.get('Authorization')).toBe('Bearer sub-token-month-1');
      expect(capturedRequests[0]?.headers.get('X-Enterprise-Org')).toBe('org-ranu-corp');
      expect(capturedRequests[0]?.headers.get('X-Monthly-Quota-Tier')).toBe('vip-enterprise');

      // Update token for month 2 / token rotation
      currentToken = 'sub-token-month-2-renewed';

      const stream2 = await model.doStream({ prompt: 'Ping 2' });
      await collectChunks(stream2);

      expect(capturedRequests[1]?.headers.get('Authorization')).toBe('Bearer sub-token-month-2-renewed');
      expect(capturedRequests[1]?.headers.get('X-Enterprise-Org')).toBe('org-ranu-corp');
    });

    it('dynamically resolves async apiKey per request', async () => {
      let dynamicKey = 'key-initial';
      const capturedHeaders: Headers[] = [];

      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders.push(new Headers(init?.headers));
        return createMockStreamResponse([
          'data: {"choices": [{"delta": {"content": "acknowledged"}}]}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: async () => dynamicKey,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');

      await (await model.doStream({ prompt: 'Call 1' })).getReader().read();
      expect(capturedHeaders[0]?.get('Authorization')).toBe('Bearer key-initial');

      dynamicKey = 'key-rotated-secret';
      await (await model.doStream({ prompt: 'Call 2' })).getReader().read();
      expect(capturedHeaders[1]?.get('Authorization')).toBe('Bearer key-rotated-secret');
    });
  });

  describe('OpenAI Protocol & Groq Inference Driver', () => {
    it('formats OpenAI chat completions request and streams chunks with reasoning and usage', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      let capturedUrl = '';

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

        return createMockStreamResponse([
          'data: {"choices": [{"delta": {"content": "Hello", "reasoning_content": "Plan: Greet"}}]}',
          'data: {"choices": [{"delta": {"content": " world!"}}]}',
          'data: {"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}',
          'data: [DONE]',
        ]);
      });

      const groqProvider = createAIProvider({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk-test-token',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = groqProvider('llama-3.3-70b-versatile');
      const stream = await model.doStream({
        prompt: 'Hi there',
        temperature: 0.2,
        maxTokens: 500,
      });

      const chunks = await collectChunks(stream);

      expect(capturedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(capturedBody?.['model']).toBe('llama-3.3-70b-versatile');
      expect(capturedBody?.['temperature']).toBe(0.2);
      expect(capturedBody?.['max_tokens']).toBe(500);
      expect(capturedBody?.['stream']).toBe(true);

      expect(chunks).toEqual([
        { type: 'text', text: 'Hello' },
        { type: 'reasoning', reasoning: 'Plan: Greet' },
        { type: 'text', text: ' world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
        {
          type: 'finish',
          finishReason: 'stop',
        },
      ]);
    });

    it('handles tool call chunks in OpenAI protocol', async () => {
      const mockFetch = vi.fn(async () => {
        return createMockStreamResponse([
          'data: {"choices": [{"delta": {"tool_calls": [{"id": "call_123", "function": {"name": "getWeather", "arguments": "{\\"city\\": \\"Tokyo\\"}"}}]}}]}',
          'data: {"choices": [{"delta": {}, "finish_reason": "tool_calls"}]}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'Weather in Tokyo' });
      const chunks = await collectChunks(stream);

      const toolCallChunk = chunks.find((c) => c.type === 'tool-call');
      expect(toolCallChunk).toEqual({
        type: 'tool-call',
        toolCall: {
          id: 'call_123',
          name: 'getWeather',
          arguments: '{"city": "Tokyo"}',
        },
      });
    });
  });

  describe('Anthropic Claude Protocol', () => {
    it('formats Claude messages endpoint and separates system message', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      let capturedHeaders: Headers | undefined;
      let capturedUrl = '';

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = new Headers(init?.headers);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

        return createMockStreamResponse([
          'event: content_block_delta',
          'data: {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "Thinking through problem..."}}',
          'event: content_block_delta',
          'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Claude response content"}}',
          'event: message_delta',
          'data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 42}}',
          'event: message_stop',
          'data: {"type": "message_stop"}',
        ]);
      });

      const claudeProvider = createAIProvider({
        name: 'claude',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: 'anthropic-secret-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = claudeProvider('claude-3-5-sonnet-latest');

      const messages: AIMessage[] = [
        { role: 'system', content: 'You are an expert full-stack developer.' },
        { role: 'user', content: 'Explain streaming backpressure.' },
      ];

      const stream = await model.doStream({ messages, maxTokens: 2048 });
      const chunks = await collectChunks(stream);

      expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
      expect(capturedHeaders?.get('x-api-key')).toBe('anthropic-secret-key');
      expect(capturedHeaders?.get('anthropic-version')).toBe('2023-06-01');

      expect(capturedBody?.['system']).toBe('You are an expert full-stack developer.');
      expect(capturedBody?.['messages']).toEqual([
        { role: 'user', content: 'Explain streaming backpressure.' },
      ]);
      expect(capturedBody?.['max_tokens']).toBe(2048);

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Thinking through problem...' },
        { type: 'text', text: 'Claude response content' },
        { type: 'finish', finishReason: 'end_turn', usage: { completionTokens: 42 } },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('Google Gemini Protocol', () => {
    it('formats native streamGenerateContent endpoint and parses candidate chunks', async () => {
      let capturedUrl = '';
      let capturedBody: Record<string, unknown> | undefined;
      let capturedHeaders: Headers | undefined;

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedHeaders = new Headers(init?.headers);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

        return createMockStreamResponse([
          'data: {"candidates": [{"content": {"parts": [{"text": "Gemini 1.5 "}]}, "index": 0}]}',
          'data: {"candidates": [{"content": {"parts": [{"text": "Flash Output"}]}, "finishReason": "STOP"}], "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 4, "totalTokenCount": 12}}',
        ]);
      });

      const geminiProvider = createAIProvider({
        name: 'google',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: 'google-gemini-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = geminiProvider('gemini-1.5-flash');
      const stream = await model.doStream({ prompt: 'Hello Gemini' });
      const chunks = await collectChunks(stream);

      expect(capturedUrl).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse',
      );
      expect(capturedHeaders?.get('x-goog-api-key')).toBe('google-gemini-key');

      expect(capturedBody?.['contents']).toEqual([
        {
          role: 'user',
          parts: [{ text: 'Hello Gemini' }],
        },
      ]);

      expect(chunks).toEqual([
        { type: 'text', text: 'Gemini 1.5 ' },
        { type: 'text', text: 'Flash Output' },
        {
          type: 'finish',
          finishReason: 'STOP',
          usage: { promptTokens: 8, completionTokens: 4, totalTokens: 12 },
        },
      ]);
    });
  });

  describe('Local Ollama & NDJSON Protocol', () => {
    it('formats native /api/chat endpoint and parses newline-delimited JSON chunks', async () => {
      let capturedUrl = '';
      let capturedBody: Record<string, unknown> | undefined;

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

        return createMockStreamResponse([
          '{"model": "llama3", "message": {"role": "assistant", "content": "Local "}, "done": false}',
          '{"model": "llama3", "message": {"role": "assistant", "content": "offline AI"}, "done": false}',
          '{"model": "llama3", "message": {"role": "assistant", "content": ""}, "done": true, "done_reason": "stop", "prompt_eval_count": 16, "eval_count": 8}',
        ]);
      });

      const ollamaProvider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://localhost:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = ollamaProvider('llama3');
      const stream = await model.doStream({ prompt: 'Run locally' });
      const chunks = await collectChunks(stream);

      expect(capturedUrl).toBe('http://localhost:11434/api/chat');
      expect(capturedBody?.['model']).toBe('llama3');
      expect(capturedBody?.['stream']).toBe(true);
      expect(capturedBody?.['messages']).toEqual([{ role: 'user', content: 'Run locally' }]);

      expect(chunks).toEqual([
        { type: 'text', text: 'Local ' },
        { type: 'text', text: 'offline AI' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 16, completionTokens: 8 },
        },
      ]);
    });
  });

  describe('Error Handling and Resiliency', () => {
    it('throws informative error on HTTP non-200 responses', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          statusText: 'Unauthorized',
        });
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'bad-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');

      await expect(model.doStream({ prompt: 'Test error' })).rejects.toThrow(
        /Provider \(openai\) request failed with status 401 Unauthorized/,
      );
    });

    it('throws error when response body is null', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(null, { status: 200, statusText: 'OK' });
      });

      const provider = createAIProvider({
        name: 'custom-ai',
        baseURL: 'https://ai.example.com/v1',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('custom-model');

      await expect(model.doStream({ prompt: 'Test empty body' })).rejects.toThrow(
        /Provider \(custom-ai\) returned an empty response body/,
      );
    });

    it('passes abort signal cleanly to fetch', async () => {
      const controller = new AbortController();
      let receivedSignal: AbortSignal | undefined;

      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        receivedSignal = init?.signal ?? undefined;
        return createMockStreamResponse(['data: {"choices": [{"delta": {"content": "ok"}}]}', 'data: [DONE]']);
      });

      const provider = createAIProvider({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama-3.3-70b');
      await model.doStream({ prompt: 'Test abort signal', signal: controller.signal });

      expect(receivedSignal).toBe(controller.signal);
    });
  });
});
