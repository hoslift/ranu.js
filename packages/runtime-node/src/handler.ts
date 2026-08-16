import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RanuServerRuntime } from '@ranu/runtime';
import { toWebRequest, type ToWebRequestOptions } from './request.js';
import { writeWebResponse } from './response.js';
import { PayloadTooLargeError } from './body-limit.js';

export interface NodeRequestHandlerOptions extends ToWebRequestOptions {}

/**
 * Creates a Node.js HTTP request listener bridging IncomingMessage and ServerResponse
 * to the provider-neutral RanuServerRuntime request pipeline.
 * Safely coordinates request cancellation, streaming, body size limits, and error recovery.
 */
export function createNodeRequestHandler(
  runtime: RanuServerRuntime,
  options?: NodeRequestHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (res.writableEnded || res.destroyed) {
      return;
    }

    const abortController = new AbortController();
    let completed = false;

    // Connect Node HTTP transport events to Web AbortSignal
    const onReqClose = () => {
      // Client closed connection prematurely before incoming stream finished
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
      // Outgoing connection closed prematurely before response was completely flushed
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
      // 1. Convert to standard Web Request
      let webRequest: Request;
      try {
        webRequest = toWebRequest(req, abortController.signal, options);
      } catch (err: unknown) {
        if (err instanceof PayloadTooLargeError || (err as { status?: number })?.status === 413) {
          if (!res.headersSent) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Payload Too Large');
            return;
          }
        }
        throw err;
      }

      // 2. Dispatch through RanuServerRuntime pipeline
      let webResponse: Response;
      try {
        webResponse = await runtime.handle(webRequest);
      } catch (err: unknown) {
        if (err instanceof PayloadTooLargeError || (err as { status?: number })?.status === 413) {
          if (!res.headersSent) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Payload Too Large');
            return;
          }
        }
        throw err;
      }

      // 3. Write Web Response to Node ServerResponse
      const suppressBody = (req.method ?? 'GET').toUpperCase() === 'HEAD';
      await writeWebResponse(webResponse, res, {
        signal: abortController.signal,
        suppressBody,
      });
    } catch (err: unknown) {
      if (err instanceof PayloadTooLargeError || (err as { status?: number })?.status === 413) {
        if (!res.headersSent) {
          res.statusCode = 413;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Payload Too Large');
          return;
        }
      }

      // Production fallback if response streaming or dispatch throws an uncaught error
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
