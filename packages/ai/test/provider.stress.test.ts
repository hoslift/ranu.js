import { describe, it, expect, vi } from 'vitest';
import {
  createAIProvider,
  type AIChunk,
  type AIProviderConfig,
  type StreamExecutionOptions,
} from '../src/index.js';

function createMockStreamResponse(
  lines: string[],
  status = 200,
  statusText = 'OK',
  delayMs = 0,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const line of lines) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
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

function createChunkedByteStreamResponse(
  chunks: Uint8Array[],
  status = 200,
  statusText = 'OK',
): Response {
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
    headers: {
      'Content-Type': 'application/x-ndjson',
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

describe('@ranu/ai — Empirical Stress & Robustness Suite', () => {
  describe('1. Rotating Tokens, Async Headers & Concurrency (50+ Requests)', () => {
    it('handles 100 concurrent requests with per-request rotating tokens and async headers with zero cross-talk', async () => {
      let tokenCounter = 0;
      const requestLogs: Array<{ requestId: number; token: string; url: string }> = [];

      const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const auth = headers.get('Authorization') ?? '';
        const reqId = parseInt(headers.get('X-Request-Id') ?? '-1', 10);

        requestLogs.push({
          requestId: reqId,
          token: auth,
          url: String(url),
        });

        // Add variable micro-jitter (1-5ms) to simulate real network concurrency
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 5 + 1));

        return createMockStreamResponse([
          `data: {"choices": [{"delta": {"content": "Response for req-${reqId}"}}]}`,
          'data: [DONE]',
        ]);
      });

      const provider = createAIProvider({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        headers: async () => {
          // Asynchronously resolve headers with dynamic session token
          const currentId = ++tokenCounter;
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
          return {
            'X-Request-Id': String(currentId),
            'X-Session-Timestamp': Date.now().toString(),
          };
        },
        apiKey: async () => {
          // Dynamically rotating token based on counter
          return `bearer-token-gen-${tokenCounter}`;
        },
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama-3.3-70b');

      // Launch 100 simultaneous requests
      const concurrentCount = 100;
      const tasks = Array.from({ length: concurrentCount }, async (_, idx) => {
        const stream = await model.doStream({ prompt: `Concurrent test ${idx}` });
        const chunks = await collectChunks(stream);
        return { idx, chunks };
      });

      const results = await Promise.all(tasks);

      // Verify all 100 requests completed successfully
      expect(results).toHaveLength(concurrentCount);
      expect(mockFetch).toHaveBeenCalledTimes(concurrentCount);
      expect(requestLogs).toHaveLength(concurrentCount);

      // Verify every request got its unique token and headers without collisions or cross-talk
      const requestIds = requestLogs.map((l) => l.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(concurrentCount);

      for (const log of requestLogs) {
        expect(log.token).toMatch(/^Bearer bearer-token-gen-\d+$/);
      }

      // Verify each stream yielded valid content chunks
      for (const result of results) {
        const textChunks = result.chunks.filter((c) => c.type === 'text');
        expect(textChunks.length).toBeGreaterThanOrEqual(1);
        expect(result.chunks.some((c) => c.type === 'finish')).toBe(true);
      }
    });

    it('handles concurrency under heavy AbortSignal cancellation (50 simultaneous requests)', async () => {
      let abortedBeforeStartCount = 0;
      let abortedMidStreamCount = 0;
      let completedCount = 0;

      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          throw new DOMException('This operation was aborted', 'AbortError');
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let i = 0; i < 5; i++) {
              if (signal?.aborted) {
                controller.error(new DOMException('This operation was aborted', 'AbortError'));
                return;
              }
              await new Promise((resolve) => setTimeout(resolve, 10));
              if (signal?.aborted) {
                controller.error(new DOMException('This operation was aborted', 'AbortError'));
                return;
              }
              controller.enqueue(
                encoder.encode(`data: {"choices": [{"delta": {"content": "part-${i}"}}]}\n\n`),
              );
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
          cancel(reason) {
            // Signal stream cancellation
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-stress-test',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');

      // 60 simultaneous requests:
      // - 20 aborted before dispatch
      // - 20 aborted mid-stream
      // - 20 run to full completion
      const totalRequests = 60;
      const tasks = Array.from({ length: totalRequests }, async (_, index) => {
        const abortController = new AbortController();

        if (index < 20) {
          // Pre-aborted
          abortController.abort(new DOMException('Aborted immediately', 'AbortError'));
          try {
            await model.doStream({ prompt: `Pre-aborted ${index}`, signal: abortController.signal });
          } catch (err: any) {
            expect(err.name).toBe('AbortError');
            abortedBeforeStartCount++;
          }
        } else if (index < 40) {
          // Mid-stream abort after first chunk
          try {
            const stream = await model.doStream({
              prompt: `Mid-stream abort ${index}`,
              signal: abortController.signal,
            });
            const reader = stream.getReader();
            const { value } = await reader.read();
            expect(value?.type).toBe('text');

            // Trigger abort mid-stream
            abortController.abort(new DOMException('Aborted mid-stream', 'AbortError'));

            // Next read should reject
            await reader.read();
          } catch (err: any) {
            expect(err.name).toBe('AbortError');
            abortedMidStreamCount++;
          }
        } else {
          // Normal execution
          const stream = await model.doStream({
            prompt: `Completed ${index}`,
            signal: abortController.signal,
          });
          const chunks = await collectChunks(stream);
          expect(chunks.length).toBeGreaterThan(0);
          completedCount++;
        }
      });

      await Promise.all(tasks);

      expect(abortedBeforeStartCount).toBe(20);
      expect(abortedMidStreamCount).toBe(20);
      expect(completedCount).toBe(20);
    });

    it('handles explicit stream cancellation via reader.cancel()', async () => {
      let underlyingCancelled = false;

      const mockFetch = vi.fn(async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices": [{"delta": {"content": "first"}}]}\n\n'));
          },
          cancel(reason) {
            underlyingCancelled = true;
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');
      const stream = await model.doStream({ prompt: 'Cancel test' });
      const reader = stream.getReader();

      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'first' });

      await reader.cancel('User requested cancellation');
      expect(underlyingCancelled).toBe(true);
    });
  });

  describe('2. Endpoint Error Handling (401, 429, 500)', () => {
    it('handles 401 Unauthorized with detailed upstream error body', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Invalid API key provided: sk-invalid-key-12345',
              type: 'invalid_request_error',
              code: 'invalid_api_key',
            },
          }),
          {
            status: 401,
            statusText: 'Unauthorized',
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      const provider = createAIProvider({
        name: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'bad-key',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('gpt-4o');

      await expect(model.doStream({ prompt: 'Test 401' })).rejects.toThrow(
        /Provider \(openai\) request failed with status 401 Unauthorized: {"error":{"message":"Invalid API key provided/,
      );
    });

    it('handles 429 Rate Limit Exceeded with retry guidance', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Rate limit reached for requests per minute (RPM). Please wait 20 seconds before retrying.',
              type: 'rate_limit_exceeded',
              code: 'rate_limit',
            },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '20',
            },
          },
        );
      });

      const provider = createAIProvider({
        name: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        apiKey: 'gsk-rate-limited',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama-3.3-70b');

      await expect(model.doStream({ prompt: 'Test 429' })).rejects.toThrow(
        /Provider \(groq\) request failed with status 429 Too Many Requests: {"error":{"message":"Rate limit reached/,
      );
    });

    it('handles 500 Server Error across JSON, HTML, and empty error bodies', async () => {
      // 500 with JSON error
      const mockFetchJson = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: {
              message: 'An internal server error occurred while processing LLM inference',
              type: 'internal_server_error',
            },
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      const providerJson = createAIProvider({
        name: 'claude',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: 'anthropic-key',
        fetch: mockFetchJson as unknown as typeof fetch,
      });

      await expect(providerJson('claude-3-5-sonnet').doStream({ prompt: 'Test 500 JSON' })).rejects.toThrow(
        /Provider \(claude\) request failed with status 500 Internal Server Error: {"error":{"message":"An internal server error/,
      );

      // 500 with Cloudflare/Nginx HTML error page
      const htmlError = '<html><head><title>500 Internal Server Error</title></head><body><h1>Server Error</h1></body></html>';
      const mockFetchHtml = vi.fn(async () => {
        return new Response(htmlError, {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'text/html' },
        });
      });

      const providerHtml = createAIProvider({
        name: 'custom-proxy',
        baseURL: 'https://gateway.company.internal',
        fetch: mockFetchHtml as unknown as typeof fetch,
      });

      await expect(providerHtml('custom-model').doStream({ prompt: 'Test 500 HTML' })).rejects.toThrow(
        /Provider \(custom-proxy\) request failed with status 500 Internal Server Error: <html><head><title>500 Internal Server Error/,
      );

      // 500 with completely empty body
      const mockFetchEmpty = vi.fn(async () => {
        return new Response('', {
          status: 500,
          statusText: 'Internal Server Error',
        });
      });

      const providerEmpty = createAIProvider({
        name: 'custom-empty',
        baseURL: 'https://gateway.company.internal',
        fetch: mockFetchEmpty as unknown as typeof fetch,
      });

      await expect(providerEmpty('custom-model').doStream({ prompt: 'Test 500 Empty' })).rejects.toThrow(
        /Provider \(custom-empty\) request failed with status 500 Internal Server Error: $/,
      );
    });

    it('propagates network-level fetch failures (ECONNREFUSED / DNS resolution)', async () => {
      const mockFetch = vi.fn(async () => {
        throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:11434');
      });

      const provider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://127.0.0.1:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      await expect(provider('llama3').doStream({ prompt: 'Test network error' })).rejects.toThrow(
        /connect ECONNREFUSED 127.0.0.1:11434/,
      );
    });
  });

  describe('3. Local Ollama Mode: NDJSON Malformation & Timeouts', () => {
    it('gracefully survives malformed, corrupted, truncated, and non-JSON lines interspersed with valid NDJSON', async () => {
      const mockFetch = vi.fn(async () => {
        return createMockStreamResponse([
          // Valid chunk 1
          '{"model":"llama3","message":{"role":"assistant","content":"First chunk "},"done":false}',
          // Corrupted / truncated JSON
          '{"model":"llama3","message":{"role":"assistant","con',
          // Random text error string
          'error: model runner memory exhausted',
          // HTML gateway response
          '<p>502 Bad Gateway</p>',
          // Empty lines & whitespace lines
          '',
          '   ',
          '\t\t',
          // Bracketed but invalid JSON syntax
          '{ "syntax_error": true, , }',
          // SSE style line accidentally routed
          ': keep-alive ping',
          // Valid chunk 2
          '{"model":"llama3","message":{"role":"assistant","content":"survives malformed lines "},"done":false}',
          // Broken JSON with matching brackets
          '{"key": undefined}',
          // Valid final chunk with done: true and token usage
          '{"model":"llama3","message":{"role":"assistant","content":"successfully!"},"done":true,"done_reason":"stop","prompt_eval_count":25,"eval_count":12}',
        ]);
      });

      const provider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://localhost:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama3');
      const stream = await model.doStream({ prompt: 'Test NDJSON malformations' });
      const chunks = await collectChunks(stream);

      // Verify that corrupt lines were silently ignored without crashing the stream
      expect(chunks).toEqual([
        { type: 'text', text: 'First chunk ' },
        { type: 'text', text: 'survives malformed lines ' },
        { type: 'text', text: 'successfully!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 25, completionTokens: 12 },
        },
      ]);
    });

    it('correctly reassembles NDJSON chunks fragmented across arbitrary TCP packet byte boundaries', async () => {
      const fullNdjson = [
        '{"model":"llama3","message":{"role":"assistant","content":"Fragmented "},"done":false}\n',
        '{"model":"llama3","message":{"role":"assistant","content":"byte "},"done":false}\n',
        '{"model":"llama3","message":{"role":"assistant","content":"stream"},"done":true,"done_reason":"stop"}\n',
      ].join('');

      const encoder = new TextEncoder();
      const allBytes = encoder.encode(fullNdjson);

      // Split into tiny 7-byte chunks to stress boundary reassembly
      const chunks: Uint8Array[] = [];
      const chunkSize = 7;
      for (let i = 0; i < allBytes.length; i += chunkSize) {
        chunks.push(allBytes.slice(i, i + chunkSize));
      }

      const mockFetch = vi.fn(async () => {
        return createChunkedByteStreamResponse(chunks);
      });

      const provider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://localhost:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama3');
      const stream = await model.doStream({ prompt: 'Byte splitting test' });
      const collected = await collectChunks(stream);

      expect(collected).toEqual([
        { type: 'text', text: 'Fragmented ' },
        { type: 'text', text: 'byte ' },
        { type: 'text', text: 'stream' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('enforces connection timeout before response headers via AbortSignal.timeout()', async () => {
      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_, reject) => {
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(signal.reason ?? new DOMException('The operation timed out', 'TimeoutError'));
            });
          }
          // Intentionally never resolve unless aborted
        });
      });

      const provider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://localhost:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama3');

      // Use a 40ms timeout signal
      const timeoutSignal = AbortSignal.timeout(40);

      const startTime = Date.now();
      await expect(
        model.doStream({ prompt: 'Hung connection test', signal: timeoutSignal }),
      ).rejects.toThrow();

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(500); // Timed out promptly
    });

    it('enforces streaming read timeout mid-stream when server stops responding', async () => {
      const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal;
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            // Send first chunk promptly
            controller.enqueue(
              encoder.encode('{"model":"llama3","message":{"role":"assistant","content":"Initial chunk"},"done":false}\n'),
            );

            // Listen for abort to trigger error on controller
            if (signal) {
              signal.addEventListener('abort', () => {
                controller.error(signal.reason ?? new DOMException('Operation timed out', 'TimeoutError'));
              });
            }
            // Intentionally hang and never send further chunks or close
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        });
      });

      const provider = createAIProvider({
        name: 'ollama',
        baseURL: 'http://localhost:11434',
        fetch: mockFetch as unknown as typeof fetch,
      });

      const model = provider('llama3');
      const timeoutSignal = AbortSignal.timeout(50);

      const stream = await model.doStream({
        prompt: 'Mid-stream hang test',
        signal: timeoutSignal,
      });

      const reader = stream.getReader();

      // First chunk arrives fine
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Initial chunk' });

      // Second read should reject due to timeout abort
      await expect(reader.read()).rejects.toThrow();
    });
  });
});
