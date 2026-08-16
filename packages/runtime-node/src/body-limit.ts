/**
 * @ranu/runtime-node
 * Request body size limit enforcement and parsing.
 */

export class PayloadTooLargeError extends Error {
  readonly status = 413;
  constructor(message = 'Payload Too Large') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

/** Default body size limit: 1MB in bytes */
export const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024; // 1MB

/**
 * Parses human-readable body limit strings (e.g. '1mb', '500kb', '2048') into bytes.
 */
export function parseBodyLimit(limit: number | string | undefined): number {
  if (limit === undefined || limit === null) {
    return DEFAULT_BODY_LIMIT_BYTES;
  }

  if (typeof limit === 'number') {
    if (limit <= 0 || !Number.isFinite(limit)) {
      return DEFAULT_BODY_LIMIT_BYTES;
    }
    return Math.floor(limit);
  }

  const trimmed = limit.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/.exec(trimmed);
  if (!match) {
    return DEFAULT_BODY_LIMIT_BYTES;
  }

  const value = parseFloat(match[1]!);
  const unit = match[2] ?? 'b';

  let multiplier = 1;
  switch (unit) {
    case 'kb':
      multiplier = 1024;
      break;
    case 'mb':
      multiplier = 1024 * 1024;
      break;
    case 'gb':
      multiplier = 1024 * 1024 * 1024;
      break;
    default:
      multiplier = 1;
  }

  return Math.floor(value * multiplier);
}

/**
 * Wraps a Web ReadableStream with a byte-counting TransformStream that throws
 * PayloadTooLargeError (413) as soon as the consumed bytes exceed maxBytes.
 * This prevents unbounded in-memory buffering or network consumption.
 */
export function createLimitedReadableStream(
  sourceStream: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let bytesRead = 0;

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > maxBytes) {
        controller.error(new PayloadTooLargeError(`Request body exceeded maximum limit of ${maxBytes} bytes.`));
        return;
      }
      controller.enqueue(chunk);
    },
  });

  return sourceStream.pipeThrough(transformStream);
}
