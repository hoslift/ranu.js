import { type ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';

export interface StreamRenderOptions {
  readonly signal?: AbortSignal;
  readonly onError?: (error: unknown) => void;
}

/**
 * Renders a React component tree to a Web ReadableStream using React 19's renderToReadableStream.
 */
export async function renderReactToStream(
  tree: ReactNode,
  options?: StreamRenderOptions,
): Promise<ReadableStream<Uint8Array>> {
  const stream = await renderToReadableStream(tree, {
    signal: options?.signal,
    onError(err: unknown) {
      if (options?.onError) {
        options.onError(err);
      }
    },
  });

  return stream;
}
