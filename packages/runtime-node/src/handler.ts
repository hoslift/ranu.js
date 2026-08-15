import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RanuServerRuntime } from '@ranu/runtime';
import { toWebRequest } from './request.js';
import { writeWebResponse } from './response.js';

export interface CreateNodeRequestHandlerOptions {
  readonly defaultHost?: string;
}

/**
 * Creates a Node.js HTTP request handler suitable for http.createServer.
 * Bridges IncomingMessage and ServerResponse to RanuServerRuntime.
 * Connects abort signals and error handlers cleanly.
 */
export function createNodeRequestHandler(
  runtime: RanuServerRuntime,
  options?: CreateNodeRequestHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const defaultHost = options?.defaultHost ?? 'localhost';

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    const abortController = new AbortController();
    let completed = false;

    // Correct request abort lifecycle listeners
    const onReqClose = () => {
      // Abort only when the incoming HTTP message did not complete
      if (!req.complete && !completed) {
        abortController.abort();
      }
    };

    const onReqError = () => {
      if (!completed) {
        abortController.abort();
      }
    };

    const onResClose = () => {
      // Abort only when the outgoing response did not finish normally
      if (!res.writableFinished && !completed) {
        abortController.abort();
      }
    };

    req.on('close', onReqClose);
    req.on('error', onReqError);
    res.on('close', onResClose);

    const cleanupListeners = () => {
      completed = true;
      req.off('close', onReqClose);
      req.off('error', onReqError);
      res.off('close', onResClose);
    };

    try {
      // 1. Convert to Web standard Request
      const webRequest = toWebRequest(req, abortController.signal, defaultHost);

      // 2. Dispatch via RanuServerRuntime
      const webResponse = await runtime.handle(webRequest);

      // 3. Write Web Response to Node ServerResponse
      const suppressBody = req.method?.toUpperCase() === 'HEAD';
      await writeWebResponse(webResponse, res, {
        signal: abortController.signal,
        suppressBody,
      });
    } catch (err: unknown) {
      // 4. Fallback error handling if runtime dispatch or bridge conversion fails
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Internal Server Error');
      } else if (!res.writableEnded && !res.destroyed) {
        res.destroy();
      }
    } finally {
      cleanupListeners();
    }
  };
}
