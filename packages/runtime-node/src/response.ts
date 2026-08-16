import type { ServerResponse } from 'node:http';

export interface WriteWebResponseOptions {
  readonly signal: AbortSignal;
  readonly suppressBody?: boolean;
}

/**
 * Determines whether an HTTP status code forbids a message body according to RFC 9110 / HTTP specifications.
 * 1xx (Informational), 204 (No Content), 304 (Not Modified) MUST NOT send a body.
 */
export function isBodylessStatus(status: number): boolean {
  return (status >= 100 && status < 200) || status === 204 || status === 304;
}

/**
 * Writes a Web standard Response object back to a Node.js ServerResponse.
 * Properly manages headers, multi-value Set-Cookie, streaming chunks, backpressure, and abort lifecycles.
 */
export async function writeWebResponse(
  response: Response,
  res: ServerResponse,
  options: WriteWebResponseOptions,
): Promise<void> {
  if (res.writableEnded || res.destroyed) {
    return;
  }

  if (options.signal.aborted) {
    if (!res.writableEnded && !res.destroyed) {
      res.destroy();
    }
    return;
  }

  // 1. Set HTTP status
  res.statusCode = response.status;
  if (response.statusText) {
    res.statusMessage = response.statusText;
  }

  // 2. Set headers
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    res.setHeader('Set-Cookie', setCookies);
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie' && setCookies.length > 0) {
      // Already set via getSetCookie() to prevent comma-joining
      return;
    }
    res.setHeader(key, value);
  });

  // 3. Bodyless status codes (1xx, 204, 304) and explicit body suppression (HEAD)
  if (isBodylessStatus(response.status) || options.suppressBody || response.body === null) {
    res.end();
    return;
  }

  // 4. Stream response body with backpressure and cancellation handling
  const reader = response.body.getReader();

  const onAbort = () => {
    reader.cancel().catch(() => {});
    if (!res.writableEnded && !res.destroyed) {
      res.destroy();
    }
  };

  options.signal.addEventListener('abort', onAbort);

  try {
    while (true) {
      if (res.destroyed || res.writableEnded) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (value) {
        const ok = res.write(value);
        if (!ok) {
          // Backpressure: wait for socket drain before reading next chunk
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              res.off('error', onError);
              res.off('close', onClose);
              resolve();
            };
            const onError = (err: Error) => {
              res.off('drain', onDrain);
              res.off('close', onClose);
              reject(err);
            };
            const onClose = () => {
              res.off('drain', onDrain);
              res.off('error', onError);
              resolve();
            };
            res.once('drain', onDrain);
            res.once('error', onError);
            res.once('close', onClose);
          });
        }
      }
    }

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } catch (err: unknown) {
    if (!res.destroyed && !res.writableEnded) {
      res.destroy();
    }
    throw err;
  } finally {
    options.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
