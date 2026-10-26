/**
 * Streaming backpressure, memory bounding, and drain management for Ranu.js.
 *
 * Provides Web Streams (ReadableStream / TransformStream) utilities with
 * explicit highWaterMark queue bounds, client abort cleanup, and total byte safeguards.
 */

export interface BoundedStreamOptions {
  /**
   * High water mark (in bytes) defining the maximum buffered chunk queue size before backpressure is asserted.
   * Defaults to 64 KB (65,536 bytes).
   */
  readonly highWaterMark?: number | undefined;

  /**
   * Optional AbortSignal from request context or client socket to cancel stream processing immediately.
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * Maximum total bytes allowed through the stream before aborting with an error.
   * Prevents runaway memory or infinite streaming in serverless and edge environments.
   * Defaults to Infinity.
   */
  readonly maxBytes?: number | undefined;

  /**
   * Callback fired on each enqueued chunk with chunk byte size and running total bytes.
   */
  readonly onChunk?: ((chunkSize: number, totalBytes: number) => void) | undefined;
}

export interface StreamingDrainMetrics {
  readonly totalBytes: number;
  readonly chunkCount: number;
  readonly backpressurePauses: number;
  readonly startTime: number;
  readonly elapsedMs: number;
}

/**
 * Wraps an existing ReadableStream<Uint8Array> with queue-bounded backpressure,
 * optional total byte ceilings, and immediate abort cancellation propagation.
 *
 * @param source - The source Uint8Array stream (e.g. from React 19 renderToReadableStream).
 * @param options - Configuration options for buffer sizing, signals, and chunk tracking.
 * @returns Bounded ReadableStream with guaranteed memory ceiling.
 */
export function createBoundedStream(
  source: ReadableStream<Uint8Array>,
  options: BoundedStreamOptions = {}
): ReadableStream<Uint8Array> {
  const highWaterMark = options.highWaterMark ?? 64 * 1024;
  const maxBytes = options.maxBytes ?? Infinity;
  const signal = options.signal;
  const onChunk = options.onChunk;

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let totalBytes = 0;
  let isClosed = false;

  const strategy = new ByteLengthQueuingStrategy({ highWaterMark });

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        reader = source.getReader();

        if (signal?.aborted) {
          reader.cancel(signal.reason).catch(() => {});
          controller.error(signal.reason);
          throw signal.reason;
        }

        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              if (!isClosed) {
                isClosed = true;
                if (reader) {
                  reader.cancel(signal.reason).catch(() => {});
                }
                try {
                  controller.error(signal.reason);
                } catch {
                  // Ignore if controller already closed
                }
              }
            },
            { once: true }
          );
        }
      },

      async pull(controller) {
        if (isClosed || !reader) {
          return;
        }

        if (signal?.aborted) {
          isClosed = true;
          await reader.cancel(signal.reason).catch(() => {});
          controller.error(signal.reason);
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          isClosed = true;
          controller.close();
          return;
        }

        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            isClosed = true;
            const limitErr = new Error(
              `Streaming response exceeded maximum allowed limit of ${maxBytes} bytes (streamed ${totalBytes} bytes).`
            );
            await reader.cancel(limitErr).catch(() => {});
            controller.error(limitErr);
            return;
          }

          controller.enqueue(value);
          onChunk?.(value.byteLength, totalBytes);
        }
      },

      async cancel(reason) {
        isClosed = true;
        if (reader) {
          await reader.cancel(reason).catch(() => {});
        }
      },
    },
    strategy
  );
}

/**
 * Pipes a ReadableStream to a WritableStream while strictly observing backpressure
 * (via writer.ready) and bidirectional cancellation propagation.
 *
 * @param source - The data source stream.
 * @param destination - The destination writable stream.
 * @param signal - Optional AbortSignal to cancel piping immediately.
 */
export async function pipeWithBackpressure<T>(
  source: ReadableStream<T>,
  destination: WritableStream<T>,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason;
  }

  const reader = source.getReader();
  const writer = destination.getWriter();

  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => {});
    writer.abort(signal?.reason).catch(() => {});
  };

  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw signal.reason;
      }

      const { done, value } = await reader.read();
      if (done) {
        await writer.close();
        break;
      }

      await writer.ready;
      await writer.write(value);
    }
  } catch (err: unknown) {
    await reader.cancel(err).catch(() => {});
    await writer.abort(err).catch(() => {});
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
    writer.releaseLock();
  }
}

/**
 * Creates a tracker for streaming metrics including chunk count, bytes, and backpressure pauses.
 */
export function createStreamingDrainTracker(): {
  recordChunk: (chunkSize: number) => void;
  recordPause: () => void;
  getMetrics: () => StreamingDrainMetrics;
} {
  const startTime = Date.now();
  let totalBytes = 0;
  let chunkCount = 0;
  let backpressurePauses = 0;

  return {
    recordChunk(chunkSize: number): void {
      totalBytes += chunkSize;
      chunkCount += 1;
    },
    recordPause(): void {
      backpressurePauses += 1;
    },
    getMetrics(): StreamingDrainMetrics {
      return {
        totalBytes,
        chunkCount,
        backpressurePauses,
        startTime,
        elapsedMs: Date.now() - startTime,
      };
    },
  };
}
