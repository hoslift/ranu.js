import { type ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import {
  assertTreeFlightSerializable,
  FlightSerializationError,
  FLIGHT_SERIALIZATION_ERROR_CODE,
} from './flight-assertions.js';

export interface StreamRenderOptions {
  readonly signal?: AbortSignal | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
  readonly mode?: 'development' | 'production' | undefined;
  readonly onDiagnostic?: ((diagnostic: RanuDiagnostic) => void) | undefined;
}

/**
 * Renders a React component tree to a Web ReadableStream using React 19's renderToReadableStream.
 * In development mode, asserts Flight serialization rules on props crossing client component boundaries.
 */
export async function renderReactToStream(
  tree: ReactNode,
  options?: StreamRenderOptions,
): Promise<ReadableStream<Uint8Array>> {
  // In development mode, assert Flight serialization rules across client component boundaries
  if (options?.mode === 'development') {
    try {
      const check = assertTreeFlightSerializable(tree);
      if (check && typeof (check as any).then === 'function') {
        await check;
      }
    } catch (err: unknown) {
      if (err instanceof FlightSerializationError) {
        const diagnostic: RanuDiagnostic = {
          code: FLIGHT_SERIALIZATION_ERROR_CODE,
          severity: 'error',
          message: err.message,
          hint: err.hint,
        };
        if (options?.onDiagnostic) {
          options.onDiagnostic(diagnostic);
        }
        if (options?.onError) {
          options.onError(err);
        }
      }
      throw err;
    }
  }

  const stream = await renderToReadableStream(
    tree,
    options?.signal !== undefined
      ? {
          signal: options.signal,
          onError(err: unknown) {
            if (options?.onError) {
              options.onError(err);
            }
          },
        }
      : {
          onError(err: unknown) {
            if (options?.onError) {
              options.onError(err);
            }
          },
        },
  );

  return stream;
}
