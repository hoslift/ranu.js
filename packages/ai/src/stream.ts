/**
 * Ranu.js Universal AI Streaming Kernel & Backpressure Engine.
 *
 * Provides W3C standard ReadableStream execution, SSE frame encoding,
 * bounded memory queuing, AbortSignal propagation, and drain management.
 */

import type {
  AIChunk,
  BoundedStreamOptions,
  StreamAIOptions,
  StreamingDrainMetrics,
} from './types.js';

/**
 * Encodes an upstream AIChunk into a compliant Server-Sent Events (SSE) event frame.
 *
 * Framing rules:
 * - text -> `event: chunk\ndata: {"text":"..."}\n\n`
 * - reasoning -> `event: reasoning\ndata: {"reasoning":"...","text":"..."}\n\n`
 * - tool-call -> `event: tool-call\ndata: {"id":"...","name":"...","arguments":"...","toolCall":{...}}\n\n`
 * - finish -> `event: finish\ndata: {"finishReason":"...","usage":{...}}\n\n`
 * - error -> `event: error\ndata: {"error":"...","message":"..."}\n\n`
 * - unknown -> `event: <type>\ndata: <json>\n\n`
 */
export function formatAIChunkToSSE(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') {
    return `event: chunk\ndata: ${JSON.stringify({ text: String(chunk) })}\n\n`;
  }

  const anyChunk = chunk as Record<string, unknown>;
  const type = anyChunk['type'];

  switch (type) {
    case 'text': {
      const text = typeof anyChunk['text'] === 'string' ? anyChunk['text'] : '';
      return `event: chunk\ndata: ${JSON.stringify({ text })}\n\n`;
    }
    case 'reasoning': {
      const reasoning =
        typeof anyChunk['reasoning'] === 'string'
          ? anyChunk['reasoning']
          : typeof anyChunk['text'] === 'string'
            ? anyChunk['text']
            : '';
      return `event: reasoning\ndata: ${JSON.stringify({ reasoning, text: reasoning })}\n\n`;
    }
    case 'tool-call': {
      const toolCall = anyChunk['toolCall'] as Record<string, unknown> | undefined;
      const payload = toolCall
        ? { ...toolCall, toolCall }
        : { ...anyChunk };
      return `event: tool-call\ndata: ${JSON.stringify(payload)}\n\n`;
    }
    case 'finish': {
      const finishReason = anyChunk['finishReason'] ?? 'stop';
      const usage = anyChunk['usage'];
      return `event: finish\ndata: ${JSON.stringify({ finishReason, usage })}\n\n`;
    }
    case 'error': {
      const err = anyChunk['error'];
      const errorMsg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : JSON.stringify(err);
      return `event: error\ndata: ${JSON.stringify({ error: errorMsg, message: errorMsg })}\n\n`;
    }
    default: {
      const eventName = typeof type === 'string' && type.length > 0 ? type : 'chunk';
      return `event: ${eventName}\ndata: ${JSON.stringify(anyChunk)}\n\n`;
    }
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

/**
 * Wraps a ReadableStream<Uint8Array> with queue-bounded backpressure,
 * optional total byte ceilings, and immediate abort cancellation propagation.
 *
 * @param source - The source Uint8Array stream.
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
                  const r = reader;
                  reader = null;
                  r.cancel(signal.reason).catch(() => {});
                  try {
                    r.releaseLock();
                  } catch {
                    // Lock may already be released
                  }
                }
                try {
                  controller.error(signal.reason);
                } catch {
                  // Controller already closed
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
          const r = reader;
          reader = null;
          await r.cancel(signal.reason).catch(() => {});
          try {
            r.releaseLock();
          } catch {
            // Already released
          }
          controller.error(signal.reason);
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          isClosed = true;
          if (reader) {
            const r = reader;
            reader = null;
            try {
              r.releaseLock();
            } catch {
              // Already released
            }
          }
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
            if (reader) {
              const r = reader;
              reader = null;
              await r.cancel(limitErr).catch(() => {});
              try {
                r.releaseLock();
              } catch {
                // Already released
              }
            }
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
          const r = reader;
          reader = null;
          await r.cancel(reason).catch(() => {});
          try {
            r.releaseLock();
          } catch {
            // Already released
          }
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
 * Executes an AI model inference stream and returns a standard W3C Response
 * formatted as Server-Sent Events (SSE) with bounded backpressure drain management.
 *
 * SSE Headers:
 * - Content-Type: `text/event-stream; charset=utf-8`
 * - Cache-Control: `no-cache, no-transform`
 * - Connection: `keep-alive`
 * - X-Accel-Buffering: `no`
 *
 * Event Frames:
 * - `event: chunk\ndata: {"text":"..."}\n\n`
 * - `event: reasoning\ndata: {"reasoning":"...","text":"..."}\n\n`
 * - `event: tool-call\ndata: {"id":"...","name":"...","arguments":"...","toolCall":{...}}\n\n`
 * - `event: finish\ndata: {"finishReason":"...","usage":{...}}\n\n`
 * - `event: error\ndata: {"error":"...","message":"..."}\n\n`
 * - `data: [DONE]\n\n`
 *
 * @param options - Configuration options including model, prompt/messages, signal, and stream bounds.
 * @returns Standard W3C Response streaming SSE chunks.
 */
export async function streamAI<T = unknown>(options: StreamAIOptions<T>): Promise<Response> {
  const signal = options.signal;

  if (signal?.aborted) {
    throw signal.reason ?? new Error('The operation was aborted');
  }

  const upstreamStream = await options.model.doStream({
    prompt: options.prompt,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    signal,
    schema: options.schema,
    tools: options.tools,
    toolChoice: options.toolChoice,
    ...options,
  });

  const highWaterMark = options.highWaterMark ?? 64 * 1024;
  const maxBytes = options.maxBytes ?? Infinity;
  const onChunk = options.onChunk;
  const encoder = new TextEncoder();

  let reader: ReadableStreamDefaultReader<AIChunk> | null = null;
  let isClosed = false;
  let totalBytes = 0;
  let doneEmitted = false;

  const strategy = new ByteLengthQueuingStrategy({ highWaterMark });

  const downstreamStream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        if (signal?.aborted) {
          controller.error(signal.reason ?? new Error('The operation was aborted'));
          return;
        }

        reader = upstreamStream.getReader();

        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              if (!isClosed) {
                isClosed = true;
                if (reader) {
                  const r = reader;
                  reader = null;
                  r.cancel(signal.reason).catch(() => {});
                  try {
                    r.releaseLock();
                  } catch {
                    // Lock may already be released
                  }
                }
                try {
                  controller.error(signal.reason ?? new Error('The operation was aborted'));
                } catch {
                  // Controller already closed or errored
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
          const r = reader;
          reader = null;
          await r.cancel(signal.reason).catch(() => {});
          try {
            r.releaseLock();
          } catch {
            // Already released
          }
          controller.error(signal.reason ?? new Error('The operation was aborted'));
          return;
        }

        let readResult: { done: boolean; value?: AIChunk | undefined };
        try {
          readResult = await reader.read();
        } catch (readErr: unknown) {
          isClosed = true;
          if (reader) {
            const r = reader;
            reader = null;
            try {
              r.releaseLock();
            } catch {
              // Ignore
            }
          }

          if (signal?.aborted) {
            controller.error(signal.reason ?? new Error('The operation was aborted'));
            return;
          }

          // Emit structured error SSE frame before closing
          const errorMsg = readErr instanceof Error ? readErr.message : String(readErr);
          const errorFrame = `event: error\ndata: ${JSON.stringify({ error: errorMsg, message: errorMsg })}\n\n`;
          const encoded = encoder.encode(errorFrame);
          totalBytes += encoded.byteLength;
          controller.enqueue(encoded);
          onChunk?.(encoded.byteLength, totalBytes);
          controller.close();
          return;
        }

        const { done, value } = readResult;

        if (done) {
          isClosed = true;
          if (reader) {
            const r = reader;
            reader = null;
            try {
              r.releaseLock();
            } catch {
              // Ignore
            }
          }

          if (!doneEmitted) {
            doneEmitted = true;
            const doneFrame = 'data: [DONE]\n\n';
            const encoded = encoder.encode(doneFrame);
            totalBytes += encoded.byteLength;
            controller.enqueue(encoded);
            onChunk?.(encoded.byteLength, totalBytes);
          }

          controller.close();
          return;
        }

        if (value) {
          const frame = formatAIChunkToSSE(value);
          if (frame.length > 0) {
            const encoded = encoder.encode(frame);
            totalBytes += encoded.byteLength;

            if (totalBytes > maxBytes) {
              isClosed = true;
              const limitErr = new Error(
                `Streaming response exceeded maximum allowed limit of ${maxBytes} bytes (streamed ${totalBytes} bytes).`
              );
              if (reader) {
                const r = reader;
                reader = null;
                await r.cancel(limitErr).catch(() => {});
                try {
                  r.releaseLock();
                } catch {
                  // Ignore
                }
              }
              controller.error(limitErr);
              return;
            }

            controller.enqueue(encoded);
            onChunk?.(encoded.byteLength, totalBytes);
          }

          if (value.type === 'error') {
            isClosed = true;
            if (reader) {
              const r = reader;
              reader = null;
              try {
                r.releaseLock();
              } catch {
                // Ignore
              }
            }
            controller.close();
          }
        }
      },

      async cancel(reason) {
        isClosed = true;
        if (reader) {
          const r = reader;
          reader = null;
          await r.cancel(reason).catch(() => {});
          try {
            r.releaseLock();
          } catch {
            // Ignore
          }
        }
      },
    },
    strategy
  );

  const headers = new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (options.headers) {
    const customHeaders = new Headers(options.headers);
    customHeaders.forEach((val, key) => {
      headers.set(key, val);
    });
  }

  return new Response(downstreamStream, {
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers,
  });
}
