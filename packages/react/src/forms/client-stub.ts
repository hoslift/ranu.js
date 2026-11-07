import type { FormAction, FormActionResult } from '@ranu/core';
import { RanuActionStreamError } from '@ranu/core';

/**
 * Creates a browser-side client RPC stub for invoking a Server Action over HTTP wire protocol.
 */
export function createClientActionStub<TInput = unknown, TOutput = unknown>(
  actionId: string,
): FormAction<TInput, TOutput> {
  const stub = async (
    input: FormData | Request | Record<string, unknown>,
  ): Promise<FormActionResult<TOutput>> => {
    let body: BodyInit;
    const headers = new Headers();
    headers.set('x-ranu-action-id', actionId);

    if (typeof FormData !== 'undefined' && input instanceof FormData) {
      body = input; // Browser sets multipart boundary automatically
    } else if (input && typeof (input as any).json === 'function') {
      const json = await (input as Request).json();
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(json);
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(input ?? {});
    }

    const response = await fetch('/_ranu/action/' + actionId, {
      method: 'POST',
      headers,
      body,
    });

    const contentType = response.headers.get('content-type') ?? '';

    // Handle Streaming NDJSON responses
    if (contentType.includes('application/x-ndjson')) {
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          success: false,
          errors: {},
          formErrors: ['ReadableStream not supported by browser environment'],
        };
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const chunks: unknown[] = [];
      let resultData: unknown = undefined;
      let hasExplicitResult = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        const frame = JSON.parse(line);
        if (frame.$e) {
          const errObj =
            typeof frame.error === 'object' && frame.error !== null ? frame.error : undefined;
          const message =
            frame.message ??
            errObj?.message ??
            'Stream processing failed';
          const code =
            frame.code ??
            errObj?.code ??
            'ACTION_STREAM_ERROR';
          const recoverable = Boolean(
            frame.recoverable ??
            errObj?.recoverable ??
            false,
          );
          throw new RanuActionStreamError(message, code, recoverable);
        }
        if (frame.type === 'chunk') {
          chunks.push(frame.value);
        }
        if (frame.type === 'result') {
          hasExplicitResult = true;
          if (frame.data !== undefined) {
            resultData = frame.data;
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            processLine(buffer);
            buffer = '';
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          processLine(line);
        }
      }

      const finalData =
        hasExplicitResult && resultData !== undefined
          ? resultData
          : chunks.length > 0
            ? chunks
            : resultData;

      return { success: true, data: finalData as TOutput };
    }

    // Standard JSON responses
    const json = await response.json();
    return json as FormActionResult<TOutput>;
  };

  stub.raw = async (data: TInput): Promise<TOutput> => {
    const res = await stub(data as any);
    if (!res.success) {
      throw new Error(res.formErrors?.[0] ?? 'Server Action failed');
    }
    return res.data!;
  };

  (stub as any).$$ACTION_ID = actionId;
  return stub as FormAction<TInput, TOutput>;
}
