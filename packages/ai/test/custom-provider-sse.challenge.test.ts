import { describe, it, expect, vi } from 'vitest';
import {
  createAIProvider,
  type AIChunk,
  type AIModelInstance,
} from '../src/index.js';

function createChunkedStreamResponse(byteChunks: Uint8Array[], onCancel?: (reason: unknown) => void): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of byteChunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
    cancel(reason) {
      if (onCancel) onCancel(reason);
    },
  });

  return new Response(stream, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createTextStreamResponse(lines: string[]): Response {
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
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/event-stream' },
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

describe('Empirical Challenge — Custom Provider Variable SSE Formatting', () => {
  const customConfig = {
    name: 'custom-enterprise-gateway',
    baseURL: 'https://gateway.internal.corp/v1',
  };

  describe('1. Field Variation: {"text": "..."}', () => {
    it('1A: streams text chunks formatted with {"text": "..."}', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"text": "Enterprise "}',
          'data: {"text": "model "}',
          'data: {"text": "streaming initialized."}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('custom-llm');
      const stream = await model.doStream({ prompt: 'Test text format' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Enterprise ' },
        { type: 'text', text: 'model ' },
        { type: 'text', text: 'streaming initialized.' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('1B: handles {"text": "..."} split across TCP chunk boundaries', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"text": "Distributed ');
      const chunk2 = encoder.encode('intelligence"}\n\ndata: [DONE]\n\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2]));
      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-llm').doStream({ prompt: 'Split boundary' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Distributed intelligence' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('2. Field Variation: {"content": "..."}', () => {
    it('2A: streams text chunks formatted with {"content": "..."}', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"content": "Step 1: Parse AST. "}',
          'data: {"content": "Step 2: Stream tokens."}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('custom-pipeline');
      const stream = await model.doStream({ prompt: 'Pipeline execution' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Step 1: Parse AST. ' },
        { type: 'text', text: 'Step 2: Stream tokens.' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('2B: handles {"content": "..."} accompanied by arbitrary metadata fields', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"content": "Validated token", "id": "cmpl-001", "created": 1729250000, "meta": {"cache": "hit"}}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-pipeline').doStream({ prompt: 'Metadata payload' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Validated token' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('3. Field Variation: {"response": "..."}', () => {
    it('3A: streams text chunks formatted with {"response": "..."}', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"response": "Self-hosted "}',
          'data: {"response": "vLLM / Ollama "}',
          'data: {"response": "output"}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('vllm-endpoint');
      const stream = await model.doStream({ prompt: 'vLLM stream' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Self-hosted ' },
        { type: 'text', text: 'vLLM / Ollama ' },
        { type: 'text', text: 'output' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('3B: handles {"response": "..."} combined with completion signals', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"response": "Initial chunk"}',
          'data: {"response": "Final chunk", "finish_reason": "stop"}',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-llm').doStream({ prompt: 'Combined finish signal' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Initial chunk' },
        { type: 'text', text: 'Final chunk' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('4. Interleaved Formatting & Multi-Format Gateways', () => {
    it('4A: parses heterogeneous formats (text, content, response) within a single stream', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"text": "Prefix-text; "}',
          'data: {"content": "Infix-content; "}',
          'data: {"response": "Suffix-response."}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('multi-format-router').doStream({ prompt: 'Heterogeneous stream' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Prefix-text; ' },
        { type: 'text', text: 'Infix-content; ' },
        { type: 'text', text: 'Suffix-response.' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  describe('5. Stream Termination Semantics: [DONE], done: true, finish_reason', () => {
    it('5A: terminates stream on data: [DONE] with stop finish reason', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"text": "Stream content"}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Done test' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Stream content' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('5B: terminates stream on data:[DONE] without space', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data:{"content":"No space after data:"}',
          'data:[DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'No space' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'No space after data:' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('5C: terminates stream on {"done": true} object', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"text": "Payload chunk"}',
          'data: {"done": true}',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Done boolean' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Payload chunk' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('5D: terminates stream on custom finish_reason value (e.g. length, error)', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"response": "Truncated due to token limit"}',
          'data: {"finish_reason": "length"}',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Finish reason length' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Truncated due to token limit' },
        { type: 'finish', finishReason: 'length' },
      ]);
    });
  });

  describe('6. Robustness Under Boundary & Malformed Payloads', () => {
    it('6A: safely ignores non-string or null text fields without emitting corrupted chunks', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          'data: {"text": null}',
          'data: {"content": 12345}',
          'data: {"response": {"nested": "object"}}',
          'data: {"text": "Valid text after invalid fields"}',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Invalid types' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Valid text after invalid fields' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('6B: ignores SSE comments (: ping) and blank lines interspersed with custom data', async () => {
      const mockFetch = vi.fn(async () => {
        return createTextStreamResponse([
          ': sse keep-alive comment',
          '',
          '   ',
          'data: {"text": "Before comment"}',
          ': another ping',
          'data: {"text": "After comment"}',
          '',
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Comments and blank lines' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Before comment' },
        { type: 'text', text: 'After comment' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('6C: handles [DONE] split across packet boundaries (data: [DO + NE])', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"response": "Splitted done token"}\n\ndata: [DO');
      const chunk2 = encoder.encode('NE]\n\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2]));
      const provider = createAIProvider({
        ...customConfig,
        fetch: mockFetch as unknown as typeof fetch,
      });

      const stream = await provider('custom-model').doStream({ prompt: 'Split [DONE]' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'Splitted done token' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });
});
