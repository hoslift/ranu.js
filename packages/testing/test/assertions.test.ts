import { describe, it, expect } from 'vitest';
import {
  expectStatus,
  expectHeader,
  expectJson,
  expectText,
  expectRedirect,
} from '../src/assertions.js';

describe('@ranu/testing assertions', () => {
  it('expectStatus verifies correct status code and throws on mismatch', () => {
    const res = new Response('ok', { status: 200 });
    expect(() => expectStatus(res, 200)).not.toThrow();
    expect(() => expectStatus(res, 404)).toThrow('Expected response status 404, but received 200');
  });

  it('expectHeader checks presence and values', () => {
    const res = new Response('hello', {
      headers: { 'X-Framework': 'ranu.js', 'content-type': 'text/plain; charset=utf-8' },
    });

    expect(expectHeader(res, 'x-framework')).toBe('ranu.js');
    expect(() => expectHeader(res, 'x-non-existent')).toThrow('Expected header "x-non-existent"');
    expect(() => expectHeader(res, 'x-framework', 'express')).toThrow('Expected header "x-framework" to equal "express"');
    expect(() => expectHeader(res, 'x-framework', /^ranu/)).not.toThrow();
  });

  it('expectJson parses and matches properties or functions', async () => {
    const res1 = Response.json({ status: 'ok', code: 200 });
    const data = await expectJson(res1, { status: 'ok' });
    expect(data).toEqual({ status: 'ok', code: 200 });

    const res2 = Response.json({ score: 95 });
    await expectJson<{ score: number }>(res2, (json) => json.score > 90);

    const resBad = new Response('not a json', { headers: { 'content-type': 'text/plain' } });
    await expect(expectJson(resBad)).rejects.toThrow('Failed to parse response body as JSON');
  });

  it('expectText validates body text', async () => {
    const res = new Response('Welcome to Ranu.js Framework!');
    const text = await expectText(res, 'Welcome');
    expect(text).toContain('Framework');

    const res2 = new Response('Welcome to Ranu.js Framework!');
    await expect(expectText(res2, 'Not Here')).rejects.toThrow('Expected response text to contain "Not Here"');
  });

  it('expectRedirect asserts redirection headers and status', () => {
    const redirectRes = new Response(null, {
      status: 302,
      headers: { location: '/login' },
    });

    expect(() => expectRedirect(redirectRes, '/login')).not.toThrow();
    expect(() => expectRedirect(redirectRes, '/login', 302)).not.toThrow();
    expect(() => expectRedirect(redirectRes, '/login', 301)).toThrow('Expected redirect status 301, but received 302');

    const okRes = new Response('ok', { status: 200 });
    expect(() => expectRedirect(okRes)).toThrow('Expected a redirect status');
  });
});
