import { type ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';

export interface StreamRenderOptions {
  readonly signal?: AbortSignal | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
}

/**
 * Renders a React component tree to a Web ReadableStream using React 19's renderToReadableStream.
 */
export async function renderReactToStream(
  tree: ReactNode,
  options?: StreamRenderOptions,
): Promise<ReadableStream<Uint8Array>> {
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
