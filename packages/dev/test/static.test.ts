import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMimeType, serveStaticFile } from '../src/static.js';

describe('Development Static File Server', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-static-'));
  });

  afterEach(() => {
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

  it('serves files inside authorized root directory', () => {
    const filePath = path.join(tempDir, 'favicon.ico');
    fs.writeFileSync(filePath, 'fake-favicon');

    let responseCode = 0;
    const headers: Record<string, any> = {};
    let ended = false;

    const mockReq: any = { method: 'GET' };
    const mockRes: any = {
      writeHead(code: number, h: Record<string, any>) {
        responseCode = code;
        Object.assign(headers, h);
      },
      end() {
        ended = true;
      },
      on() {},
      once() {},
      emit() {},
    };

    const served = serveStaticFile(filePath, tempDir, mockReq, mockRes);
    expect(served).toBe(true);
    expect(responseCode).toBe(200);
    expect(headers['Content-Type']).toBe('image/x-icon');
  });

  it('rejects path traversal attempts escaping authorized root', () => {
    const outsidePath = path.join(os.tmpdir(), 'secret.txt');
    fs.writeFileSync(outsidePath, 'secret');

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
});
