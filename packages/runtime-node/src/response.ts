import type { ServerResponse } from 'node:http';

export interface WriteWebResponseOptions {
  readonly signal: AbortSignal;
  readonly suppressBody?: boolean;
}

/**
 * Writes a Web standard Response object back to a Node.js ServerResponse.
 * Handles headers, Set-Cookie list formatting, streaming, backpressure, and abort lifecycles.
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
    res.destroy();
    return;
  }

  // 1. Set status code
  res.statusCode = response.status;

  // 2. Set headers
  response.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'set-cookie') {
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length > 0) {
        res.setHeader('set-cookie', cookies);
      } else {
        res.setHeader(key, value);
      }
    } else {
      res.setHeader(key, value);
    }
  });

  // 3. Handle body suppression (e.g. for HEAD requests) or empty bodies
  if (options.suppressBody || response.body === null) {
    res.end();
    return;
  }

  // 4. Stream response body chunk-by-chunk with backpressure and cancellation handling
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

      // Respect backpressure
      const ok = res.write(value);
      if (!ok) {
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            res.off('error', onError);
            resolve();
          };
          const onError = (err: Error) => {
            res.off('drain', onDrain);
            reject(err);
          };
          res.once('drain', onDrain);
          res.once('error', onError);
        });
      }
    }

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } catch (err) {
    if (!res.destroyed && !res.writableEnded) {
      res.destroy();
    }
    throw err;
  } finally {
    options.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
