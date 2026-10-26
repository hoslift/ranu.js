import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderReactToStream } from '../src/stream.js';

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe('Streaming SSR Bridge', () => {
  it('renders a simple React component to a Web ReadableStream', async () => {
    const element = React.createElement(
      'html',
      null,
      React.createElement('head', null, React.createElement('title', null, 'Stream Test')),
      React.createElement('body', null, React.createElement('h1', null, 'Hello from Stream')),
    );

    const stream = await renderReactToStream(element);
    expect(stream).toBeDefined();

    const html = await streamToString(stream);
    expect(html).toContain('<title>Stream Test</title>');
    expect(html).toContain('<h1>Hello from Stream</h1>');
  });

  it('aborts streaming cleanly when AbortSignal triggers', async () => {
    const abortController = new AbortController();

    const element = React.createElement(
      'html',
      null,
      React.createElement('body', null, 'Will be aborted'),
    );

    const stream = await renderReactToStream(element, {
      signal: abortController.signal,
    });

    abortController.abort();
    expect(stream).toBeDefined();
  });

  it('asserts flight serialization rules in development mode and emits diagnostic', async () => {
    const ClientButton: any = ({ onClick }: any) => React.createElement('button', { onClick }, 'Click');
    ClientButton.$$typeof = Symbol.for('react.client.reference');
    ClientButton.displayName = 'ClientButton';

    const element = React.createElement(
      'div',
      null,
      React.createElement(ClientButton, { onClick: () => console.log('clicked') })
    );

    let capturedDiagnostic: any;
    let thrownError: any;
    try {
      await renderReactToStream(element, {
        mode: 'development',
        onDiagnostic: (diag) => {
          capturedDiagnostic = diag;
        },
      });
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError.code).toBe('RANU_REACT_STREAM_SERIALIZATION_ERROR');
    expect(capturedDiagnostic).toBeDefined();
    expect(capturedDiagnostic.code).toBe('RANU_REACT_STREAM_SERIALIZATION_ERROR');
    expect(capturedDiagnostic.severity).toBe('error');
    expect(capturedDiagnostic.message).toContain('Cannot pass non-serializable function prop');
    expect(capturedDiagnostic.hint).toContain('Move event handlers and stateful logic inside the Client Component');
  });

  it('allows serializable client component props in development mode', async () => {
    const ClientCard: any = ({ title, count }: any) =>
      React.createElement('div', null, `${title}: ${count}`);
    ClientCard.$$typeof = Symbol.for('react.client.reference');
    ClientCard.displayName = 'ClientCard';

    const element = React.createElement(
      'div',
      null,
      React.createElement(ClientCard, { title: 'Total', count: 99 })
    );

    const stream = await renderReactToStream(element, {
      mode: 'development',
    });
    expect(stream).toBeDefined();
    const html = await streamToString(stream);
    expect(html).toContain('Total: 99');
  });
});
