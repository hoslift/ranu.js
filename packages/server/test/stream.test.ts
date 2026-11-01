import { describe, it, expect, vi } from 'vitest';
import {
  createBoundedStream,
  pipeWithBackpressure,
  createStreamingDrainTracker,
} from '../src/stream.js';
import * as ranuServer from '../../ranu/src/server.js';

describe('Streaming Backpressure & Memory Bounding (@ranu/server)', () => {
  it('streams chunks correctly while preserving bytes and order', async () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const sourceChunks = ['Hello, ', 'world! ', 'This is ', 'Ranu.js streaming.'];

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sourceChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const bounded = createBoundedStream(source);
    const reader = bounded.getReader();

    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value);
    }

    expect(output).toBe('Hello, world! This is Ranu.js streaming.');
  });

  it('triggers onChunk callback with chunk sizes and total bytes accumulated', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('12345'), encoder.encode('67890')];
    const recorded: Array<{ size: number; total: number }> = [];

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const bounded = createBoundedStream(source, {
      onChunk: (chunkSize, totalBytes) => {
        recorded.push({ size: chunkSize, total: totalBytes });
      },
    });

    const reader = bounded.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(recorded).toEqual([
      { size: 5, total: 5 },
      { size: 5, total: 10 },
    ]);
  });

  it('enforces maxBytes limit and errors stream when byte ceiling is exceeded', async () => {
    const encoder = new TextEncoder();
    const chunks = [encoder.encode('chunk-1-safe'), encoder.encode('chunk-2-exceeds-limit')];
    let sourceCanceled = false;

    let index = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]!);
          index++;
        }
      },
      cancel() {
        sourceCanceled = true;
      },
    });

    const bounded = createBoundedStream(source, {
      maxBytes: 15,
    });

    const reader = bounded.getReader();

    // First chunk should succeed (12 bytes <= 15 bytes)
    const first = await reader.read();
    expect(first.done).toBe(false);

    // Second chunk (12 + 21 = 33 bytes > 15 bytes) must throw
    await expect(reader.read()).rejects.toThrow(
      /Streaming response exceeded maximum allowed limit of 15 bytes/
    );
    expect(sourceCanceled).toBe(true);
  });

  it('aborts immediately when passed an already-aborted AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted signal'));

    let sourceCanceled = false;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        sourceCanceled = true;
      },
    });

    expect(() =>
      createBoundedStream(source, { signal: controller.signal })
    ).toThrow('Pre-aborted signal');

    expect(sourceCanceled).toBe(true);
  });

  it('aborts active stream when AbortSignal fires during stream reads', async () => {
    const abortController = new AbortController();
    const encoder = new TextEncoder();
    let sourceCanceled = false;

    const source = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((r) => setTimeout(r, 50));
        controller.enqueue(encoder.encode('ping'));
      },
      cancel() {
        sourceCanceled = true;
      },
    });

    const bounded = createBoundedStream(source, {
      signal: abortController.signal,
    });

    const reader = bounded.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    // Trigger abort
    abortController.abort(new Error('Client socket closed'));

    await expect(reader.read()).rejects.toThrow('Client socket closed');
    expect(sourceCanceled).toBe(true);
  });

  it('propagates consumer cancellation upstream to source reader', async () => {
    let cancelReason: unknown = null;

    const source = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelReason = reason;
      },
    });

    const bounded = createBoundedStream(source);
    const reader = bounded.getReader();

    await reader.cancel('Consumer disconnected');
    expect(cancelReason).toBe('Consumer disconnected');
  });

  it('pipes with backpressure to writable stream correctly', async () => {
    const chunks: string[] = [];
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('alpha');
        controller.enqueue('beta');
        controller.enqueue('gamma');
        controller.close();
      },
    });

    const destination = new WritableStream<string>({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    await pipeWithBackpressure(source, destination);
    expect(chunks).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('aborts pipeWithBackpressure when abort signal triggers', async () => {
    const abortController = new AbortController();
    const source = new ReadableStream<string>({
      pull(controller) {
        controller.enqueue('data');
      },
    });

    let writes = 0;
    const destination = new WritableStream<string>({
      write() {
        writes++;
        if (writes === 2) {
          abortController.abort(new Error('Pipeline aborted'));
        }
      },
    });

    await expect(
      pipeWithBackpressure(source, destination, abortController.signal)
    ).rejects.toThrow('Pipeline aborted');
  });

  it('tracks streaming metrics via createStreamingDrainTracker', () => {
    const tracker = createStreamingDrainTracker();

    tracker.recordChunk(1024);
    tracker.recordChunk(2048);
    tracker.recordPause();

    const metrics = tracker.getMetrics();
    expect(metrics.totalBytes).toBe(3072);
    expect(metrics.chunkCount).toBe(2);
    expect(metrics.backpressurePauses).toBe(1);
    expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('verifies public re-exports in ranu/server', () => {
    expect(ranuServer.createBoundedStream).toBeDefined();
    expect(typeof ranuServer.createBoundedStream).toBe('function');
    expect(ranuServer.pipeWithBackpressure).toBeDefined();
    expect(typeof ranuServer.pipeWithBackpressure).toBe('function');
    expect(ranuServer.createStreamingDrainTracker).toBeDefined();
    expect(typeof ranuServer.createStreamingDrainTracker).toBe('function');
  });
});
