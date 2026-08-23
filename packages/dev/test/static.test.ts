import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMimeType, serveStaticFile } from '../src/static.js';

class MockWritableResponse extends Writable {
  statusCode = 0;
  headers: Record<string, unknown> = {};
  chunks: Buffer[] = [];
  method: string;

  constructor(method = 'GET') {
    super();
    this.method = method;
  }

  writeHead(code: number, headers: Record<string, unknown>): void {
    this.statusCode = code;
    this.headers = headers;
  }

  override _write(chunk: unknown, _enc: string, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    callback();
  }

  get body(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

function waitForFinish(res: MockWritableResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    res.once('finish', () => resolve());
    res.once('error', reject);
  });
}

describe('Development Static File Server', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-static-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('resolves correct MIME types for static assets', () => {
    expect(getMimeType('index.html')).toBe('text/html; charset=utf-8');
    expect(getMimeType('style.css')).toBe('text/css; charset=utf-8');
    expect(getMimeType('bundle.js')).toBe('text/javascript; charset=utf-8');
    expect(getMimeType('data.json')).toBe('application/json; charset=utf-8');
    expect(getMimeType('image.png')).toBe('image/png');
    expect(getMimeType('photo.jpg')).toBe('image/jpeg');
    expect(getMimeType('vector.svg')).toBe('image/svg+xml');
    expect(getMimeType('font.woff2')).toBe('font/woff2');
    expect(getMimeType('video.mp4')).toBe('video/mp4');
    expect(getMimeType('audio.mp3')).toBe('audio/mpeg');
  });

  it('rejects path traversal attempts escaping authorized root', () => {
    const outsidePath = path.join(os.tmpdir(), 'secret.txt');

    let responseCode = 0;
    let responseBody = '';

    const mockReq: any = { method: 'GET' };
    const mockRes: any = {
      writeHead(code: number) {
        responseCode = code;
      },
      end(body: string) {
        responseBody = body;
      },
    };

    const served = serveStaticFile(outsidePath, tempDir, mockReq, mockRes);
    expect(served).toBe(true);
    expect(responseCode).toBe(403);
    expect(responseBody).toContain('Forbidden');
  });

  it('returns false for non-existent file', () => {
    const nonExistent = path.join(tempDir, 'missing.png');
    const mockReq: any = { method: 'GET' };
    const mockRes: any = { writeHead() {}, end() {} };

    const served = serveStaticFile(nonExistent, tempDir, mockReq, mockRes);
    expect(served).toBe(false);
  });

  it('falls back to application/octet-stream for unknown extensions', () => {
    expect(getMimeType('archive.xyz')).toBe('application/octet-stream');
    expect(getMimeType('no-extension')).toBe('application/octet-stream');
  });

  it('returns false (not served) when the target path is a directory', () => {
    const dirPath = path.join(tempDir, 'a-directory');
    fs.mkdirSync(dirPath);

    const mockReq: any = { method: 'GET' };
    const mockRes: any = { writeHead() {}, end() {} };

    const served = serveStaticFile(dirPath, tempDir, mockReq, mockRes);
    expect(served).toBe(false);
  });

  it('streams the full file body to the response on GET', async () => {
    const filePath = path.join(tempDir, 'hello.txt');
    fs.writeFileSync(filePath, 'Hello, Ranu.js dev server!');

    const mockRes = new MockWritableResponse('GET');
    const served = serveStaticFile(filePath, tempDir, { method: 'GET' } as any, mockRes as any);
    expect(served).toBe(true);

    await waitForFinish(mockRes);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(mockRes.headers['Content-Length']).toBe(26);
    expect(mockRes.headers['Cache-Control']).toContain('no-cache');
    expect(mockRes.body).toBe('Hello, Ranu.js dev server!');
  });

  it('responds to HEAD requests with headers only and no body', () => {
    const filePath = path.join(tempDir, 'hello.txt');
    fs.writeFileSync(filePath, 'Hello, Ranu.js dev server!');

    const mockRes = new MockWritableResponse('HEAD');
    const served = serveStaticFile(filePath, tempDir, { method: 'HEAD' } as any, mockRes as any);

    expect(served).toBe(true);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.writableEnded).toBe(true);
    expect(mockRes.chunks.length).toBe(0);
  });

  it('destroys the response when a file stream fails after headers are sent', () => {
    const filePath = path.join(tempDir, 'broken.txt');
    fs.writeFileSync(filePath, 'unreadable');
    const stream = new EventEmitter() as EventEmitter & { pipe(destination: unknown): unknown };
    stream.pipe = (destination) => destination;
    vi.spyOn(fs, 'createReadStream').mockReturnValue(
      stream as unknown as ReturnType<typeof fs.createReadStream>,
    );
    const error = new Error('read failed');
    const res = {
      headersSent: false,
      writeHead: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    res.writeHead.mockImplementation(() => {
      res.headersSent = true;
    });

    expect(serveStaticFile(filePath, tempDir, { method: 'GET' } as any, res as any)).toBe(true);
    expect(res.headersSent).toBe(true);
    stream.emit('error', error);

    expect(res.destroy).toHaveBeenCalledWith(error);
    expect(res.end).not.toHaveBeenCalled();
  });
});
