import { describe, it, expect } from 'vitest';
import {
  streamAI,
  createBoundedStream,
  type AIChunk,
  type AIModelInstance,
  type StreamExecutionOptions,
} from '../src/index.js';

interface UpstreamMetrics {
  totalChunks: number;
  pullCount: number;
  readCount: number;
  cancelled: boolean;
  cancelReason?: unknown;
}

/**
 * Creates an upstream AIModelInstance simulating high-throughput inference
 * emitting `chunkCount` chunks in rapid succession as fast as downstream pulls.
 */
function createHighThroughputModel(
  chunkCount: number,
  chunkPayloadSize = 100
): { model: AIModelInstance; metrics: UpstreamMetrics } {
  const metrics: UpstreamMetrics = {
    totalChunks: chunkCount,
    pullCount: 0,
    readCount: 0,
    cancelled: false,
  };

  const model: AIModelInstance = {
    provider: 'challenge-high-throughput-provider',
    modelId: 'challenge-llm-fast',
    async doStream(_options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
      let index = 0;
      return new ReadableStream<AIChunk>({
        pull(controller) {
          metrics.pullCount++;
          if (index < chunkCount) {
            const chunkId = index.toString().padStart(5, '0');
            const padding = 'x'.repeat(Math.max(0, chunkPayloadSize - chunkId.length - 1));
            const text = `${chunkId}_${padding}`;
            metrics.readCount++;
            controller.enqueue({ type: 'text', text });
            index++;
          } else {
            controller.close();
          }
        },
        cancel(reason) {
          metrics.cancelled = true;
          metrics.cancelReason = reason;
        },
      });
    },
  };

  return { model, metrics };
}

describe('Empirical Challenge — AI Stream Kernel Backpressure Under Slow Consumer (Milestone M2 / PR #246)', () => {
  it('1. High-throughput inference (1,200+ chunks) with slow consumer: enforces highWaterMark ceiling (<64KB)', async () => {
    const totalChunks = 1200;
    // Each chunk payload ~120 chars text -> ~150 bytes SSE event frame.
    // 1200 * 150 bytes = ~180KB total stream size (3x the 64KB highWaterMark).
    const { model, metrics } = createHighThroughputModel(totalChunks, 120);

    let totalEnqueuedBytes = 0;
    let totalDequeuedBytes = 0;
    let maxObservedQueueBytes = 0;
    const observedQueueSizes: number[] = [];

    const response = await streamAI({
      model,
      prompt: 'Simulate high throughput stream',
      // Default highWaterMark: 64KB (65536 bytes)
      onChunk: (chunkSize, totalBytes) => {
        totalEnqueuedBytes = totalBytes;
      },
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const receivedChunks: string[] = [];

    // Phase 1: Slow consumption with deliberate 15ms delays for first 60 chunks
    // to observe backpressure stabilization and queue ceiling.
    for (let i = 0; i < 60; i++) {
      const { done, value } = await reader.read();
      if (done) break;

      totalDequeuedBytes += value.byteLength;
      const currentQueue = totalEnqueuedBytes - totalDequeuedBytes;
      maxObservedQueueBytes = Math.max(maxObservedQueueBytes, currentQueue);
      observedQueueSizes.push(currentQueue);

      const text = decoder.decode(value, { stream: true });
      receivedChunks.push(text);

      // Deliberate delay: 15ms
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Assert that during slow consumption, the internal queue never blew up
    // Queue size should be bounded by highWaterMark (64KB = 65,536 bytes) plus one max chunk size (~200 bytes)
    const highWaterMarkCeiling = 64 * 1024 + 512;
    expect(maxObservedQueueBytes).toBeLessThanOrEqual(highWaterMarkCeiling);

    // Verify upstream was throttled and did NOT read all 1200 chunks ahead of time
    // Only enough chunks to fill 64KB + 60 consumed chunks were read from upstream!
    expect(metrics.readCount).toBeLessThan(totalChunks);
    expect(metrics.readCount).toBeLessThan(600); // Far less than 1,200!

    // Phase 2: Resume draining the remaining chunks
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalDequeuedBytes += value.byteLength;
      const currentQueue = totalEnqueuedBytes - totalDequeuedBytes;
      maxObservedQueueBytes = Math.max(maxObservedQueueBytes, currentQueue);

      const text = decoder.decode(value, { stream: true });
      receivedChunks.push(text);
    }

    // All chunks must be successfully received without corruption or loss
    expect(metrics.readCount).toBe(totalChunks);
    expect(maxObservedQueueBytes).toBeLessThanOrEqual(highWaterMarkCeiling);

    const fullText = receivedChunks.join('');
    expect(fullText).toContain('data: [DONE]');
    expect(fullText).toContain('00000_');
    expect(fullText).toContain('01199_');
  }, 20000);

  it('2. Continuous deliberate 10ms delays across 1,000 chunks verifies memory ceiling & sustained backpressure', async () => {
    // 1000 chunks of ~140 bytes SSE = ~140KB total data
    const totalChunks = 1000;
    const { model, metrics } = createHighThroughputModel(totalChunks, 110);

    let totalEnqueuedBytes = 0;
    let totalDequeuedBytes = 0;
    let maxObservedQueueBytes = 0;

    const initialHeap = process.memoryUsage().heapUsed;

    const response = await streamAI({
      model,
      prompt: 'Sustained backpressure stress',
      onChunk: (_chunkSize, totalBytes) => {
        totalEnqueuedBytes = totalBytes;
      },
    });

    const reader = response.body!.getReader();
    let chunksRead = 0;

    // Read all 1000 chunks with deliberate 10ms delays for the first 100 chunks,
    // and batch draining with 5ms delays for the rest to thoroughly test sustained throttling
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunksRead++;
      totalDequeuedBytes += value.byteLength;

      const currentQueueBytes = totalEnqueuedBytes - totalDequeuedBytes;
      if (currentQueueBytes > maxObservedQueueBytes) {
        maxObservedQueueBytes = currentQueueBytes;
      }

      // Assert at EVERY step that internal queue does not exceed the 64KB highWaterMark ceiling
      expect(currentQueueBytes).toBeLessThanOrEqual(64 * 1024 + 1024);

      if (chunksRead <= 80) {
        // Deliberate 10ms delay for first 80 chunks
        await new Promise((resolve) => setTimeout(resolve, 10));
      } else if (chunksRead % 50 === 0) {
        // Periodic 10ms backpressure pauses
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const heapGrowthMB = (finalHeap - initialHeap) / (1024 * 1024);

    // Verify all 1,000 chunks were read from upstream
    expect(chunksRead).toBeGreaterThanOrEqual(1000);
    expect(metrics.readCount).toBe(1000);

    // Internal queue ceiling strictly adhered to (<64KB)
    expect(maxObservedQueueBytes).toBeLessThanOrEqual(64 * 1024 + 1024);

    // Heap memory growth should be bounded (less than 30MB growth)
    expect(heapGrowthMB).toBeLessThan(30);
  }, 25000);

  it('3. Explicitly verifies upstream reading is suspended on queue saturation and resumed as downstream drains', async () => {
    const totalChunks = 1000;
    // Each chunk ~160 bytes SSE. 64KB capacity fits ~410 chunks.
    const { model, metrics } = createHighThroughputModel(totalChunks, 130);

    const response = await streamAI({
      model,
      prompt: 'Verify pause and resume cycle',
    });

    const reader = response.body!.getReader();

    // Step A: Do NOT read anything downstream for 60ms.
    // Upstream should pull until downstream queue fills to >= 64KB, then pause!
    await new Promise((resolve) => setTimeout(resolve, 60));

    const initialPulls = metrics.pullCount;
    // Capacity of 64KB / ~160 bytes per chunk is ~410 chunks.
    // Must be saturated and stopped well before 1,000 chunks.
    expect(initialPulls).toBeGreaterThan(100);
    expect(initialPulls).toBeLessThan(totalChunks);

    // Step B: Wait another 40ms with ZERO downstream reading.
    // The upstream pull count MUST remain unchanged (strictly suspended).
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(metrics.pullCount).toBe(initialPulls);

    // Step C: Downstream drains 1 chunk.
    const firstRead = await reader.read();
    expect(firstRead.done).toBe(false);

    // Give microtasks time to trigger pull() on downstream
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Step D: Upstream reading MUST have resumed!
    expect(metrics.pullCount).toBeGreaterThan(initialPulls);
    const pullsAfterDrain1 = metrics.pullCount;

    // Step E: Drain 20 more chunks with deliberate 15ms delays
    for (let i = 0; i < 20; i++) {
      const { done } = await reader.read();
      expect(done).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Step F: Upstream reading continues to resume in lockstep with downstream reads
    expect(metrics.pullCount).toBeGreaterThan(pullsAfterDrain1);

    // Step G: Drain everything to clean completion
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(metrics.readCount).toBe(totalChunks);
  }, 15000);

  it('4. Configurable highWaterMark (16KB ceiling) restricts queue size proportionally', async () => {
    const totalChunks = 600;
    // Each chunk ~150 bytes. 16KB / ~150 bytes = ~109 chunks.
    const { model, metrics } = createHighThroughputModel(totalChunks, 120);

    let totalEnqueued = 0;
    let totalDequeued = 0;
    let maxQueue = 0;

    const response = await streamAI({
      model,
      prompt: '16KB highWaterMark test',
      highWaterMark: 16 * 1024, // 16KB
      onChunk: (_size, total) => {
        totalEnqueued = total;
      },
    });

    const reader = response.body!.getReader();

    // Read 30 chunks with 10ms delays
    for (let i = 0; i < 30; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      totalDequeued += value.byteLength;
      maxQueue = Math.max(maxQueue, totalEnqueued - totalDequeued);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Max queue must be bounded by 16KB (+ 1 chunk size)
    expect(maxQueue).toBeLessThanOrEqual(16 * 1024 + 512);
    // Upstream pulls should have paused around 16KB capacity (~110-140 chunks)
    expect(metrics.readCount).toBeLessThan(200);

    // Drain remaining
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(metrics.readCount).toBe(totalChunks);
  }, 10000);

  it('5. Immediate AbortSignal cancellation during slow backpressure releases upstream reader lock', async () => {
    const totalChunks = 1000;
    const { model, metrics } = createHighThroughputModel(totalChunks, 100);

    const abortController = new AbortController();

    const response = await streamAI({
      model,
      prompt: 'Abort test',
      signal: abortController.signal,
    });

    const reader = response.body!.getReader();

    // Read 10 chunks slowly (15ms each)
    for (let i = 0; i < 10; i++) {
      const { done } = await reader.read();
      if (done) break;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Abort mid-stream while backpressure is active
    abortController.abort(new Error('Downstream cancelled connection'));

    // Next read should reject with abort reason
    await expect(reader.read()).rejects.toThrow('Downstream cancelled connection');

    // Wait for abort propagation
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Verify upstream was cancelled
    expect(metrics.cancelled).toBe(true);
    // Upstream stopped reading far before 1,000 chunks
    expect(metrics.readCount).toBeLessThan(totalChunks);
  }, 10000);

  it('6. createBoundedStream utility bounds queue memory to <64KB under slow consumer', async () => {
    const encoder = new TextEncoder();
    const chunkCount = 1000;
    const chunkSize = 200; // 200KB total
    let upstreamEmitted = 0;

    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (upstreamEmitted < chunkCount) {
          controller.enqueue(encoder.encode('B'.repeat(chunkSize)));
          upstreamEmitted++;
        } else {
          controller.close();
        }
      },
    });

    let enqueuedBytes = 0;
    let dequeuedBytes = 0;
    let maxQueue = 0;

    const bounded = createBoundedStream(source, {
      highWaterMark: 32 * 1024, // 32KB
      onChunk: (_size, total) => {
        enqueuedBytes = total;
      },
    });

    const reader = bounded.getReader();

    // Read 20 chunks slowly with 10ms delay
    for (let i = 0; i < 20; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      dequeuedBytes += value.byteLength;
      maxQueue = Math.max(maxQueue, enqueuedBytes - dequeuedBytes);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Assert bounded by 32KB + 200 bytes
    expect(maxQueue).toBeLessThanOrEqual(32 * 1024 + chunkSize);
    expect(upstreamEmitted).toBeLessThan(chunkCount);

    // Drain rest
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(upstreamEmitted).toBe(chunkCount);
  }, 10000);

  it('7. Deliberate 20ms slow consumer delays across 1,000+ chunks verifies maximum delay boundary', async () => {
    const totalChunks = 1000;
    const { model, metrics } = createHighThroughputModel(totalChunks, 120);

    let totalEnqueued = 0;
    let totalDequeued = 0;
    let maxObservedQueue = 0;

    const response = await streamAI({
      model,
      prompt: '20ms maximum delay test',
      onChunk: (_size, total) => {
        totalEnqueued = total;
      },
    });

    const reader = response.body!.getReader();

    // Read first 50 chunks with deliberate 20ms delays
    for (let i = 0; i < 50; i++) {
      const { done, value } = await reader.read();
      if (done) break;

      totalDequeued += value.byteLength;
      const currentQueue = totalEnqueued - totalDequeued;
      maxObservedQueue = Math.max(maxObservedQueue, currentQueue);

      // Verify queue remains strictly below 64KB ceiling
      expect(currentQueue).toBeLessThanOrEqual(64 * 1024 + 512);

      // Maximum requested delay: 20ms
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    // Upstream was heavily throttled during 20ms delays
    expect(metrics.readCount).toBeLessThan(totalChunks);
    expect(maxObservedQueue).toBeLessThanOrEqual(64 * 1024 + 512);

    // Fast drain remaining
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalDequeued += value.byteLength;
      maxObservedQueue = Math.max(maxObservedQueue, totalEnqueued - totalDequeued);
    }

    expect(metrics.readCount).toBe(totalChunks);
    expect(maxObservedQueue).toBeLessThanOrEqual(64 * 1024 + 512);
  }, 15000);

  it('8. Heterogeneous chunk sizes (50B to 4KB) strictly honors highWaterMark ceiling', async () => {
    const totalChunks = 800;
    let index = 0;
    let upstreamPulls = 0;

    const model: AIModelInstance = {
      provider: 'heterogeneous-provider',
      modelId: 'var-size-model',
      async doStream(): Promise<ReadableStream<AIChunk>> {
        return new ReadableStream<AIChunk>({
          pull(controller) {
            upstreamPulls++;
            if (index < totalChunks) {
              // Vary chunk size cyclically: 50B, 200B, 1000B, 4000B
              const sizes = [50, 200, 1000, 4000];
              const size = sizes[index % sizes.length]!;
              const text = `chunk_${index}_` + 'h'.repeat(Math.max(0, size - 20));
              controller.enqueue({ type: 'text', text });
              index++;
            } else {
              controller.close();
            }
          },
        });
      },
    };

    let enqueued = 0;
    let dequeued = 0;
    let maxQueue = 0;

    const response = await streamAI({
      model,
      prompt: 'Variable chunk size test',
      onChunk: (_size, total) => {
        enqueued = total;
      },
    });

    const reader = response.body!.getReader();

    // Read with 15ms delays
    for (let i = 0; i < 40; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      dequeued += value.byteLength;
      const q = enqueued - dequeued;
      maxQueue = Math.max(maxQueue, q);

      // Because largest chunk is ~4.1KB, queue could briefly hit 64KB + 4.1KB
      expect(q).toBeLessThanOrEqual(64 * 1024 + 4096 + 256);

      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Upstream paused well before 800 chunks
    expect(index).toBeLessThan(totalChunks);

    // Drain rest
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(index).toBe(totalChunks);
  }, 15000);
});

