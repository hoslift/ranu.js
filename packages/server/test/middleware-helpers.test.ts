import { describe, it, expect } from 'vitest';
import { next, rewrite, redirect, notFound } from '../src/index.js';
import { RewriteSignal, MiddlewareNextSignal } from '@ranu/runtime';

describe('@ranu/server Middleware Helpers', () => {
  it('next() returns a MiddlewareNextSignal', () => {
    const sig = next();
    expect(sig).toBeInstanceOf(MiddlewareNextSignal);
    expect(sig.headers).toBeUndefined();
  });

  it('next({ headers }) returns a MiddlewareNextSignal with headers attached', () => {
    const sig = next({
      headers: {
        'x-custom-header': 'middleware-value',
      },
    });
    expect(sig).toBeInstanceOf(MiddlewareNextSignal);
    expect(sig.headers).toEqual({
      'x-custom-header': 'middleware-value',
    });
  });

  it('rewrite() throws a RewriteSignal with normalized target URL', () => {
    expect(() => rewrite('/internal/dashboard')).toThrow(RewriteSignal);
    try {
      rewrite('/internal/dashboard');
    } catch (err: any) {
      expect(err).toBeInstanceOf(RewriteSignal);
      expect(err.url).toBe('/internal/dashboard');
    }
  });

  it('rewrite() accepts a URL object', () => {
    const urlObj = new URL('https://example.com/target');
    try {
      rewrite(urlObj);
    } catch (err: any) {
      expect(err).toBeInstanceOf(RewriteSignal);
      expect(err.url).toBe('https://example.com/target');
    }
  });
});
