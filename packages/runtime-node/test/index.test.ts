import { describe, it, expect } from 'vitest';
import { buildRequestUrl } from '../src/index.js';

describe('@ranu/runtime-node', () => {
  it('builds a request URL from host header', () => {
    const url = buildRequestUrl(
      { url: '/about?q=1', headers: { host: 'example.com' } },
      'localhost',
    );
    expect(url).toBe('http://example.com/about?q=1');
  });

  it('falls back to defaultHost when host header is missing', () => {
    const url = buildRequestUrl({ url: '/', headers: {} }, 'localhost');
    expect(url).toBe('http://localhost/');
  });
});
