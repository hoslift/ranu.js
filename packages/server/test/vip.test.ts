import { describe, it, expect } from 'vitest';
import {
  verifyVipToken,
  applyVipHeaders,
  createVipNotFoundResponse,
  createVipMiddleware,
  VIP_ROBOTS_HEADER_VALUE,
} from '../src/vip.js';

describe('VIP Token Verification & Timing Safety', () => {
  const secret = 'hoslift-secret-preview-token-9821';

  it('validates exact matching token successfully', () => {
    expect(verifyVipToken(secret, secret)).toBe(true);
  });

  it('rejects mismatching tokens', () => {
    expect(verifyVipToken('wrong-token', secret)).toBe(false);
    expect(verifyVipToken(secret + '-extra', secret)).toBe(false);
    expect(verifyVipToken(secret.slice(0, -1), secret)).toBe(false);
  });

  it('handles null, undefined, and empty tokens safely', () => {
    expect(verifyVipToken(null, secret)).toBe(false);
    expect(verifyVipToken(undefined, secret)).toBe(false);
    expect(verifyVipToken('', secret)).toBe(false);
    expect(verifyVipToken(secret, '')).toBe(false);
  });

  it('safely handles extreme token lengths without error or truncation exploit', () => {
    const hugeToken = 'a'.repeat(100_000);
    expect(verifyVipToken(hugeToken, secret)).toBe(false);
    expect(verifyVipToken(hugeToken, hugeToken)).toBe(true);
  });
});

describe('VIP Header Invariants', () => {
  it('applies crawler suppression and cache prevention headers', () => {
    const headers = new Headers();
    applyVipHeaders(headers);

    expect(headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
    expect(headers.get('X-Robots-Tag')).toContain('noindex');
    expect(headers.get('X-Robots-Tag')).toContain('nofollow');
    expect(headers.get('Cache-Control')).toContain('no-store');
  });

  it('creates 404 response with anti-indexing headers', async () => {
    const res = createVipNotFoundResponse('Custom 404 Content');
    expect(res.status).toBe(404);
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
    expect(await res.text()).toBe('Custom 404 Content');
  });
});

describe('VIP Middleware Routing & Security Gating', () => {
  const secret = 'partner-vip-secret-alpha-2026';
  const middleware = createVipMiddleware({
    secretToken: secret,
    pathPrefix: '/vip',
  });

  const nextOk = async () => new Response('VIP Demo Content', { status: 200 });

  it('allows non-VIP routes through without checking token', async () => {
    const req = new Request('http://localhost:3000/app/home');
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('VIP Demo Content');
    // Does not inject VIP robots header on regular routes
    expect(res.headers.get('X-Robots-Tag')).toBeNull();
  });

  it('returns 404 Not Found when VIP route is accessed without any token', async () => {
    const req = new Request('http://localhost:3000/vip/google');
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('404 Not Found');
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
  });

  it('returns 404 Not Found when VIP route is accessed with incorrect token', async () => {
    const req = new Request('http://localhost:3000/vip/google?token=invalid-secret-token');
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('404 Not Found');
  });

  it('allows access with valid query parameter token and injects anti-indexing header', async () => {
    const req = new Request(`http://localhost:3000/vip/google?token=${secret}`);
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('VIP Demo Content');
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });

  it('allows access with valid x-vip-token header', async () => {
    const req = new Request('http://localhost:3000/vip/groq', {
      headers: { 'x-vip-token': secret },
    });
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
  });

  it('allows access with valid Authorization Bearer token', async () => {
    const req = new Request('http://localhost:3000/vip/anthropic', {
      headers: { authorization: `Bearer ${secret}` },
    });
    const res = await middleware(req, nextOk);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
  });

  it('returns 401 when hideEndpoint is explicitly set to false', async () => {
    const visibleMiddleware = createVipMiddleware({
      secretToken: secret,
      hideEndpoint: false,
    });
    const req = new Request('http://localhost:3000/vip/google');
    const res = await visibleMiddleware(req, nextOk);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized VIP Access');
    expect(res.headers.get('X-Robots-Tag')).toBe(VIP_ROBOTS_HEADER_VALUE);
  });

  it('supports async secret getter function', async () => {
    const asyncMiddleware = createVipMiddleware({
      secretToken: async () => 'async-resolved-token',
    });
    const reqValid = new Request('http://localhost:3000/vip/mistral?token=async-resolved-token');
    const resValid = await asyncMiddleware(reqValid, nextOk);
    expect(resValid.status).toBe(200);

    const reqInvalid = new Request('http://localhost:3000/vip/mistral?token=bad');
    const resInvalid = await asyncMiddleware(reqInvalid, nextOk);
    expect(resInvalid.status).toBe(404);
  });
});
