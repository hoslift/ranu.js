import { describe, it, expect } from 'vitest';
import {
  streamAI,
  createBoundedStream,
  pipeWithBackpressure,
  type AIChunk,
  type AIModelInstance,
  type StreamExecutionOptions,
} from '../src/index.js';

interface ParsedSSEEvent {
  event?: string;
  data: string;
}

function parseSSEFrames(raw: string): ParsedSSEEvent[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const events: ParsedSSEEvent[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    let eventName: string | undefined;
    let dataPayload = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataPayload = line.slice(6);
      } else if (line === 'data:[DONE]' || line === 'data: [DONE]') {
        dataPayload = '[DONE]';
      }
    }

    if (eventName || dataPayload) {
      events.push({ event: eventName, data: dataPayload });
    }
  }

  return events;
}

async function readAllChunks(response: Response): Promise<{ rawText: string; events: ParsedSSEEvent[] }> {
  const reader = response.body?.getReader();
  if (!reader) return { rawText: '', events: [] };

  const decoder = new TextDecoder();
  let rawText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      rawText += decoder.decode(value, { stream: true });
    }
  }
  rawText += decoder.decode();
  return { rawText, events: parseSSEFrames(rawText) };
}

describe('Empirical Challenge: Stream Abort Resilience & Error Handling (@ranu/ai)', () => {
  // --------------------------------------------------------------------------
  // Suite 1: Rapid Consumer Aborts
  // --------------------------------------------------------------------------
  describe('1. Rapid Consumer Aborts', () => {
    it('1.1: abort pre-flight before streamAI is called (already-aborted signal)', async () => {
      const abortController = new AbortController();
      const preAbortError = new Error('Pre-flight abort signal already triggered');
      abortController.abort(preAbortError);

      let doStreamCalled = false;
      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-1',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          doStreamCalled = true;
          return new ReadableStream<AIChunk>();
        },
      };

      await expect(
        streamAI({ model, prompt: 'Hello', signal: abortController.signal })
      ).rejects.toThrow('Pre-flight abort signal already triggered');

      expect(doStreamCalled).toBe(false);
    });

    it('1.2: abort pre-flight after streamAI returns response, before response.body is touched', async () => {
      const abortController = new AbortController();
      let upstreamCancelled = false;
      let upstreamCancelReason: unknown = null;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-2',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              controller.enqueue({ type: 'text', text: 'Chunk 1' });
            },
            cancel(reason) {
              upstreamCancelled = true;
              upstreamCancelReason = reason;
            },
          });
        },
      };

      const response = await streamAI({
        model,
        prompt: 'Pre-flight untouched test',
        signal: abortController.signal,
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.body).not.toBeNull();

      // Abort BEFORE touching response.body
      const abortErr = new Error('Client abort before touching body');
      abortController.abort(abortErr);

      // Verify upstream stream cancel hook is executed immediately
      expect(upstreamCancelled).toBe(true);
      expect(upstreamCancelReason).toBe(abortErr);

      // Now attempting to read response.body must immediately reject with the abort reason
      const reader = response.body!.getReader();
      await expect(reader.read()).rejects.toThrow('Client abort before touching body');
    });

    it('1.3: abort immediately after receiving first chunk', async () => {
      const abortController = new AbortController();
      let upstreamCancelled = false;
      let upstreamCancelReason: unknown = null;
      let chunksSupplied = 0;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-3',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              chunksSupplied++;
              if (chunksSupplied === 1) {
                controller.enqueue({ type: 'text', text: 'First chunk received.' });
              } else if (chunksSupplied === 2) {
                controller.enqueue({ type: 'text', text: 'Second chunk.' });
              } else {
                controller.close();
              }
            },
            cancel(reason) {
              upstreamCancelled = true;
              upstreamCancelReason = reason;
            },
          });
        },
      };

      const response = await streamAI({
        model,
        prompt: 'Immediate post-first-chunk abort',
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value).toBeDefined();

      const decoded = new TextDecoder().decode(first.value);
      expect(decoded).toContain('First chunk received.');

      // Abort immediately after receiving first chunk
      const abortErr = new Error('Immediate abort after chunk 1');
      abortController.abort(abortErr);

      // Upstream provider cancel hook must be called immediately
      expect(upstreamCancelled).toBe(true);
      expect(upstreamCancelReason).toBe(abortErr);

      // Subsequent read must reject with abort error
      await expect(reader.read()).rejects.toThrow('Immediate abort after chunk 1');
    });

    it('1.4: abort during backpressure pause when queue is full', async () => {
      const abortController = new AbortController();
      let upstreamCancelled = false;
      let upstreamCancelReason: unknown = null;
      let upstreamPullCount = 0;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-4',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              upstreamPullCount++;
              // Emit large chunk (>300 bytes) to saturate highWaterMark
              controller.enqueue({
                type: 'text',
                text: `Chunk-${upstreamPullCount}: `.repeat(20),
              });
            },
            cancel(reason) {
              upstreamCancelled = true;
              upstreamCancelReason = reason;
            },
          });
        },
      };

      // Set highWaterMark to 250 bytes so 1 chunk saturates the downstream queue
      const response = await streamAI({
        model,
        prompt: 'Backpressure abort test',
        signal: abortController.signal,
        highWaterMark: 250,
      });

      // Allow initial pull to fill the queue and enter backpressure pause
      await new Promise((r) => setTimeout(r, 60));
      const pullsDuringPause = upstreamPullCount;
      expect(pullsDuringPause).toBeGreaterThanOrEqual(1);

      // Wait another tick to verify upstream pull is completely halted by backpressure
      await new Promise((r) => setTimeout(r, 40));
      expect(upstreamPullCount).toBe(pullsDuringPause);

      // Downstream is paused in backpressure. Now trigger consumer abort!
      const abortErr = new Error('Consumer abort during backpressure pause');
      abortController.abort(abortErr);

      // Upstream provider reader must be cancelled immediately
      expect(upstreamCancelled).toBe(true);
      expect(upstreamCancelReason).toBe(abortErr);

      // Reader read should reject with abort error
      const reader = response.body!.getReader();
      await expect(reader.read()).rejects.toThrow('Consumer abort during backpressure pause');
    });

    it('1.5: direct consumer reader.cancel() propagates immediately to upstream provider', async () => {
      let upstreamCancelled = false;
      let cancelReason: unknown = null;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-5',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              controller.enqueue({ type: 'text', text: 'Data token' });
            },
            cancel(reason) {
              upstreamCancelled = true;
              cancelReason = reason;
            },
          });
        },
      };

      const response = await streamAI({ model, prompt: 'Direct reader cancel' });
      const reader = response.body!.getReader();

      const { done, value } = await reader.read();
      expect(done).toBe(false);
      expect(value).toBeDefined();

      await reader.cancel('Consumer disconnected stream explicitly');
      expect(upstreamCancelled).toBe(true);
      expect(cancelReason).toBe('Consumer disconnected stream explicitly');
    });

    it('1.6: abort while upstream read is pending (slow/delayed upstream provider)', async () => {
      const abortController = new AbortController();
      let upstreamCancelled = false;
      let upstreamCancelReason: unknown = null;

      const model: AIModelInstance = {
        provider: 'slow-provider',
        modelId: 'slow-model',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            async pull(controller) {
              // Simulate slow inference (takes 500ms if not cancelled)
              await new Promise((r) => setTimeout(r, 500));
              controller.enqueue({ type: 'text', text: 'Slow response token' });
            },
            cancel(reason) {
              upstreamCancelled = true;
              upstreamCancelReason = reason;
            },
          });
        },
      };

      const response = await streamAI({
        model,
        prompt: 'Slow provider test',
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      const readPromise = reader.read();

      // Trigger abort while reader.read() is pending
      await new Promise((r) => setTimeout(r, 30));
      const abortErr = new Error('Client timed out waiting for slow provider');
      abortController.abort(abortErr);

      // Downstream readPromise must reject immediately with abort error (without waiting 500ms)
      await expect(readPromise).rejects.toThrow('Client timed out waiting for slow provider');

      // Upstream provider cancel hook must be invoked
      expect(upstreamCancelled).toBe(true);
      expect(upstreamCancelReason).toBe(abortErr);
    });

    it('1.7: direct reader.cancel() during backpressure pause propagates upstream', async () => {
      let upstreamCancelled = false;
      let cancelReason: unknown = null;
      let upstreamPulls = 0;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-bp-direct',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              upstreamPulls++;
              controller.enqueue({
                type: 'text',
                text: 'Backpressure token chunk. '.repeat(10), // ~250 bytes
              });
            },
            cancel(reason) {
              upstreamCancelled = true;
              cancelReason = reason;
            },
          });
        },
      };

      const response = await streamAI({
        model,
        prompt: 'Direct cancel during BP',
        highWaterMark: 200,
      });

      const reader = response.body!.getReader();

      // Wait for backpressure pause to be reached
      await new Promise((r) => setTimeout(r, 50));
      const pullsPaused = upstreamPulls;
      expect(pullsPaused).toBeGreaterThanOrEqual(1);

      // Now cancel via reader directly without AbortController
      await reader.cancel('Direct reader cancel during backpressure');

      expect(upstreamCancelled).toBe(true);
      expect(cancelReason).toBe('Direct reader cancel during backpressure');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Provider Reader Cancellation, Dangling Promises & Unhandled Rejections
  // --------------------------------------------------------------------------
  describe('2. Provider Reader Cancellation, Dangling Promises, Memory Leaks & Rejections', () => {
    it('2.1: handles asynchronous delayed upstream cancel hook cleanly', async () => {
      const abortController = new AbortController();
      let cancelResolved = false;

      const model: AIModelInstance = {
        provider: 'mock',
        modelId: 'mock-async-cancel',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              controller.enqueue({ type: 'text', text: 'Delayed cancel chunk' });
            },
            async cancel() {
              await new Promise((r) => setTimeout(r, 50));
              cancelResolved = true;
            },
          });
        },
      };

      const response = await streamAI({
        model,
        prompt: 'Async cancel test',
        signal: abortController.signal,
      });

      const reader = response.body!.getReader();
      await reader.read();

      abortController.abort(new Error('Abort with delayed provider cancel'));

      // Wait for delayed cancel to finish
      await new Promise((r) => setTimeout(r, 80));
      expect(cancelResolved).toBe(true);
    });

    it('2.2: does not leak unhandled rejection if upstream cancel() hook throws', async () => {
      const abortController = new AbortController();
      const unhandledErrors: unknown[] = [];
      const onUnhandled = (err: unknown) => {
        unhandledErrors.push(err);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const model: AIModelInstance = {
          provider: 'mock',
          modelId: 'mock-throwing-cancel',
          async doStream(): Promise<ReadableStream<AIChunk>> {
            return new ReadableStream<AIChunk>({
              pull(controller) {
                controller.enqueue({ type: 'text', text: 'Chunk before faulty cancel' });
              },
              cancel() {
                throw new Error('Fatal socket teardown error in provider cancel hook');
              },
            });
          },
        };

        const response = await streamAI({
          model,
          prompt: 'Throwing cancel test',
          signal: abortController.signal,
        });

        const reader = response.body!.getReader();
        await reader.read();

        // Trigger abort which causes cancel() hook to throw
        abortController.abort(new Error('Abort client'));

        await new Promise((r) => setTimeout(r, 60));

        // stream.ts catches r.cancel().catch(() => {}), so unhandledErrors must be empty!
        expect(unhandledErrors).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });

    it('2.3: 100 rapid concurrent stream creations and aborts without leaks or rejections', async () => {
      const unhandledErrors: unknown[] = [];
      const onUnhandled = (err: unknown) => {
        unhandledErrors.push(err);
      };
      process.on('unhandledRejection', onUnhandled);

      const streamCount = 100;
      const cancelCounts = { preFlight: 0, postFirstChunk: 0, backpressure: 0 };

      try {
        const tasks = Array.from({ length: streamCount }, async (_, i) => {
          const controller = new AbortController();
          const category = i % 3; // 0 = preFlight, 1 = postFirstChunk, 2 = backpressure
          let wasCancelled = false;

          const model: AIModelInstance = {
            provider: `mock-stress-${i}`,
            modelId: `stress-${i}`,
            async doStream(): Promise<ReadableStream<AIChunk>> {
              let idx = 0;
              return new ReadableStream<AIChunk>({
                pull(c) {
                  idx++;
                  c.enqueue({ type: 'text', text: `Token ${idx} ` });
                },
                cancel() {
                  wasCancelled = true;
                  if (category === 0) cancelCounts.preFlight++;
                  else if (category === 1) cancelCounts.postFirstChunk++;
                  else cancelCounts.backpressure++;
                },
              });
            },
          };

          if (category === 0) {
            // Pre-flight abort (after response creation, before read)
            const response = await streamAI({ model, prompt: 'Pre', signal: controller.signal });
            controller.abort(new Error(`Pre-flight abort ${i}`));
            const reader = response.body!.getReader();
            await reader.read().catch(() => {});
          } else if (category === 1) {
            // Post-first chunk abort
            const response = await streamAI({ model, prompt: 'First', signal: controller.signal });
            const reader = response.body!.getReader();
            await reader.read();
            controller.abort(new Error(`Post-first abort ${i}`));
            await reader.read().catch(() => {});
          } else {
            // Backpressure pause abort
            const response = await streamAI({
              model,
              prompt: 'Backpressure',
              signal: controller.signal,
              highWaterMark: 50,
            });
            await new Promise((r) => setTimeout(r, 10));
            controller.abort(new Error(`Backpressure abort ${i}`));
            const reader = response.body!.getReader();
            await reader.read().catch(() => {});
          }

          expect(wasCancelled).toBe(true);
        });

        await Promise.all(tasks);

        // Allow microtasks to settle
        await new Promise((r) => setTimeout(r, 100));

        expect(cancelCounts.preFlight + cancelCounts.postFirstChunk + cancelCounts.backpressure).toBe(
          streamCount
        );
        expect(unhandledErrors).toHaveLength(0);
      } finally {
        process.removeListener('unhandledRejection', onUnhandled);
      }
    });

    it('2.4: 250 rapid stream creations and aborts stress test measuring heap memory stability (no leak)', async () => {
      // Warmup GC if available
      if (typeof global.gc === 'function') {
        global.gc();
      }
      const initialMem = process.memoryUsage().heapUsed;

      const iterations = 250;
      let cancelledTotal = 0;

      for (let i = 0; i < iterations; i++) {
        const controller = new AbortController();
        const model: AIModelInstance = {
          provider: 'mem-test',
          modelId: 'm1',
          async doStream(): Promise<ReadableStream<AIChunk>> {
            return new ReadableStream<AIChunk>({
              pull(c) {
                c.enqueue({ type: 'text', text: 'Large payload token data string...'.repeat(10) });
              },
              cancel() {
                cancelledTotal++;
              },
            });
          },
        };

        const res = await streamAI({ model, prompt: 'Mem', signal: controller.signal });
        const reader = res.body!.getReader();
        await reader.read();
        controller.abort(new Error('Abort immediately'));
        await reader.read().catch(() => {});
      }

      expect(cancelledTotal).toBe(iterations);

      if (typeof global.gc === 'function') {
        global.gc();
      }
      const finalMem = process.memoryUsage().heapUsed;
      const heapDiffMB = (finalMem - initialMem) / (1024 * 1024);

      // Memory growth must remain bounded under 15MB for 250 streams
      expect(heapDiffMB).toBeLessThan(15);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Upstream Provider Throwing Unexpected Errors Mid-Stream
  // --------------------------------------------------------------------------
  describe('3. Upstream Provider Mid-Stream Error Handling', () => {
    it('3.1: unexpected controller.error() on first pull emits event: error and closes cleanly', async () => {
      const model: AIModelInstance = {
        provider: 'faulty-provider',
        modelId: 'crash-first',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              controller.error(new Error('Fatal GPU Out of Memory (OOM)'));
            },
          });
        },
      };

      const response = await streamAI({ model, prompt: 'OOM trigger' });
      expect(response.status).toBe(200);

      const { events } = await readAllChunks(response);

      expect(events.length).toBe(1);
      expect(events[0]?.event).toBe('error');

      const parsed = JSON.parse(events[0]!.data);
      expect(parsed.error).toContain('Fatal GPU Out of Memory (OOM)');
      expect(parsed.message).toContain('Fatal GPU Out of Memory (OOM)');
    });

    it('3.2: unexpected error thrown mid-stream after partial chunks emits event: error and closes cleanly', async () => {
      let pullCount = 0;
      const model: AIModelInstance = {
        provider: 'faulty-provider',
        modelId: 'crash-mid',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          return new ReadableStream<AIChunk>({
            pull(controller) {
              pullCount++;
              if (pullCount === 1) {
                controller.enqueue({ type: 'text', text: 'Chunk 1 before failure' });
              } else if (pullCount === 2) {
                controller.enqueue({ type: 'text', text: 'Chunk 2 before failure' });
              } else {
                controller.error(new Error('Upstream provider connection dropped mid-inference'));
              }
            },
          });
        },
      };

      const response = await streamAI({ model, prompt: 'Mid-stream fail' });
      const { events } = await readAllChunks(response);

      expect(events.length).toBe(3);
      expect(events[0]?.event).toBe('chunk');
      expect(JSON.parse(events[0]!.data).text).toBe('Chunk 1 before failure');

      expect(events[1]?.event).toBe('chunk');
      expect(JSON.parse(events[1]!.data).text).toBe('Chunk 2 before failure');

      expect(events[2]?.event).toBe('error');
      const errData = JSON.parse(events[2]!.data);
      expect(errData.error).toContain('Upstream provider connection dropped mid-inference');
      expect(errData.message).toContain('Upstream provider connection dropped mid-inference');
    });

    it('3.3: upstream model yielding { type: "error" } chunk emits event: error and closes cleanly', async () => {
      const model: AIModelInstance = {
        provider: 'faulty-provider',
        modelId: 'chunk-error',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          let step = 0;
          return new ReadableStream<AIChunk>({
            pull(controller) {
              step++;
              if (step === 1) {
                controller.enqueue({ type: 'text', text: 'Starting prompt...' });
              } else if (step === 2) {
                controller.enqueue({
                  type: 'error',
                  error: 'Rate limit exceeded: 429 Too Many Requests',
                });
              } else {
                controller.close();
              }
            },
          });
        },
      };

      const response = await streamAI({ model, prompt: 'Rate limit test' });
      const { events } = await readAllChunks(response);

      expect(events.length).toBe(2);
      expect(events[0]?.event).toBe('chunk');
      expect(events[1]?.event).toBe('error');

      const errPayload = JSON.parse(events[1]!.data);
      expect(errPayload.error).toBe('Rate limit exceeded: 429 Too Many Requests');
      expect(errPayload.message).toBe('Rate limit exceeded: 429 Too Many Requests');
    });

    it('3.4: model.doStream rejection immediately rejects streamAI() call', async () => {
      const model: AIModelInstance = {
        provider: 'faulty-provider',
        modelId: 'setup-fail',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          throw new Error('Invalid API key: 401 Unauthorized');
        },
      };

      await expect(streamAI({ model, prompt: 'Auth test' })).rejects.toThrow(
        'Invalid API key: 401 Unauthorized'
      );
    });

    it('3.5: upstream stream emitting custom structured error or string formats as event: error', async () => {
      const model: AIModelInstance = {
        provider: 'mock-custom-err',
        modelId: 'm1',
        async doStream(): Promise<ReadableStream<AIChunk>> {
          let step = 0;
          return new ReadableStream<AIChunk>({
            pull(controller) {
              step++;
              if (step === 1) {
                controller.enqueue({
                  type: 'error',
                  error: { code: 'INSUFFICIENT_FUNDS', message: 'Credit balance exhausted' } as unknown as string,
                });
              }
            },
          });
        },
      };

      const response = await streamAI({ model, prompt: 'Custom error object' });
      const { events } = await readAllChunks(response);

      expect(events.length).toBe(1);
      expect(events[0]?.event).toBe('error');
      const err = JSON.parse(events[0]!.data);
      expect(err.message).toBe('Credit balance exhausted');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Utility Backpressure & Stream Bounding Invariants
  // --------------------------------------------------------------------------
  describe('4. createBoundedStream and pipeWithBackpressure Abort & Error Invariants', () => {
    it('4.1: createBoundedStream cancels source stream immediately on signal abort', async () => {
      const abortController = new AbortController();
      let sourceCancelled = false;
      let sourceCancelReason: unknown = null;

      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
        },
        cancel(reason) {
          sourceCancelled = true;
          sourceCancelReason = reason;
        },
      });

      const bounded = createBoundedStream(source, {
        signal: abortController.signal,
      });

      const reader = bounded.getReader();
      const first = await reader.read();
      expect(first.done).toBe(false);

      const abortErr = new Error('Bounded abort');
      abortController.abort(abortErr);

      expect(sourceCancelled).toBe(true);
      expect(sourceCancelReason).toBe(abortErr);

      await expect(reader.read()).rejects.toThrow('Bounded abort');
    });

    it('4.2: pipeWithBackpressure propagates signal abort to reader and writer', async () => {
      const abortController = new AbortController();
      let sourceCancelled = false;
      let destAborted = false;

      const source = new ReadableStream<number>({
        pull(controller) {
          controller.enqueue(1);
        },
        cancel() {
          sourceCancelled = true;
        },
      });

      const destination = new WritableStream<number>({
        write() {
          return new Promise((r) => setTimeout(r, 10));
        },
        abort() {
          destAborted = true;
        },
      });

      const pipePromise = pipeWithBackpressure(source, destination, abortController.signal);

      // Give time for first write
      await new Promise((r) => setTimeout(r, 5));
      abortController.abort(new Error('Pipe abort'));

      await expect(pipePromise).rejects.toThrow('Pipe abort');
      expect(sourceCancelled).toBe(true);
      expect(destAborted).toBe(true);
    });
  });
});
