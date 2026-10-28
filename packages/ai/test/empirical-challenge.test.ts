import { describe, it, expect, vi } from 'vitest';
import {
  createAIProvider,
  type AIChunk,
  type AIProviderConfig,
  type StreamExecutionOptions,
} from '../src/index.js';

function createChunkedStreamResponse(byteChunks: Uint8Array[], onCancel?: (reason: unknown) => void): Response {
  let streamCancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of byteChunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
    cancel(reason) {
      streamCancelled = true;
      if (onCancel) onCancel(reason);
    },
  });

  return new Response(stream, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createDelayedStreamResponse(
  chunks: string[],
  onCancel?: (reason: unknown) => void,
): Response {
  const encoder = new TextEncoder();
  let pullCount = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pullCount < chunks.length) {
        controller.enqueue(encoder.encode(chunks[pullCount]!));
        pullCount++;
      } else {
        controller.close();
      }
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

describe('Empirical Challenge Suite — PR #245 @ranu/ai Stream Engine', () => {
  describe('Challenge 1: SSE Buffer Boundary Chunk Splitting', () => {
    it('1A: handles JSON payload split across SSE buffer boundaries', async () => {
      const encoder = new TextEncoder();
      // Split: 'data: {"choices": [{"delta": {"content": "he' and 'llo"}}]}\n\n'
      const chunk1 = encoder.encode('data: {"choices": [{"delta": {"content": "he');
      const chunk2 = encoder.encode('llo"}}]}\n\n');
      const chunk3 = encoder.encode('data: [DONE]\n\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2, chunk3]));
      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'split test' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'hello' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('1B: handles split in "data:" prefix across buffer boundaries', async () => {
      const encoder = new TextEncoder();
      // Split "data: {" across chunks
      const chunk1 = encoder.encode('dat');
      const chunk2 = encoder.encode('a: {"choices": [{"delta": {"content": "prefix-split"}}]}\n\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2]));
      const provider = createAIProvider({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama-3.3-70b');
      const stream = await model.doStream({ prompt: 'prefix split' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([{ type: 'text', text: 'prefix-split' }]);
    });

    it('1C: handles newline split across buffers (CR in chunk 1, LF in chunk 2)', async () => {
      const encoder = new TextEncoder();
      // CRLF split: \r in chunk 1, \n in chunk 2
      const chunk1 = encoder.encode('data: {"choices": [{"delta": {"content": "part1"}}]}\r');
      const chunk2 = encoder.encode('\ndata: {"choices": [{"delta": {"content": "part2"}}]}\r\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2]));
      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'crlf split' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'text', text: 'part1' },
        { type: 'text', text: 'part2' },
      ]);
    });

    it('1D: handles 4-byte UTF-8 emoji split across chunk boundaries', async () => {
      const encoder = new TextEncoder();
      // Rocket emoji: 🚀 (bytes: 0xF0, 0x9F, 0x99, 0x80)
      const rocketBytes = encoder.encode('🚀');
      expect(rocketBytes.length).toBe(4);

      const part1Prefix = encoder.encode('data: {"choices": [{"delta": {"content": "Launch ');
      const part1 = new Uint8Array(part1Prefix.length + 2);
      part1.set(part1Prefix, 0);
      part1.set(rocketBytes.subarray(0, 2), part1Prefix.length); // first 2 bytes of rocket

      const part2Suffix = encoder.encode(' now!"}}]}\n\n');
      const part2 = new Uint8Array(2 + part2Suffix.length);
      part2.set(rocketBytes.subarray(2), 0); // remaining 2 bytes of rocket
      part2.set(part2Suffix, 2);

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([part1, part2]));
      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'utf8 split' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([{ type: 'text', text: 'Launch 🚀 now!' }]);
    });

    it('1E: flushes trailing data without ending newline at stream end', async () => {
      const encoder = new TextEncoder();
      // No ending \n
      const chunk = encoder.encode('data: {"choices": [{"delta": {"content": "no newline"}}]}');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk]));
      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'trailing data' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([{ type: 'text', text: 'no newline' }]);
    });

    it('1F: tests custom provider with data: {"text": "he" split from "llo"}\\n\\n', async () => {
      const encoder = new TextEncoder();
      const chunk1 = encoder.encode('data: {"text": "he');
      const chunk2 = encoder.encode('llo"}\n\n');

      const mockFetch = vi.fn(async () => createChunkedStreamResponse([chunk1, chunk2]));
      const provider = createAIProvider({
        name: 'custom-endpoint',
        baseURL: 'https://llm.custom.internal',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('custom-model');
      const stream = await model.doStream({ prompt: 'hello' });
      const chunks = await collectChunks(stream);

      console.log('Custom provider chunks for {"text": "hello"}:', JSON.stringify(chunks));
      expect(chunks).toEqual([{ type: 'text', text: 'hello' }]);
    });
  });

  describe('Challenge 2: Claude Reasoning & Tool Call Deltas', () => {
    it('2A: correctly decodes Claude thinking_delta into reasoning chunk', async () => {
      const mockFetch = vi.fn(async () => {
        return createDelayedStreamResponse([
          'event: content_block_delta\n',
          'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "Let me calculate 2+2..."}}\n\n',
          'event: content_block_delta\n',
          'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "The answer is 4."}}\n\n',
          'event: message_delta\n',
          'data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 20}}\n\n',
        ]);
      });

      const provider = createAIProvider({
        name: 'claude',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: 'anthropic-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('claude-3-5-sonnet-latest');
      const stream = await model.doStream({ prompt: 'What is 2+2?' });
      const chunks = await collectChunks(stream);

      expect(chunks).toEqual([
        { type: 'reasoning', reasoning: 'Let me calculate 2+2...' },
        { type: 'text', text: 'The answer is 4.' },
        { type: 'finish', finishReason: 'end_turn', usage: { completionTokens: 20 } },
      ]);
    });

    it('2B: tests Claude tool call deltas (content_block_start with tool_use and content_block_delta with input_json_delta)', async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return createDelayedStreamResponse([
          // Claude tool call event 1: content_block_start
          'event: content_block_start\n',
          'data: {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_01A", "name": "get_weather", "input": {}}}\n\n',
          // Claude tool call event 2: content_block_delta (partial json 1)
          'event: content_block_delta\n',
          'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\\"location\\": "}}\n\n',
          // Claude tool call event 3: content_block_delta (partial json 2)
          'event: content_block_delta\n',
          'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "\\"Tokyo\\"}"}}\n\n',
          // Claude tool call event 4: content_block_stop
          'event: content_block_stop\n',
          'data: {"type": "content_block_stop", "index": 1}\n\n',
          // Claude finish
          'event: message_delta\n',
          'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 30}}\n\n',
        ]);
      });

      const provider = createAIProvider({
        name: 'claude',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: 'anthropic-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('claude-3-5-sonnet-latest');
      const stream = await model.doStream({
        prompt: 'What is the weather in Tokyo?',
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for location',
            input_schema: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      });

      const chunks = await collectChunks(stream);

      // Check request body: was tools forwarded to Claude?
      console.log('Claude captured request body keys:', Object.keys(capturedBody ?? {}));
      console.log('Claude received chunks:', JSON.stringify(chunks));

      // Check if any tool-call chunks were emitted
      const toolCallChunks = chunks.filter((c) => c.type === 'tool-call');
      expect(toolCallChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Challenge 3: Stream Cancellation & Resource Cleanup', () => {
    it('3A: cancels underlying reader and releases locks when consumer cancels outer reader halfway', async () => {
      let underlyingCancelled = false;
      let cancelReasonReceived: unknown;

      const mockFetch = vi.fn(async () => {
        return createDelayedStreamResponse(
          [
            'data: {"choices": [{"delta": {"content": "chunk-1"}}]}\n\n',
            'data: {"choices": [{"delta": {"content": "chunk-2"}}]}\n\n',
            'data: {"choices": [{"delta": {"content": "chunk-3"}}]}\n\n',
          ],
          (reason) => {
            underlyingCancelled = true;
            cancelReasonReceived = reason;
          },
        );
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'cancel halfway' });
      const reader = stream.getReader();

      // Read only first chunk
      const firstChunk = await reader.read();
      expect(firstChunk.done).toBe(false);
      expect(firstChunk.value).toEqual({ type: 'text', text: 'chunk-1' });

      // Consumer cancels stream halfway through reading
      await reader.cancel('consumer_stopped_early');

      // Verify underlying response stream was cancelled with the reason
      expect(underlyingCancelled).toBe(true);
      expect(cancelReasonReceived).toBe('consumer_stopped_early');

      // Subsequent read on cancelled reader should return done
      const afterCancel = await reader.read();
      expect(afterCancel.done).toBe(true);
    });

    it('3B: releases inner stream reader lock without throwing on consumer cancel', async () => {
      let cancelCalled = false;
      let innerStream: ReadableStream<Uint8Array>;

      const encoder = new TextEncoder();
      const mockFetch = vi.fn(async () => {
        innerStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices": [{"delta": {"content": "A"}}]}\n\n'));
          },
          cancel() {
            cancelCalled = true;
          },
        });
        return new Response(innerStream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'test' });
      const reader = stream.getReader();

      await reader.read();
      await reader.cancel('abort');

      expect(cancelCalled).toBe(true);
      // Verify innerStream is not locked anymore
      expect(innerStream!.locked).toBe(false);
    });
  });
});
