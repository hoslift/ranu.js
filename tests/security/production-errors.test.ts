import http from 'node:http';
import { describe, it, expect, afterAll } from 'vitest';
import { sanitizeErrorResponse } from '@ranu/runtime';
import { createNodeRequestHandler } from '@ranu/runtime-node';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { fetchJson, fetchText } from '../helpers/http.js';
import { cleanupAllProcesses } from '../helpers/process.js';

describe('Suite 6: Production Error Sanitization (production-error-leakage)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  const sensitiveError = new Error('FATAL: Database connection to postgres://admin:SuperSecretPass99@db:5432 failed at /var/app/src/db.ts:42');

  it('Production API Error: returns sanitized 500 JSON without stack trace or database secrets', async () => {
    const sanitizedRes = sanitizeErrorResponse(
      sensitiveError,
      'req-sec-101',
      { mode: 'production' },
      'api',
    );

    expect(sanitizedRes.status).toBe(500);
    expect(sanitizedRes.headers.get('content-type')).toContain('application/json');

    const bodyText = await sanitizedRes.text();
    const body = JSON.parse(bodyText);

    expect(body.error).toBe('Internal Server Error');
    expect(body.requestId).toBe('req-sec-101');
    expect(body.stack).toBeUndefined();
    expect(bodyText).not.toContain('SuperSecretPass99');
    expect(bodyText).not.toContain('postgres://');
    expect(bodyText).not.toContain('/var/app/src/db.ts');
  });

  it('Production Page HTML Error: returns generic 500 HTML without internal file paths or stack', async () => {
    const sanitizedRes = sanitizeErrorResponse(
      sensitiveError,
      'req-sec-102',
      { mode: 'production' },
      'page',
    );

    expect(sanitizedRes.status).toBe(500);
    expect(sanitizedRes.headers.get('content-type')).toContain('text/html');

    const html = await sanitizedRes.text();
    expect(html).toContain('Internal Server Error');
    expect(html).toContain('req-sec-102');
    expect(html).not.toContain('SuperSecretPass99');
    expect(html).not.toContain('postgres://');
    expect(html).not.toContain('/var/app/src/db.ts');
    expect(html).not.toContain('at '); // no stack trace frames
  });

  it('Development Error Comparison: retains full diagnostic stack and message only in development mode', async () => {
    const devRes = sanitizeErrorResponse(
      sensitiveError,
      'req-dev-103',
      { mode: 'development' },
      'api',
    );

    expect(devRes.status).toBe(500);
    const body = await devRes.json();
    expect(body.requestId).toBe('req-dev-103');
    expect(body.message).toContain('SuperSecretPass99'); // Available in dev for debugging
    expect(body.stack).toBeDefined();
  });

  it('Live Node Server: uncaught runtime exception returns sanitized 500 and hides server stack', async () => {
    const mockRuntime: any = {
      handle: async () => {
        throw new Error('CRITICAL_FAILURE: AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE leaked?');
      },
    };

    const handler = createNodeRequestHandler(mockRuntime);
    const port = await getAvailablePort();
    const server = http.createServer((req, res) => {
      handler(req, res).catch(() => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      const res = await fetchText(`http://127.0.0.1:${port}/crash-route`);
      expect(res.status).toBe(500);
      expect(res.body).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(res.body).not.toContain('CRITICAL_FAILURE');
      expect(res.body).toBe('Internal Server Error');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
    }
  });
});
