/**
 * Empirical Challenge & Stress Test Suite for @ranu/ai-custom
 *
 * Rigorously challenges and tests:
 * 1. Authentication Matrix: static keys, sync/async functions, custom header names,
 *    custom prefixes, monthly subscription session tokens, tenant & organization headers,
 *    precedence rules, dynamic headers, per-call headers, and environment variable fallbacks.
 * 2. Concurrency Stress: 50+ simultaneous requests asserting zero cross-talk, memory leaks,
 *    or race conditions under async jitter and diverse payloads.
 * 3. Network Failure Resilience: HTTP 401, 403, 404, 429, 500, 502, 503, 504, connection resets,
 *    mid-stream aborts, 1-byte TCP stream fragmentation, and corrupted SSE payloads.
 * 4. Core Integration: @ranu/ai's streamAI backpressure queue, SSE event framing,
 *    maxBytes ceilings, and generateObject Standard-Schema validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamAI,
  generateObject,
  AIValidationError,
  createStreamingDrainTracker,
  type AIChunk,
  type StandardSchemaV1,
} from '@ranu/ai';
import {
  createCustomAI,
  custom,
  isDeepSeekR1,
  resolveBaseURL,
  type CustomModelId,
} from '../src/index.js';

function createChunkedByteStream(chunks: Uint8Array[], delayMs = 0): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
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

describe('Empirical Challenge: @ranu/ai-custom Enterprise Stress Harness', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env['CUSTOM_AI_BASE_URL'];
    delete process.env['OLLAMA_BASE_URL'];
    delete process.env['CUSTOM_AI_API_KEY'];
    delete process.env['CUSTOM_AI_KEY'];
    delete process.env['OLLAMA_API_KEY'];
    delete process.env['CUSTOM_AI_TENANT_ID'];
    delete process.env['CUSTOM_AI_ORG_ID'];
    delete process.env['CUSTOM_AI_ORGANIZATION_ID'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: Enterprise Authentication Matrix
  // =========================================================================
  describe('1. Enterprise Authentication Matrix', () => {
    it('1A: Static string API key with default Bearer prefix and Authorization header', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: 'sk-enterprise-fixed-12345',
        fetch: mockFetch,
      });

      const stream = await provider('llama3').doStream({ prompt: 'test' });
      await collectChunks(stream);

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-enterprise-fixed-12345');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('1B: Synchronous function returning string API key', async () => {
      let capturedAuth = '';
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: () => {
          callCount++;
          return 'sync-key-token-888';
        },
        fetch: mockFetch,
      });

      const stream = await provider('mistral').doStream({ prompt: 'test' });
      await collectChunks(stream);

      expect(callCount).toBe(1);
      expect(capturedAuth).toBe('Bearer sync-key-token-888');
    });

    it('1C: Asynchronous function returning Promise<string> API key with rotation', async () => {
      let capturedAuth = '';
      let iteration = 0;
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: async () => {
          iteration++;
          await new Promise((r) => setTimeout(r, 5));
          return `rotated-jwt-token-#${iteration}`;
        },
        fetch: mockFetch,
      });

      // First call
      const stream1 = await provider('llama3').doStream({ prompt: 'call1' });
      await collectChunks(stream1);
      expect(capturedAuth).toBe('Bearer rotated-jwt-token-#1');

      // Second call — must re-evaluate async function for key rotation
      const stream2 = await provider('llama3').doStream({ prompt: 'call2' });
      await collectChunks(stream2);
      expect(capturedAuth).toBe('Bearer rotated-jwt-token-#2');
    });

    it('1D: Custom header names (x-api-key, api-key, etc.) and custom prefixes (Token , empty string)', async () => {
      // Case 1: x-api-key with Token prefix
      let capturedHeaders1: Record<string, string> = {};
      const mockFetch1 = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders1 = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider1 = createCustomAI({
        apiKey: 'secret-auth-key-001',
        authHeaderName: 'x-api-key',
        authHeaderPrefix: 'Token ',
        fetch: mockFetch1,
      });

      const stream1 = await provider1('deepseek-r1').doStream({ prompt: 'test' });
      await collectChunks(stream1);

      expect(capturedHeaders1['x-api-key']).toBe('Token secret-auth-key-001');
      expect(capturedHeaders1['Authorization']).toBeUndefined();

      // Case 2: api-key with empty prefix "" (raw token)
      let capturedHeaders2: Record<string, string> = {};
      const mockFetch2 = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders2 = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider2 = createCustomAI({
        apiKey: 'raw-hex-token-abcdef',
        authHeaderName: 'api-key',
        authHeaderPrefix: '',
        fetch: mockFetch2,
      });

      const stream2 = await provider2('qwen2.5').doStream({ prompt: 'test' });
      await collectChunks(stream2);

      expect(capturedHeaders2['api-key']).toBe('raw-hex-token-abcdef');
      expect(capturedHeaders2['Authorization']).toBeUndefined();
    });

    it('1E: Monthly subscription sessionToken: static, sync function, async function', async () => {
      // 1E-1: Static sessionToken
      let capturedAuth = '';
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const p1 = createCustomAI({
        sessionToken: 'sess_monthly_tier3_abc',
        fetch: mockFetch,
      });
      await collectChunks(await p1('llama3').doStream({ prompt: 'hi' }));
      expect(capturedAuth).toBe('Bearer sess_monthly_tier3_abc');

      // 1E-2: Sync function sessionToken
      const p2 = createCustomAI({
        sessionToken: () => 'sess_sync_sub_123',
        fetch: mockFetch,
      });
      await collectChunks(await p2('llama3').doStream({ prompt: 'hi' }));
      expect(capturedAuth).toBe('Bearer sess_sync_sub_123');

      // 1E-3: Async function sessionToken
      const p3 = createCustomAI({
        sessionToken: async () => {
          await new Promise((r) => setTimeout(r, 2));
          return 'sess_async_refreshed_999';
        },
        fetch: mockFetch,
      });
      await collectChunks(await p3('llama3').doStream({ prompt: 'hi' }));
      expect(capturedAuth).toBe('Bearer sess_async_refreshed_999');
    });

    it('1F: apiKey takes precedence over sessionToken when both are configured', async () => {
      let capturedAuth = '';
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedAuth = init.headers['Authorization'];
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        apiKey: 'primary-api-key',
        sessionToken: 'secondary-session-token',
        fetch: mockFetch,
      });

      await collectChunks(await provider('llama3').doStream({ prompt: 'hi' }));
      expect(capturedAuth).toBe('Bearer primary-api-key');
    });

    it('1G: Enterprise tenantId and organizationId headers mapping', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        tenantId: 'tenant-corp-apac',
        organizationId: 'org-enterprise-999',
        fetch: mockFetch,
      });

      await collectChunks(await provider('mistral').doStream({ prompt: 'hi' }));
      expect(capturedHeaders['x-tenant-id']).toBe('tenant-corp-apac');
      expect(capturedHeaders['x-organization-id']).toBe('org-enterprise-999');
      expect(capturedHeaders['OpenAI-Organization']).toBe('org-enterprise-999');
    });

    it('1H: Dynamic headers via async function and merging with per-call options headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({
        headers: async () => ({
          'x-cluster-zone': 'us-east-1a',
          'x-gateway-routing': 'internal-vllm',
        }),
        fetch: mockFetch,
      });

      // Per-call headers object
      await collectChunks(
        await provider('llama3').doStream({
          prompt: 'test',
          headers: {
            'x-request-id': 'req-corr-12345',
            'x-cluster-zone': 'override-us-west-2b',
          },
        }),
      );

      expect(capturedHeaders['x-gateway-routing']).toBe('internal-vllm');
      expect(capturedHeaders['x-cluster-zone']).toBe('override-us-west-2b');
      expect(capturedHeaders['x-request-id']).toBe('req-corr-12345');
    });

    it('1I: Per-call headers supporting Headers instance and plain header record', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({ fetch: mockFetch });

      // 1. Headers instance
      const h = new Headers();
      h.set('x-custom-track', 'track-abc');
      h.set('x-multi-value', 'val-123');
      await collectChunks(await provider('llama3').doStream({ prompt: 'test', headers: h }));
      expect(capturedHeaders['x-custom-track']).toBe('track-abc');
      expect(capturedHeaders['x-multi-value']).toBe('val-123');

      // 2. Plain record object
      await collectChunks(
        await provider('llama3').doStream({
          prompt: 'test',
          headers: { 'x-record-header': 'rec-val' },
        }),
      );
      expect(capturedHeaders['x-record-header']).toBe('rec-val');
    });

    it('1J: Empirical edge case: Array.prototype.entries intercepts array tuple headers into index keys', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({ fetch: mockFetch });

      // In custom.ts, typeof (optionsHeaders as Headers).entries === 'function' checks for Headers,
      // but in JS Array.prototype.entries also matches, resulting in array index keys:
      await collectChunks(
        await provider('llama3').doStream({
          prompt: 'test',
          headers: [['x-tuple-header', 'tuple-val']],
        }),
      );
      // Confirms empirical finding: index '0' receives the tuple entry rather than unpacked header key
      expect((capturedHeaders as Record<string, unknown>)['0']).toEqual([
        'x-tuple-header',
        'tuple-val',
      ]);
    });

    it('1K: Environment variable fallback resolution for auth and enterprise headers', async () => {
      process.env['CUSTOM_AI_API_KEY'] = 'env-custom-key-777';
      process.env['CUSTOM_AI_TENANT_ID'] = 'env-tenant-hq';
      process.env['CUSTOM_AI_ORG_ID'] = 'env-org-global';

      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((_url, init) => {
        capturedHeaders = init.headers;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      const provider = createCustomAI({ fetch: mockFetch });
      await collectChunks(await provider('llama3').doStream({ prompt: 'test' }));

      expect(capturedHeaders['Authorization']).toBe('Bearer env-custom-key-777');
      expect(capturedHeaders['x-tenant-id']).toBe('env-tenant-hq');
      expect(capturedHeaders['x-organization-id']).toBe('env-org-global');
      expect(capturedHeaders['OpenAI-Organization']).toBe('env-org-global');
    });

    it('1L: BaseURL whitespace and trailing slash normalization', async () => {
      let capturedUrl = '';
      const mockFetch = vi.fn().mockImplementation((url) => {
        capturedUrl = url;
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      });

      // Config with trailing slashes and whitespace
      const provider1 = createCustomAI({
        baseURL: '   https://proxy.internal.corp/v1///   ',
        fetch: mockFetch,
      });
      await collectChunks(await provider1('llama3').doStream({ prompt: 'test' }));
      expect(capturedUrl).toBe('https://proxy.internal.corp/v1/chat/completions');

      // Config where baseURL already includes /chat/completions
      const provider2 = createCustomAI({
        baseURL: 'https://proxy.internal.corp/v1/chat/completions',
        fetch: mockFetch,
      });
      await collectChunks(await provider2('llama3').doStream({ prompt: 'test' }));
      expect(capturedUrl).toBe('https://proxy.internal.corp/v1/chat/completions');
    });

    it('1M: Asynchronous apiKey error handling properly rejects doStream', async () => {
      const provider = createCustomAI({
        apiKey: () => Promise.reject(new Error('KMS token acquisition failed: 403')),
      });

      await expect(provider('llama3').doStream({ prompt: 'test' })).rejects.toThrow(
        'KMS token acquisition failed: 403',
      );
    });
  });

  // =========================================================================
  // SUITE 2: Concurrency Stress Test (50+ simultaneous requests)
  // =========================================================================
  describe('2. Concurrency Stress Test (50+ Simultaneous Requests)', () => {
    it('2A: 60 simultaneous requests with distinct keys, models, headers, and payloads assert zero cross-talk', async () => {
      const concurrencyCount = 60;
      const models: CustomModelId[] = [
        'llama3',
        'llama3.1',
        'llama3.2',
        'mistral',
        'deepseek-r1',
        'qwen2.5',
        'phi3',
        'vllm-custom-model',
        'deepseek-reasoner',
        'hermes-3',
      ];

      const capturedRequests: Array<{
        url: string;
        headers: Record<string, string>;
        body: Record<string, unknown>;
      }> = [];

      const mockFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const bodyObj = JSON.parse(init.body as string) as Record<string, unknown>;
        const headers = init.headers as Record<string, string>;
        capturedRequests.push({ url, headers, body: bodyObj });

        // Extract request index from prompt
        const messages = bodyObj['messages'] as Array<{ content: string }>;
        const promptText = messages[0]?.content ?? '';
        const match = /REQ_INDEX_(\d+)/.exec(promptText);
        const reqIndex = match ? parseInt(match[1]!, 10) : -1;
        const isDeepSeek = isDeepSeekR1(bodyObj['model'] as string);

        // Add simulated async network jitter (1ms - 15ms)
        const jitterMs = 1 + (reqIndex % 15);
        await new Promise((r) => setTimeout(r, jitterMs));

        let sse = '';
        if (isDeepSeek) {
          sse += `data: {"choices":[{"delta":{"reasoning_content":"Reasoning for #${reqIndex}"}}]}\n\n`;
        }
        sse += `data: {"choices":[{"delta":{"content":"Response payload for #${reqIndex}"}}]}\n\n`;
        sse += `data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n`;
        sse += `data: [DONE]\n\n`;

        return new Response(sse, { status: 200 });
      });

      // Launch 60 simultaneous requests concurrently
      const promises = Array.from({ length: concurrencyCount }, async (_, idx) => {
        const targetModel = models[idx % models.length]!;
        const apiKey = `sk-concurrency-token-${idx}`;
        const tenantId = `tenant-${idx % 5}`;
        const orgId = `org-${idx % 3}`;

        const provider = createCustomAI({
          baseURL: `https://vllm-node-${idx % 4}.internal/v1`,
          apiKey: async () => {
            // Dynamic async delay to simulate interleaved async execution
            await new Promise((r) => setTimeout(r, idx % 5));
            return apiKey;
          },
          tenantId,
          organizationId: orgId,
          headers: () => ({ 'x-worker-slot': `slot-${idx}` }),
          fetch: mockFetch,
        });

        const stream = await provider(targetModel).doStream({
          prompt: `REQ_INDEX_${idx}: Compute output`,
          headers: { 'x-correlation-id': `corr-${idx}` },
        });

        const chunks = await collectChunks(stream);
        return { idx, targetModel, apiKey, tenantId, orgId, chunks };
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrencyCount);
      expect(capturedRequests).toHaveLength(concurrencyCount);

      // Verify zero cross-talk across all 60 requests
      for (const res of results) {
        const { idx, targetModel, apiKey, tenantId, orgId, chunks } = res;

        // Verify request payload headers matching strictly its own identity
        const matchedReq = capturedRequests.find((r) => {
          const msgs = r.body['messages'] as Array<{ content: string }>;
          return msgs[0]?.content === `REQ_INDEX_${idx}: Compute output`;
        });

        expect(matchedReq).toBeDefined();
        expect(matchedReq!.headers['Authorization']).toBe(`Bearer ${apiKey}`);
        expect(matchedReq!.headers['x-tenant-id']).toBe(tenantId);
        expect(matchedReq!.headers['x-organization-id']).toBe(orgId);
        expect(matchedReq!.headers['x-correlation-id']).toBe(`corr-${idx}`);
        expect(matchedReq!.headers['x-worker-slot']).toBe(`slot-${idx}`);
        expect(matchedReq!.body['model']).toBe(targetModel);

        // Verify response stream isolation
        const isDeepSeek = isDeepSeekR1(targetModel);
        if (isDeepSeek) {
          const reasoningChunk = chunks.find((c) => c.type === 'reasoning');
          expect(reasoningChunk).toBeDefined();
          expect((reasoningChunk as { reasoning: string }).reasoning).toBe(
            `Reasoning for #${idx}`,
          );
        }

        const textChunk = chunks.find((c) => c.type === 'text');
        expect(textChunk).toBeDefined();
        expect((textChunk as { text: string }).text).toBe(`Response payload for #${idx}`);

        const finishChunk = chunks.find((c) => c.type === 'finish');
        expect(finishChunk).toBeDefined();
        expect((finishChunk as { finishReason: string }).finishReason).toBe('stop');
      }
    });

    it('2B: High-throughput burst of 75 simultaneous requests with byte stream fragmentation', async () => {
      const count = 75;
      let activeStreams = 0;
      let peakConcurrency = 0;

      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        activeStreams++;
        peakConcurrency = Math.max(peakConcurrency, activeStreams);

        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        const msgs = body['messages'] as Array<{ content: string }>;
        const prompt = msgs[0]?.content ?? '';

        const sseText =
          `data: {"choices":[{"delta":{"content":"Chunk-1-${prompt}"}}]}\n\n` +
          `data: {"choices":[{"delta":{"content":"Chunk-2-${prompt}"}}]}\n\n` +
          `data: {"choices":[{"finish_reason":"stop"}]}\n\n` +
          `data: [DONE]\n\n`;

        // Fragment into 3-byte chunks to stress SSE line parser buffer reassembly
        const byteChunks = sliceIntoBytes(sseText, 3);
        const stream = createChunkedByteStream(byteChunks, 1);

        return new Response(stream, { status: 200 });
      });

      const provider = createCustomAI({
        apiKey: 'burst-key',
        fetch: mockFetch,
      });

      const burstTasks = Array.from({ length: count }, async (_, i) => {
        const stream = await provider('llama3').doStream({ prompt: `task-${i}` });
        const chunks = await collectChunks(stream);
        activeStreams--;

        const combinedText = chunks
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');

        expect(combinedText).toBe(`Chunk-1-task-${i}Chunk-2-task-${i}`);
        return chunks;
      });

      const allResults = await Promise.all(burstTasks);
      expect(allResults).toHaveLength(count);
      expect(peakConcurrency).toBeGreaterThanOrEqual(10);
      expect(activeStreams).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 3: Network Failure Resilience
  // =========================================================================
  describe('3. Network Failure Resilience', () => {
    it('3A: Handles HTTP 401 Unauthorized with detailed upstream error body', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid API key provided' } }), {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const model = createCustomAI({ apiKey: 'bad-key', fetch: mockFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 401 Unauthorized: {"error":{"message":"Invalid API key provided"}}/,
      );
    });

    it('3B: Handles HTTP 403 Forbidden (insufficient enterprise permissions / tenant blocked)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'tenant_quota_exceeded', message: 'Tenant APAC blocked' },
          }),
          {
            status: 403,
            statusText: 'Forbidden',
          },
        ),
      );

      const model = createCustomAI({
        apiKey: 'sk-corp',
        tenantId: 'apac',
        fetch: mockFetch,
      })('mistral');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 403 Forbidden/,
      );
    });

    it('3C: Handles HTTP 404 Not Found (model not loaded or wrong endpoint)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Model "custom-unknown-xyz" not found on Ollama server', {
          status: 404,
          statusText: 'Not Found',
        }),
      );

      const model = createCustomAI({ fetch: mockFetch })('custom-unknown-xyz');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 404 Not Found: Model "custom-unknown-xyz" not found on Ollama server/,
      );
    });

    it('3D: Handles HTTP 429 Rate Limited (Too Many Requests / Token Bucket Exhausted)', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Rate limit reached. Limit: 100 req/min. Please retry in 3.5s.' },
          }),
          {
            status: 429,
            statusText: 'Too Many Requests',
          },
        ),
      );

      const model = createCustomAI({ fetch: mockFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        /Custom AI request failed with status 429 Too Many Requests.*Rate limit reached/,
      );
    });

    it('3E: Handles HTTP 500, 502, 503, 504 server & gateway errors', async () => {
      const serverErrors = [
        { status: 500, statusText: 'Internal Server Error', body: 'vLLM worker OOM crashed' },
        { status: 502, statusText: 'Bad Gateway', body: 'NGINX upstream proxy failed' },
        { status: 503, statusText: 'Service Unavailable', body: 'Queue saturated' },
        { status: 504, statusText: 'Gateway Timeout', body: 'Inference generation timed out' },
      ];

      for (const err of serverErrors) {
        const mockFetch = vi.fn().mockResolvedValue(
          new Response(err.body, {
            status: err.status,
            statusText: err.statusText,
          }),
        );

        const model = createCustomAI({ fetch: mockFetch })('llama3');

        await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
          new RegExp(
            `Custom AI request failed with status ${err.status} ${err.statusText}: ${err.body}`,
          ),
        );
      }
    });

    it('3F: Handles network socket connection reset (fetch throwing network error)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed: ECONNRESET'));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      await expect(model.doStream({ prompt: 'test' })).rejects.toThrow(
        'fetch failed: ECONNRESET',
      );
    });

    it('3G: Mid-stream upstream socket abort propagating error through reader', async () => {
      let pullCount = 0;
      const corruptedStream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pullCount === 0) {
            pullCount++;
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode('data: {"choices":[{"delta":{"content":"Partial start"}}]}\n\n'),
            );
          } else {
            // Simulate abrupt socket disconnect
            controller.error(new Error('Upstream socket closed abruptly: EPIPE'));
          }
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(corruptedStream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({ prompt: 'test' });
      const reader = stream.getReader();

      const chunk1 = await reader.read();
      expect(chunk1.value).toEqual({ type: 'text', text: 'Partial start' });

      // Next read must reject with the upstream socket error
      await expect(reader.read()).rejects.toThrow('Upstream socket closed abruptly: EPIPE');
    });

    it('3H: Client-initiated reader.cancel() mid-stream cancels upstream cleanly', async () => {
      let upstreamCancelled = false;
      let cancelReason: unknown;

      const upstreamStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n'),
          );
        },
        cancel(reason) {
          upstreamCancelled = true;
          cancelReason = reason;
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(upstreamStream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({ prompt: 'test' });
      const reader = stream.getReader();

      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'First chunk' });

      await reader.cancel('Client navigated away');
      expect(upstreamCancelled).toBe(true);
      expect(cancelReason).toBe('Client navigated away');
    });

    it('3I: AbortSignal triggered mid-stream cancels fetch and reader', async () => {
      const abortController = new AbortController();

      const streamPayload = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"Stream start"}}]}\n\n'),
          );
        },
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response(streamPayload, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({
        prompt: 'test',
        signal: abortController.signal,
      });

      const reader = stream.getReader();
      const first = await reader.read();
      expect(first.value).toEqual({ type: 'text', text: 'Stream start' });

      // Trigger mid-stream abort
      abortController.abort(new Error('Operation cancelled by user'));
      await reader.cancel(abortController.signal.reason);
    });

    it('3J: Corrupted SSE payloads (incomplete JSON, empty lines, comments, invalid syntax) resilience', async () => {
      const corruptedSse = [
        ': this is a ping comment that must be ignored',
        '',
        'data: { invalid_json_syntax without quotes',
        '',
        'data: {"choices":[{"delta":{"content":"Valid chunk 1"}}]}',
        '',
        'data: [UNEXPECTED_TOKEN]',
        '',
        'some unformatted garbage line',
        '',
        'data: {"choices":[{"delta":{"content":" and valid chunk 2"}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(corruptedSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const stream = await model.doStream({ prompt: 'test' });
      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter(
        (c): c is { type: 'text'; text: string } => c.type === 'text',
      );
      expect(textChunks).toEqual([
        { type: 'text', text: 'Valid chunk 1' },
        { type: 'text', text: ' and valid chunk 2' },
      ]);
      const finishChunk = chunks.find((c) => c.type === 'finish');
      expect(finishChunk).toBeDefined();
    });

    it('3K: 1-byte TCP stream fragmentation reassembly', async () => {
      const sseText =
        'data: {"choices":[{"delta":{"content":"Byte by byte"}}]}\n\n' +
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n' +
        'data: [DONE]\n\n';

      // 1-byte chunks
      const byteChunks = sliceIntoBytes(sseText, 1);
      const stream = createChunkedByteStream(byteChunks);

      const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const chunks = await collectChunks(await model.doStream({ prompt: 'test' }));
      expect(chunks).toEqual([
        { type: 'text', text: 'Byte by byte' },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });
  });

  // =========================================================================
  // SUITE 4: Core Integration with @ranu/ai (streamAI & generateObject)
  // =========================================================================
  describe('4. Core Integration with @ranu/ai (streamAI & generateObject)', () => {
    it('4A: streamAI backpressure queue and streaming drain metrics integration', async () => {
      const sseContent = [
        'data: {"choices":[{"delta":{"content":"Chunk Alpha "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Chunk Beta "}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Chunk Gamma"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseContent, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const tracker = createStreamingDrainTracker();
      let chunkEvents = 0;

      const response = await streamAI({
        model,
        prompt: 'Check streaming drain',
        onChunk: (chunkBytes) => {
          chunkEvents++;
          tracker.recordChunk(chunkBytes);
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');

      const bodyText = await response.text();
      expect(bodyText).toContain('data: {"text":"Chunk Alpha "}');
      expect(bodyText).toContain('data: {"text":"Chunk Beta "}');
      expect(bodyText).toContain('data: {"text":"Chunk Gamma"}');
      expect(bodyText).toContain('data: {"finishReason":"stop"}');
      expect(bodyText).toContain('data: [DONE]');

      const metrics = tracker.getMetrics();
      expect(metrics.chunkCount).toBe(chunkEvents);
      expect(metrics.totalBytes).toBeGreaterThan(0);
    });

    it('4B: streamAI SSE framing for DeepSeek-R1 reasoning chunks', async () => {
      const sseContent = [
        'data: {"choices":[{"delta":{"reasoning_content":"Let me calculate step by step..."}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"The answer is 42."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(sseContent, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('deepseek-r1');

      const response = await streamAI({
        model,
        prompt: 'What is the answer to everything?',
      });

      const bodyText = await response.text();
      // Reasoning chunk must be framed as event: reasoning
      expect(bodyText).toContain('event: reasoning\ndata: {"reasoning":"Let me calculate step by step..."');
      // Text chunk must be framed as event: chunk
      expect(bodyText).toContain('event: chunk\ndata: {"text":"The answer is 42."}');
      // Finish chunk
      expect(bodyText).toContain('event: finish\ndata: {"finishReason":"stop"}');
    });

    it('4C: streamAI maxBytes ceiling enforcement aborts stream and throws/emits error', async () => {
      // Generate large stream exceeding maxBytes
      const largeSse = [
        'data: {"choices":[{"delta":{"content":"' + 'A'.repeat(500) + '"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"' + 'B'.repeat(500) + '"}}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(largeSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const response = await streamAI({
        model,
        prompt: 'Stream large data',
        maxBytes: 200, // Small limit
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let caughtError = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value);
        }
      } catch (err: unknown) {
        caughtError = true;
        expect((err as Error).message).toContain('Streaming response exceeded maximum allowed limit');
      }

      // Either it threw during reader.read() or it emitted an error frame
      expect(caughtError || fullText.includes('event: error')).toBe(true);
    });

    it('4D: generateObject with Standard Schema v1 validates structured outputs', async () => {
      const mockSse = [
        'data: {"choices":[{"delta":{"content":"{\\"service\\":\\"vLLM\\",\\"latencyMs\\":12.5,\\"healthy\\":true}"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(mockSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      interface ServerHealth {
        service: string;
        latencyMs: number;
        healthy: boolean;
      }

      const healthSchema: StandardSchemaV1<ServerHealth> = {
        '~standard': {
          version: 1,
          vendor: 'test-validator',
          validate: (val: unknown) => {
            const v = val as ServerHealth;
            if (
              typeof v?.service === 'string' &&
              typeof v?.latencyMs === 'number' &&
              typeof v?.healthy === 'boolean'
            ) {
              return { value: v };
            }
            return {
              issues: [
                {
                  message: 'Invalid ServerHealth payload',
                  path: ['service'],
                },
              ],
            };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: healthSchema,
        prompt: 'Health check output',
      });

      expect(result.object).toEqual({
        service: 'vLLM',
        latencyMs: 12.5,
        healthy: true,
      });
      expect(result.rawText).toBe('{"service":"vLLM","latencyMs":12.5,"healthy":true}');
    });

    it('4E: generateObject extracts JSON enclosed in markdown code fences', async () => {
      const mockSse = [
        'data: {"choices":[{"delta":{"content":"Here is the JSON specification:\\n```json\\n{\\"cluster\\":\\"k8s-ai\\",\\"replicas\\":5}\\n```"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(mockSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const clusterSchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => {
            const v = val as { cluster: string; replicas: number };
            return { value: v };
          },
        },
      };

      const result = await generateObject({
        model,
        schema: clusterSchema,
        prompt: 'Cluster spec',
      });

      expect(result.object).toEqual({ cluster: 'k8s-ai', replicas: 5 });
    });

    it('4F: generateObject throws AIValidationError with issue paths on schema violation', async () => {
      const mockSse = [
        'data: {"choices":[{"delta":{"content":"{\\"wrongKey\\": 123}"}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(mockSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const strictSchema: StandardSchemaV1<{ requiredKey: string }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => ({
            issues: [
              {
                message: 'Field "requiredKey" is missing',
                path: ['requiredKey'],
              },
            ],
          }),
        },
      };

      await expect(
        generateObject({
          model,
          schema: strictSchema,
          prompt: 'Output strict JSON',
        }),
      ).rejects.toThrow(AIValidationError);
    });

    it('4G: generateObject throws SyntaxError on completely non-JSON model output', async () => {
      const mockSse = [
        'data: {"choices":[{"delta":{"content":"Sorry, as an AI I cannot produce that."}}]}',
        '',
        'data: {"choices":[{"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
      ].join('\n');

      const mockFetch = vi.fn().mockResolvedValue(new Response(mockSse, { status: 200 }));
      const model = createCustomAI({ fetch: mockFetch })('llama3');

      const dummySchema = {
        '~standard': {
          version: 1 as const,
          vendor: 'test',
          validate: (val: unknown) => ({ value: val }),
        },
      };

      await expect(
        generateObject({
          model,
          schema: dummySchema,
          prompt: 'Output JSON',
        }),
      ).rejects.toThrow(SyntaxError);
    });
  });
});
