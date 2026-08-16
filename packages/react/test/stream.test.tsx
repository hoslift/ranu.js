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
});
