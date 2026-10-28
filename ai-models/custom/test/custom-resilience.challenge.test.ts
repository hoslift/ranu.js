import { describe, it, expect, vi } from 'vitest';
import { createCustomAI, custom, isDeepSeekR1, resolveBaseURL } from '../src/index.js';
import type { AIChunk } from '@ranu/ai';

describe('Adversarial & Resilience Challenge Suite — @ranu/ai-custom', () => {
  it('Challenge 1: Survives 1-byte extreme byte fragmentation with UTF-8 multibyte and DeepSeek-R1 reasoning', async () => {
    const rawSse = [
      'data: {"choices":[{"delta":{"reasoning_content":"🤔 DeepSeek pondering: "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_content":"√16 = 4. "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Solution: "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"4 ✨"}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":18,"total_tokens":30}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const allBytes = encoder.encode(rawSse);

    // Stream 1 byte at a time
    const byteStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < allBytes.length; i++) {
          controller.enqueue(new Uint8Array([allBytes[i]!]));
        }
        controller.close();
      },
    });

    const customFetch = vi.fn().mockResolvedValue(new Response(byteStream, { status: 200 }));
    const model = createCustomAI({ fetch: customFetch })('deepseek-r1');

    const stream = await model.doStream({ prompt: 'Calculate square root' });
    const reader = stream.getReader();
    const chunks: AIChunk[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toEqual([
      { type: 'reasoning', reasoning: '🤔 DeepSeek pondering: ' },
      { type: 'reasoning', reasoning: '√16 = 4. ' },
      { type: 'text', text: 'Solution: ' },
      { type: 'text', text: '4 ✨' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 },
      },
    ]);
  });

  it('Challenge 2: 50 concurrent requests with dynamic rotating async API keys and tenant IDs without cross-talk', async () => {
    const executedRequests: Array<{ url: string; headers: Record<string, string>; model: string }> = [];

    const customFetch = vi.fn().mockImplementation((url, init) => {
      const parsedBody = JSON.parse(init.body);
      executedRequests.push({
        url,
        headers: init.headers,
        model: parsedBody.model,
      });

      return Promise.resolve(
        new Response(
          `data: {"choices":[{"delta":{"content":"Response for ${parsedBody.model}"}}]}\n\n` +
          'data: {"choices":[{"finish_reason":"stop"}]}\n\n' +
          'data: [DONE]\n\n',
          { status: 200 },
        ),
      );
    });

    const tasks = Array.from({ length: 50 }, (_, i) => {
      const tenant = `tenant-corp-${i}`;
      const token = `secret-token-${i}`;
      const modelId = i % 2 === 0 ? 'llama3.2' : 'deepseek-r1';

      const provider = createCustomAI({
        baseURL: `https://cluster-${i % 3}.corp.internal/v1`,
        apiKey: () => Promise.resolve(token),
        tenantId: tenant,
        fetch: customFetch,
      });

      return provider(modelId).doStream({
        prompt: `Query from worker ${i}`,
        headers: { 'X-Worker-ID': `worker-${i}` },
      }).then(async (stream) => {
        const reader = stream.getReader();
        const results = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          results.push(value);
        }
        return { i, tenant, token, modelId, results };
      });
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(50);
    expect(executedRequests).toHaveLength(50);

    for (let i = 0; i < 50; i++) {
      const req = executedRequests[i]!;
      const res = results[i]!;
      expect(req.headers['Authorization']).toBe(`Bearer ${res.token}`);
      expect(req.headers['x-tenant-id']).toBe(res.tenant);
      expect(req.headers['X-Worker-ID']).toBe(`worker-${res.i}`);
      expect(res.results[0]).toEqual({
        type: 'text',
        text: `Response for ${res.modelId}`,
      });
    }
  });

  it('Challenge 3: Multi-tool streaming with interleaved chunk deltas across 3 different tools', async () => {
    const ssePayload = [
      ': keepalive comment\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{\\"q\\": "}}]}}]}\n\n',
      ': another comment\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"fetchUrl","arguments":"{\\"url\\": "}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"quantum computing\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"\\"https://arxiv.org\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
    const model = createCustomAI({ fetch: customFetch })('llama3');

    const stream = await model.doStream({ prompt: 'search and fetch' });
    const reader = stream.getReader();
    const chunks: AIChunk[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toEqual([
      {
        type: 'tool-call',
        toolCall: { index: 0, id: 'call_1', name: 'search', arguments: '{"q": ' },
      },
      {
        type: 'tool-call',
        toolCall: { index: 1, id: 'call_2', name: 'fetchUrl', arguments: '{"url": ' },
      },
      {
        type: 'tool-call',
        toolCall: { index: 0, arguments: '"quantum computing"}' },
      },
      {
        type: 'tool-call',
        toolCall: { index: 1, arguments: '"https://arxiv.org"}' },
      },
      {
        type: 'finish',
        finishReason: 'tool_calls',
      },
    ]);
  });

  it('Challenge 4: Resilient against malformed SSE lines, unknown choices, and empty lines', async () => {
    const ssePayload = [
      'invalid garbage line without prefix',
      ': comment without data',
      'data: not valid json here',
      'data: {"choices":[]}',
      'data: {"choices":[{"delta":{}}]}',
      'data: {"choices":[{"delta":{"content":"valid text"}}]}',
      '',
      '   ',
      'data: [DONE]',
    ].join('\n');

    const customFetch = vi.fn().mockResolvedValue(new Response(ssePayload, { status: 200 }));
    const model = createCustomAI({ fetch: customFetch })('mistral');

    const stream = await model.doStream({ prompt: 'Test resiliency' });
    const reader = stream.getReader();
    const chunks: AIChunk[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toEqual([
      { type: 'text', text: 'valid text' },
      { type: 'finish', finishReason: 'stop' },
    ]);
  });

  it('Challenge 5: Multimodal message normalization with Uint8Array, base64 strings, and URL objects', async () => {
    let capturedBody: any;
    const customFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
    });

    const model = createCustomAI({ fetch: customFetch })('llama3.2');
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    const base64Str = 'iVBORw0KGgoAAAANSUhEUgAA';

    await model.doStream({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe these images:' },
            { type: 'image', image: binaryData, mimeType: 'image/png' },
            { type: 'image', image: base64Str, mimeType: 'image/jpeg' },
            { type: 'image', image: new URL('https://example.com/photo.webp') },
          ],
        },
      ],
    });

    const userMsg = capturedBody.messages[0];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toEqual([
      { type: 'text', text: 'Describe these images:' },
      {
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,iVBORw==' },
      },
      {
        type: 'image_url',
        image_url: { url: 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAA' },
      },
      {
        type: 'image_url',
        image_url: { url: 'https://example.com/photo.webp' },
      },
    ]);
  });

  it('Challenge 6: Ollama format: "json" and OpenAI json_schema coexistence and precedence', async () => {
    let capturedBody: any;
    const customFetch = vi.fn().mockImplementation((_url, init) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
    });

    // Test format: 'json'
    const modelOllama = createCustomAI({ fetch: customFetch })('llama3', {
      format: 'json',
    });
    await modelOllama.doStream({ prompt: 'test' });
    expect(capturedBody.format).toBe('json');
    expect(capturedBody.response_format).toEqual({ type: 'json_object' });

    // Test explicit schema overrides json_object
    const modelSchema = createCustomAI({ fetch: customFetch })('llama3', {
      format: 'json',
    });
    await modelSchema.doStream({
      prompt: 'test',
      schema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
    });
    expect(capturedBody.response_format.type).toBe('json_schema');
    expect(capturedBody.response_format.json_schema.schema.properties).toEqual({
      name: { type: 'string' },
    });
  });
});
