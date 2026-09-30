import http from 'node:http';
import { describe, it, expect } from 'vitest';
import { writeWebResponse, buildRequestUrl } from '@ranu/runtime-node';
import { CRLF_INJECTION_VECTORS } from './harness.js';

describe('Suites 7, 8, 9: HTTP Headers, Cookies & Proxy Trust (header-injection, cookie-serialization, proxy-trust)', () => {
  it('Suite 7: Header Injection Defense: Web standard Headers rejects CRLF injection and statusMessage is sanitized', async () => {
    for (const vector of CRLF_INJECTION_VECTORS) {
      const headers = new Headers();
      // 1. Web standard Headers natively throws TypeError on CRLF injection attempts
      expect(() => headers.set('X-Custom-Header', vector)).toThrow(/invalid header value/);
    }

    // 2. Test statusText sanitization in writeWebResponse
    const webResponse = new Response('ok', {
      status: 200,
      statusText: 'OK',
    });

    const res = new http.ServerResponse({ method: 'GET' } as any);

    await writeWebResponse(webResponse, res, {
      signal: new AbortController().signal,
      suppressBody: true,
    });

    expect(res.statusMessage).toBe('OK');
  });

  it('Suite 8: Cookie Serialization: preserves individual Set-Cookie headers with security attributes', async () => {
    const headers = new Headers();
    headers.append('Set-Cookie', 'session=abc; Secure; HttpOnly; SameSite=Strict');
    headers.append('Set-Cookie', 'pref=dark; Path=/; SameSite=Lax');

    const webResponse = new Response('ok', {
      status: 200,
      headers,
    });

    const res = new http.ServerResponse({ method: 'GET' } as any);

    await writeWebResponse(webResponse, res, {
      signal: new AbortController().signal,
      suppressBody: true,
    });

    const setCookieHeader = res.getHeader('set-cookie');
    expect(Array.isArray(setCookieHeader)).toBe(true);
    const cookies = setCookieHeader as string[];
    expect(cookies.length).toBe(2);

    expect(cookies[0]).toContain('SameSite=Strict');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('Secure');
    expect(cookies[1]).toContain('SameSite=Lax');
  });

  it('Suite 9: Proxy Trust Defense: ignores forwarded headers by default (trustProxy: false)', () => {
    const req = {
      url: '/api/user',
      headers: {
        host: 'my-app.internal:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'evil-spoofed-host.com',
        'x-forwarded-for': '203.0.113.195',
      },
    };

    // Default trustProxy is false: forwarded headers are completely ignored
    const untrustedUrl = buildRequestUrl(req, { trustProxy: false, defaultHost: 'localhost' });
    expect(untrustedUrl).toBe('http://my-app.internal:3000/api/user');
    expect(untrustedUrl).not.toContain('evil-spoofed-host.com');
    expect(untrustedUrl).not.toContain('https');
  });

  it('Suite 9: Proxy Trust Defense: safely honors forwarded headers only when trustProxy: true', () => {
    const req = {
      url: '/dashboard',
      headers: {
        host: 'internal-loadbalancer',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'app.example.com',
      },
    };

    const trustedUrl = buildRequestUrl(req, { trustProxy: true });
    expect(trustedUrl).toBe('https://app.example.com/dashboard');
  });
});
