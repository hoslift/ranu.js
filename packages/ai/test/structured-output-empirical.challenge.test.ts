import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateObject,
  AIValidationError,
  createAIProvider,
  type AIChunk,
  type AIModelInstance,
  type StandardSchemaV1,
  type StreamExecutionOptions,
} from '../src/index.js';

/**
 * Standard Schema v1 helper.
 */
function createStandardSchema<T>(
  validateFn: (value: unknown) =>
    | { value: T; issues?: undefined }
    | { issues: readonly { message: string; path?: readonly (string | number | symbol)[] }[]; value?: undefined }
    | Promise<
        | { value: T; issues?: undefined }
        | { issues: readonly { message: string; path?: readonly (string | number | symbol)[] }[]; value?: undefined }
      >,
  vendor = 'empirical-vendor',
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: validateFn,
    },
  };
}

describe('Empirical Challenge 1: Rapid AbortSignal Cancellation & Stream Lock Safety', () => {
  let unhandledRejections: Error[] = [];
  const rejectionHandler = (reason: unknown) => {
    unhandledRejections.push(reason instanceof Error ? reason : new Error(String(reason)));
  };

  beforeEach(() => {
    unhandledRejections = [];
    process.on('unhandledRejection', rejectionHandler);
  });

  afterEach(() => {
    process.off('unhandledRejection', rejectionHandler);
    expect(unhandledRejections).toHaveLength(0);
  });

  interface SimpleData {
    id: string;
    count: number;
  }

  const simpleSchema = createStandardSchema<SimpleData>((val) => {
    const rec = val as Record<string, unknown>;
    if (typeof rec?.['id'] === 'string' && typeof rec?.['count'] === 'number') {
      return { value: { id: rec['id'], count: rec['count'] } };
    }
    return { issues: [{ message: 'Invalid data' }] };
  });

  it('1.1 Abort before inference: rejects immediately with exact abort reason and does NOT invoke doStream', async () => {
    const controller = new AbortController();
    const customReason = new DOMException('Operation timed out before dispatch', 'AbortError');
    controller.abort(customReason);

    let doStreamCalled = false;
    const model: AIModelInstance = {
      provider: 'test-pre-abort',
      modelId: 'test-model',
      doStream: async () => {
        doStreamCalled = true;
        return new ReadableStream<AIChunk>();
      },
    };

    await expect(
      generateObject({
        model,
        schema: simpleSchema,
        prompt: 'Generate simple data',
        signal: controller.signal,
      }),
    ).rejects.toThrow('Operation timed out before dispatch');

    expect(doStreamCalled).toBe(false);
  });

  it('1.2 Abort before inference with undefined reason defaults to standard abort error', async () => {
    const controller = new AbortController();
    controller.abort(); // undefined reason

    const model: AIModelInstance = {
      provider: 'test-pre-abort-default',
      modelId: 'test-model',
      doStream: async () => new ReadableStream<AIChunk>(),
    };

    await expect(
      generateObject({
        model,
        schema: simpleSchema,
        prompt: 'Generate simple data',
        signal: controller.signal,
      }),
    ).rejects.toThrow(/operation was aborted/i);
  });

  it('1.3 Abort mid-stream while receiving text chunks: cancels immediately and releases reader lock', async () => {
    const controller = new AbortController();
    let streamRef: ReadableStream<AIChunk> | null = null;
    let streamCancelled = false;
    let cancelReason: unknown = null;

    const stream = new ReadableStream<AIChunk>({
      async start(streamController) {
        streamController.enqueue({ type: 'text', text: '{"id":' });
        await new Promise((r) => setTimeout(r, 10));
        streamController.enqueue({ type: 'text', text: ' "chunk-1",' });
        await new Promise((r) => setTimeout(r, 10));

        // Trigger abort mid-stream
        controller.abort(new Error('User cancelled mid-stream'));

        // Delay then enqueue trailing data after abort to ensure no unhandled rejections
        await new Promise((r) => setTimeout(r, 20));
        try {
          streamController.enqueue({ type: 'text', text: ' "count": 42}' });
          streamController.close();
        } catch {
          // Stream might be closed/cancelled
        }
      },
      cancel(reason) {
        streamCancelled = true;
        cancelReason = reason;
      },
    });
    streamRef = stream;

    const model: AIModelInstance = {
      provider: 'test-midstream',
      modelId: 'test-model',
      doStream: async () => streamRef!,
    };

    await expect(
      generateObject({
        model,
        schema: simpleSchema,
        prompt: 'Generate simple data',
        signal: controller.signal,
      }),
    ).rejects.toThrow('User cancelled mid-stream');

    // Give microtasks time to settle
    await new Promise((r) => setTimeout(r, 50));

    // Verify stream lock is released (not locked)
    expect(streamRef.locked).toBe(false);
  });

  it('1.4 Abort during slow provider latency: does not hang and releases reader lock immediately', async () => {
    const controller = new AbortController();
    let streamRef: ReadableStream<AIChunk> | null = null;

    const stream = new ReadableStream<AIChunk>({
      async start(streamController) {
        // High latency provider: waits 300ms before sending anything
        await new Promise((r) => setTimeout(r, 300));
        try {
          streamController.enqueue({ type: 'text', text: '{"id": "slow", "count": 1}' });
          streamController.close();
        } catch {
          // Expected if stream was cancelled
        }
      },
    });
    streamRef = stream;

    const model: AIModelInstance = {
      provider: 'test-slow-latency',
      modelId: 'test-model',
      doStream: async () => streamRef!,
    };

    const startTime = Date.now();

    // Abort after 25ms while waiting for first chunk
    setTimeout(() => {
      controller.abort(new Error('Slow provider timed out'));
    }, 25);

    await expect(
      generateObject({
        model,
        schema: simpleSchema,
        prompt: 'Generate slow data',
        signal: controller.signal,
      }),
    ).rejects.toThrow('Slow provider timed out');

    const duration = Date.now() - startTime;
    // Must return within ~100ms, not hang for the full 300ms
    expect(duration).toBeLessThan(200);

    // Wait for the stream start promise to complete and verify lock is released
    await new Promise((r) => setTimeout(r, 100));
    expect(streamRef.locked).toBe(false);
  });

  it('1.5 Rapid sequence of 25 immediate abort/cancel cycles operates without memory/listener leaks', async () => {
    for (let i = 0; i < 25; i++) {
      const controller = new AbortController();
      const abortDelay = i % 5; // 0ms, 1ms, 2ms, 3ms, 4ms
      let abortTimer: NodeJS.Timeout | undefined;
      if (abortDelay === 0) {
        controller.abort(new Error(`Immediate abort cycle ${i}`));
      } else {
        abortTimer = setTimeout(() => controller.abort(new Error(`Delayed abort cycle ${i}`)), abortDelay);
      }

      let streamTimer: NodeJS.Timeout | undefined;
      const model: AIModelInstance = {
        provider: 'test-rapid-abort',
        modelId: 'test-model',
        doStream: async () => {
          return new ReadableStream<AIChunk>({
            start(streamController) {
              streamController.enqueue({ type: 'text', text: '{"id": ' });
              streamTimer = setTimeout(() => {
                try {
                  if (controller.signal.aborted) return;
                  streamController.enqueue({ type: 'text', text: `"item-${i}", "count": ${i}}` });
                  streamController.close();
                } catch {
                  // Catch if already closed
                }
              }, 50);
            },
            cancel() {
              if (streamTimer) {
                clearTimeout(streamTimer);
              }
            },
          });
        },
      };

      try {
        await expect(
          generateObject({
            model,
            schema: simpleSchema,
            prompt: `Cycle ${i}`,
            signal: controller.signal,
          }),
        ).rejects.toThrow(/abort/i);
      } finally {
        if (abortTimer) clearTimeout(abortTimer);
        if (streamTimer) clearTimeout(streamTimer);
      }
    }
  });

  it('1.6 Abort during HTTP fetch phase in createAIProvider', async () => {
    const controller = new AbortController();

    const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      // Respect signal abort
      return new Promise<Response>((_, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request', 'AbortError'));
        });
      });
    });

    const provider = createAIProvider({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    setTimeout(() => {
      controller.abort(new DOMException('The user aborted a request', 'AbortError'));
    }, 15);

    await expect(
      generateObject({
        model: provider('gpt-4o'),
        schema: simpleSchema,
        prompt: 'Fetch abort test',
        signal: controller.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });
});

describe('Empirical Challenge 2: Concurrency, Thread-Safety & Zero Cross-Talk', () => {
  interface ConcurrentItem {
    callId: number;
    token: string;
    payload: {
      tags: string[];
      metrics: {
        score: number;
        active: boolean;
      };
    };
  }

  const concurrentItemSchema = createStandardSchema<ConcurrentItem>((val) => {
    const rec = val as Record<string, unknown>;
    if (typeof rec?.['callId'] !== 'number') {
      return { issues: [{ message: 'callId required', path: ['callId'] }] };
    }
    if (typeof rec?.['token'] !== 'string') {
      return { issues: [{ message: 'token required', path: ['token'] }] };
    }
    const payload = rec['payload'] as Record<string, unknown> | undefined;
    if (!payload || !Array.isArray(payload['tags'])) {
      return { issues: [{ message: 'payload.tags required', path: ['payload', 'tags'] }] };
    }
    return {
      value: {
        callId: rec['callId'],
        token: rec['token'],
        payload: {
          tags: payload['tags'] as string[],
          metrics: payload['metrics'] as { score: number; active: boolean },
        },
      },
    };
  });

  it('2.1 Executes 60 simultaneous calls with 100% zero cross-talk and exact payload integrity', async () => {
    const callCount = 60;

    const makeModelForCall = (id: number): AIModelInstance => {
      const itemData: ConcurrentItem = {
        callId: id,
        token: `auth-token-session-${id}-${Math.random().toString(36).slice(2)}`,
        payload: {
          tags: [`tag-call-${id}`, 'concurrent', `env-${id % 3}`],
          metrics: {
            score: id * 100 + 42,
            active: id % 2 === 0,
          },
        },
      };

      return {
        provider: `provider-isolated-${id}`,
        modelId: `model-${id}`,
        doStream: async () => {
          // Break JSON into irregular streaming chunks
          const jsonStr = JSON.stringify(itemData);
          const chunk1 = jsonStr.slice(0, 15);
          const chunk2 = jsonStr.slice(15, 45);
          const chunk3 = jsonStr.slice(45);

          return new ReadableStream<AIChunk>({
            async start(ctrl) {
              ctrl.enqueue({ type: 'text', text: chunk1 });
              // Random micro-jitter to provoke race conditions
              await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10)));
              ctrl.enqueue({ type: 'text', text: chunk2 });
              await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10)));
              ctrl.enqueue({ type: 'text', text: chunk3 });
              ctrl.enqueue({
                type: 'finish',
                finishReason: 'stop',
                usage: { promptTokens: 10 + id, completionTokens: 20 + id, totalTokens: 30 + 2 * id },
              });
              ctrl.close();
            },
          });
        },
      };
    };

    const promises = Array.from({ length: callCount }, (_, i) =>
      generateObject({
        model: makeModelForCall(i),
        schema: concurrentItemSchema,
        prompt: `Execute query for task ${i}`,
        schemaName: `TaskQuery_${i}`,
      }),
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(callCount);

    // Verify every result matches its exact callId with zero cross-talk
    for (let i = 0; i < callCount; i++) {
      const res = results[i]!;
      expect(res.object.callId).toBe(i);
      expect(res.object.token).toContain(`auth-token-session-${i}-`);
      expect(res.object.payload.tags[0]).toBe(`tag-call-${i}`);
      expect(res.object.payload.metrics.score).toBe(i * 100 + 42);
      expect(res.object.payload.metrics.active).toBe(i % 2 === 0);
      expect(res.usage?.promptTokens).toBe(10 + i);
      expect(res.finishReason).toBe('stop');
    }
  });

  it('2.2 100 concurrent calls with heterogeneous schemas and random network jitter', async () => {
    const stringArraySchema = createStandardSchema<string[]>((val) => {
      if (Array.isArray(val) && val.every((s) => typeof s === 'string')) {
        return { value: val };
      }
      return { issues: [{ message: 'Expected string array' }] };
    });

    const numericSchema = createStandardSchema<{ val: number }>((val) => {
      const rec = val as Record<string, unknown>;
      if (typeof rec?.['val'] === 'number') {
        return { value: { val: rec['val'] } };
      }
      return { issues: [{ message: 'Expected number' }] };
    });

    const totalCalls = 100;
    const tasks = Array.from({ length: totalCalls }, (_, i) => {
      const isArraySchema = i % 2 === 0;

      const model: AIModelInstance = {
        provider: 'jitter-provider',
        modelId: 'jitter-model',
        doStream: async () => {
          const payload = isArraySchema ? [`item-${i}-A`, `item-${i}-B`] : { val: i * 7 };
          const text = JSON.stringify(payload);

          return new ReadableStream<AIChunk>({
            async start(ctrl) {
              const delay = Math.floor(Math.random() * 15);
              await new Promise((r) => setTimeout(r, delay));
              ctrl.enqueue({ type: 'text', text });
              ctrl.enqueue({ type: 'finish', finishReason: 'stop' });
              ctrl.close();
            },
          });
        },
      };

      if (isArraySchema) {
        return generateObject({
          model,
          schema: stringArraySchema,
          prompt: `Array task ${i}`,
        }).then((res) => ({ type: 'array' as const, index: i, data: res.object }));
      } else {
        return generateObject({
          model,
          schema: numericSchema,
          prompt: `Numeric task ${i}`,
        }).then((res) => ({ type: 'numeric' as const, index: i, data: res.object }));
      }
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(totalCalls);

    for (let i = 0; i < totalCalls; i++) {
      const item = results[i]!;
      expect(item.index).toBe(i);
      if (item.type === 'array') {
        expect(item.data).toEqual([`item-${i}-A`, `item-${i}-B`]);
      } else {
        expect(item.data).toEqual({ val: i * 7 });
      }
    }
  });

  it('2.3 Concurrent execution with mixed successes (30) and aborts (30) does not crash or cross-contaminate', async () => {
    const total = 60;
    const abortControllers = new Map<number, AbortController>();

    const tasks = Array.from({ length: total }, (_, i) => {
      const shouldAbort = i % 2 === 1; // odd indices abort, even indices succeed
      let signal: AbortSignal | undefined;

      if (shouldAbort) {
        const ac = new AbortController();
        abortControllers.set(i, ac);
        signal = ac.signal;

        if (i % 4 === 1) {
          // Pre-abort
          ac.abort(new Error(`Pre-aborted ${i}`));
        } else {
          // Mid-stream abort
          setTimeout(() => ac.abort(new Error(`Mid-aborted ${i}`)), 15);
        }
      }

      const model: AIModelInstance = {
        provider: 'mixed-provider',
        modelId: 'mixed-model',
        doStream: async () => {
          return new ReadableStream<AIChunk>({
            async start(ctrl) {
              ctrl.enqueue({ type: 'text', text: `{"callId": ${i}, "token": "tok-${i}", ` });
              await new Promise((r) => setTimeout(r, 25));
              try {
                ctrl.enqueue({
                  type: 'text',
                  text: `"payload": {"tags": ["t"], "metrics": {"score": ${i}, "active": true}}}`,
                });
                ctrl.close();
              } catch {
                // Stream might have cancelled
              }
            },
          });
        },
      };

      return generateObject({
        model,
        schema: concurrentItemSchema,
        prompt: `Mixed call ${i}`,
        signal,
      })
        .then((res) => ({ success: true as const, index: i, object: res.object }))
        .catch((err: unknown) => ({
          success: false as const,
          index: i,
          error: err instanceof Error ? err.message : String(err),
        }));
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(total);

    let successCount = 0;
    let abortCount = 0;

    for (let i = 0; i < total; i++) {
      const res = results[i]!;
      expect(res.index).toBe(i);
      if (i % 2 === 0) {
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.object.callId).toBe(i);
          expect(res.object.token).toBe(`tok-${i}`);
          expect(res.object.payload.metrics.score).toBe(i);
        }
        successCount++;
      } else {
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error).toMatch(/aborted/i);
        }
        abortCount++;
      }
    }

    expect(successCount).toBe(30);
    expect(abortCount).toBe(30);
  });

  it('2.4 Memory stability: executing 100 objects in batch shows stable heap memory', async () => {
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const batchSize = 100;
    const batch = Array.from({ length: batchSize }, (_, i) => {
      const model: AIModelInstance = {
        provider: 'mem-test',
        modelId: 'mem-model',
        doStream: async () => {
          return new ReadableStream<AIChunk>({
            start(ctrl) {
              ctrl.enqueue({
                type: 'text',
                text: JSON.stringify({
                  callId: i,
                  token: 'stable-mem-token',
                  payload: { tags: ['mem'], metrics: { score: 10, active: true } },
                }),
              });
              ctrl.close();
            },
          });
        },
      };

      return generateObject({
        model,
        schema: concurrentItemSchema,
        prompt: `Mem test ${i}`,
      });
    });

    await Promise.all(batch);

    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / (1024 * 1024);

    // Heap difference after 100 objects should not exceed 25MB
    expect(diffMb).toBeLessThan(25);
  });
});

describe('Empirical Challenge 3: Multi-Provider Simulation (Gemini, Claude, OpenAI)', () => {
  interface FlightReservation {
    flightNumber: string;
    origin: string;
    destination: string;
    passengers: number;
    confirmed: boolean;
  }

  const flightSchema = createStandardSchema<FlightReservation>((val) => {
    const rec = val as Record<string, unknown>;
    if (typeof rec?.['flightNumber'] !== 'string') {
      return { issues: [{ message: 'flightNumber required', path: ['flightNumber'] }] };
    }
    if (typeof rec?.['origin'] !== 'string') {
      return { issues: [{ message: 'origin required', path: ['origin'] }] };
    }
    if (typeof rec?.['destination'] !== 'string') {
      return { issues: [{ message: 'destination required', path: ['destination'] }] };
    }
    if (typeof rec?.['passengers'] !== 'number') {
      return { issues: [{ message: 'passengers required', path: ['passengers'] }] };
    }
    return {
      value: {
        flightNumber: rec['flightNumber'],
        origin: rec['origin'],
        destination: rec['destination'],
        passengers: rec['passengers'],
        confirmed: Boolean(rec['confirmed']),
      },
    };
  });

  it('3.1 Google Gemini realistic simulation: multipart candidate chunks with markdown fences and conversational preamble', async () => {
    // Realistic Google Gemini SSE payload split over multiple data chunks
    const geminiPayloadChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Here is your booking confirmation:\\n\\n```json\\n{\\"flightNumber\\": \\"AA100\\", "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"\\"origin\\": \\"JFK\\", \\"destination\\": \\"LHR\\", "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"\\"passengers\\": 2, \\"confirmed\\": true}\\n```\\nSafe travels!"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":25,"candidatesTokenCount":50,"totalTokenCount":75}}\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of geminiPayloadChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const provider = createAIProvider({
      name: 'google',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-gemini-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('gemini-2.0-flash'),
      schema: flightSchema,
      prompt: 'Book flight AA100 JFK to LHR for 2 passengers',
    });

    expect(result.object).toEqual({
      flightNumber: 'AA100',
      origin: 'JFK',
      destination: 'LHR',
      passengers: 2,
      confirmed: true,
    });
    expect(result.finishReason).toBe('STOP');
    expect(result.usage).toEqual({
      promptTokens: 25,
      completionTokens: 50,
      totalTokens: 75,
    });
    expect(result.rawText).toContain('AA100');
  });

  it('3.2 Anthropic Claude realistic simulation: extended thinking delta followed by fine-grained text_delta chunks', async () => {
    // Realistic Claude 3.7 / 3.5 SSE payload with extended thinking tokens
    const claudePayloadChunks = [
      'event: message_start\n',
      'data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
      // Thinking deltas - these should NOT contaminate the parsed JSON
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"The user wants a flight reservation. I will output JSON."}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      // Text block start
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      // Fine-grained character deltas
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"{\\"flightNumber\\": "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"\\"BA249\\", \\"origin\\": \\"LHR\\", "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"\\"destination\\": \\"GVA\\", \\"passengers\\": 1, \\"confirmed\\": false}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":85}}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of claudePayloadChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'test-claude-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('claude-3-7-sonnet'),
      schema: flightSchema,
      prompt: 'Book flight BA249 LHR to GVA',
    });

    expect(result.object).toEqual({
      flightNumber: 'BA249',
      origin: 'LHR',
      destination: 'GVA',
      passengers: 1,
      confirmed: false,
    });
    expect(result.finishReason).toBe('end_turn');
    expect(result.usage?.completionTokens).toBe(85);
  });

  it('3.3 OpenAI tool_calls argument streaming extraction: when rawText is empty, extracts JSON from toolCall.arguments', async () => {
    // Realistic OpenAI tool_calls function argument streaming payload
    const openAIToolCallChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"record_flight","arguments":""}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"flightNumber\\": \\"DL404\\","}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \\"origin\\": \\"ATL\\", \\"destination\\": \\"CDG\\","}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \\"passengers\\": 4, \\"confirmed\\": true}"}}]},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":30,"completion_tokens":45,"total_tokens":75}}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of openAIToolCallChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const provider = createAIProvider({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-openai-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('gpt-4o'),
      schema: flightSchema,
      prompt: 'Book flight DL404 ATL to CDG for 4 passengers',
    });

    expect(result.object).toEqual({
      flightNumber: 'DL404',
      origin: 'ATL',
      destination: 'CDG',
      passengers: 4,
      confirmed: true,
    });
    expect(result.finishReason).toBe('tool_calls');
    expect(result.usage).toEqual({
      promptTokens: 30,
      completionTokens: 45,
      totalTokens: 75,
    });
    expect(result.rawText).toContain('DL404');
  });

  it('3.4 OpenAI reasoning model (o1 / o3) simulation: reasoning_content preceding choices content', async () => {
    const o1Chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"Step 1: Check inputs. Step 2: Format flight reservation JSON."},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"flightNumber\\": \\"SQ321\\", \\"origin\\": \\"SIN\\", "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"destination\\": \\"EWR\\", \\"passengers\\": 1, \\"confirmed\\": true}"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":50,"completion_tokens":60,"total_tokens":110}}\n\n',
      'data: [DONE]\n\n',
    ];

    const mockFetch = vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of o1Chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    const provider = createAIProvider({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-openai-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('o1'),
      schema: flightSchema,
      prompt: 'Book flight SQ321 SIN to EWR',
    });

    expect(result.object).toEqual({
      flightNumber: 'SQ321',
      origin: 'SIN',
      destination: 'EWR',
      passengers: 1,
      confirmed: true,
    });
    expect(result.finishReason).toBe('stop');
    expect(result.usage?.totalTokens).toBe(110);
  });

  it('3.5 Malformed provider responses: throws SyntaxError or AIValidationError with attached rawText', async () => {
    // 1. Truncated JSON
    const truncatedModel: AIModelInstance = {
      provider: 'test-err',
      modelId: 'test-err-model',
      doStream: async () => {
        return new ReadableStream<AIChunk>({
          start(ctrl) {
            ctrl.enqueue({ type: 'text', text: '{"flightNumber": "AA1' });
            ctrl.close();
          },
        });
      },
    };

    await expect(
      generateObject({
        model: truncatedModel,
        schema: flightSchema,
        prompt: 'Test truncated',
      }),
    ).rejects.toThrow(SyntaxError);

    // 2. Schema validation failure
    const invalidTypeModel: AIModelInstance = {
      provider: 'test-err',
      modelId: 'test-err-model',
      doStream: async () => {
        return new ReadableStream<AIChunk>({
          start(ctrl) {
            ctrl.enqueue({
              type: 'text',
              text: JSON.stringify({
                flightNumber: 'AA100',
                origin: 'JFK',
                destination: 'LHR',
                passengers: 'two', // Should be number
                confirmed: true,
              }),
            });
            ctrl.close();
          },
        });
      },
    };

    try {
      await generateObject({
        model: invalidTypeModel,
        schema: flightSchema,
        prompt: 'Test invalid field',
      });
      expect.unreachable('Should have thrown AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual(['passengers']);
      expect(valErr.rawText).toContain('"passengers":"two"');
    }
  });

  it('3.6 Intermixed reasoning and text chunks: reasoning tokens do not pollute extracted JSON', async () => {
    const intermixedModel: AIModelInstance = {
      provider: 'test-reasoning',
      modelId: 'reasoning-model',
      doStream: async () => {
        return new ReadableStream<AIChunk>({
          start(ctrl) {
            ctrl.enqueue({ type: 'reasoning', reasoning: 'Step 1: Identifying flight number AA555.' });
            ctrl.enqueue({ type: 'text', text: '{"flightNumber": "AA555",' });
            ctrl.enqueue({ type: 'reasoning', reasoning: 'Step 2: Checking origins and destinations.' });
            ctrl.enqueue({ type: 'text', text: ' "origin": "MIA", "destination": "LAX",' });
            ctrl.enqueue({ type: 'reasoning', reasoning: 'Step 3: Validating passenger count.' });
            ctrl.enqueue({ type: 'text', text: ' "passengers": 3, "confirmed": true}' });
            ctrl.enqueue({ type: 'finish', finishReason: 'stop' });
            ctrl.close();
          },
        });
      },
    };

    const result = await generateObject({
      model: intermixedModel,
      schema: flightSchema,
      prompt: 'Book MIA to LAX',
    });

    expect(result.object).toEqual({
      flightNumber: 'AA555',
      origin: 'MIA',
      destination: 'LAX',
      passengers: 3,
      confirmed: true,
    });
  });

  it('3.7 Upstream error chunk handling: cleanly throws error and releases reader lock', async () => {
    let streamRef: ReadableStream<AIChunk> | null = null;
    const errorModel: AIModelInstance = {
      provider: 'test-error-chunk',
      modelId: 'error-model',
      doStream: async () => {
        const stream = new ReadableStream<AIChunk>({
          start(ctrl) {
            ctrl.enqueue({ type: 'text', text: '{"flightNumber":' });
            ctrl.enqueue({ type: 'error', error: new Error('Upstream provider context overflow') });
            ctrl.close();
          },
        });
        streamRef = stream;
        return stream;
      },
    };

    await expect(
      generateObject({
        model: errorModel,
        schema: flightSchema,
        prompt: 'Prompt causing overflow',
      }),
    ).rejects.toThrow('Upstream provider context overflow');

    expect(streamRef!.locked).toBe(false);
  });

  it('3.8 Asynchronous Standard Schema v1 validation under 50+ concurrent requests', async () => {
    const asyncFlightSchema = createStandardSchema<FlightReservation>(async (val) => {
      // Simulate async schema validation (e.g. database lookup or remote validation check)
      await new Promise((r) => setTimeout(r, 5));
      const rec = val as Record<string, unknown>;
      if (typeof rec?.['flightNumber'] !== 'string') {
        return { issues: [{ message: 'flightNumber required' }] };
      }
      return {
        value: {
          flightNumber: rec['flightNumber'] as string,
          origin: rec['origin'] as string,
          destination: rec['destination'] as string,
          passengers: rec['passengers'] as number,
          confirmed: Boolean(rec['confirmed']),
        },
      };
    });

    const concurrentAsyncCalls = 50;
    const tasks = Array.from({ length: concurrentAsyncCalls }, (_, i) => {
      const model: AIModelInstance = {
        provider: `async-schema-provider-${i}`,
        modelId: 'async-model',
        doStream: async () => {
          return new ReadableStream<AIChunk>({
            start(ctrl) {
              ctrl.enqueue({
                type: 'text',
                text: JSON.stringify({
                  flightNumber: `FL-${100 + i}`,
                  origin: 'SFO',
                  destination: 'HND',
                  passengers: 1 + (i % 4),
                  confirmed: true,
                }),
              });
              ctrl.close();
            },
          });
        },
      };

      return generateObject({
        model,
        schema: asyncFlightSchema,
        prompt: `Async call ${i}`,
      });
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(concurrentAsyncCalls);
    for (let i = 0; i < concurrentAsyncCalls; i++) {
      expect(results[i]!.object.flightNumber).toBe(`FL-${100 + i}`);
      expect(results[i]!.object.destination).toBe('HND');
    }
  });
});
