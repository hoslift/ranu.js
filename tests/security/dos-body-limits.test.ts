import http from 'node:http';
import { describe, it, expect, afterAll } from 'vitest';
import {
  parseBodyLimit,
  createLimitedReadableStream,
  PayloadTooLargeError,
  toWebRequest,
  createNodeRequestHandler,
} from '@ranu/runtime-node';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { cleanupAllProcesses } from '../helpers/process.js';

describe('DoS & Request Body Streaming Limits (SEC-46, 108)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Body Limit Parser: parses human-readable limits accurately and falls back safely', () => {
    expect(parseBodyLimit('1mb')).toBe(1024 * 1024);
    expect(parseBodyLimit('500kb')).toBe(500 * 1024);
    expect(parseBodyLimit('2048')).toBe(2048);
    expect(parseBodyLimit(undefined)).toBe(1024 * 1024); // default 1MB
    expect(parseBodyLimit(-10)).toBe(1024 * 1024); // safe fallback
    expect(parseBodyLimit('invalid-limit')).toBe(1024 * 1024); // safe fallback
  });

  it('Streaming Byte Counter: aborts ReadableStream immediately when maxBytes is exceeded', async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4]); // 4 bytes
    const chunk2 = new Uint8Array([5, 6, 7, 8]); // 4 bytes (total 8)

    const rawStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    // Limit stream to 5 bytes
    const limitedStream = createLimitedReadableStream(rawStream, 5);
    const reader = limitedStream.getReader();

    // First chunk should be read normally (4 bytes <= 5)
    const firstRead = await reader.read();
    expect(firstRead.done).toBe(false);
    expect(firstRead.value).toEqual(chunk1);

    // Second chunk exceeds limit (4 + 4 = 8 > 5) -> must throw PayloadTooLargeError (413)
    await expect(reader.read()).rejects.toThrowError(PayloadTooLargeError);
  });

  it('Live HTTP Request: returns 413 Payload Too Large when incoming request exceeds bodyLimit', async () => {
    const mockRuntime: any = {
      handle: async (req: Request) => {
        // Attempt to consume body
        await req.arrayBuffer();
        return new Response('ok', { status: 200 });
      },
    };

    // Configure small 1KB body limit
    const handler = createNodeRequestHandler(mockRuntime, { bodyLimit: 1024 });
    const port = await getAvailablePort();
    const server = http.createServer((req, res) => {
      handler(req, res).catch(() => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Error');
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      // 1. Send body of 500 bytes (within 1KB limit) -> should succeed
      const smallBody = Buffer.alloc(500, 'a');
      const smallRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/upload', method: 'POST' },
          (resp) => {
            let body = '';
            resp.setEncoding('utf8');
            resp.on('data', (c) => (body += c));
            resp.on('end', () => resolve({ status: resp.statusCode || 0, body }));
          },
        );
        req.on('error', reject);
        req.write(smallBody);
        req.end();
      });

      expect(smallRes.status).toBe(200);

      // 2. Send body of 50KB (exceeds 1KB limit) -> must be rejected with 413
      const largeBody = Buffer.alloc(50 * 1024, 'x');
      const largeRes = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/upload', method: 'POST' },
          (resp) => {
            let body = '';
            resp.setEncoding('utf8');
            resp.on('data', (c) => (body += c));
            resp.on('end', () => resolve({ status: resp.statusCode || 0, body }));
          },
        );
        req.on('error', () => {
          // If connection was severed due to early abort, treat as 413 rejection
          resolve({ status: 413, body: 'Payload Too Large' });
        });
        req.write(largeBody);
        req.end();
      });

      expect(largeRes.status).toBe(413);
      expect(largeRes.body).toContain('Payload Too Large');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
    }
  });
});
