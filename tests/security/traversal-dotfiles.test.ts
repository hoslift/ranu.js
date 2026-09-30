import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { serveStaticFile as serveDevStatic } from '@ranu/dev';
import { serveStaticFile as serveProdStatic } from '@ranu/runtime-node';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { cleanupAllProcesses } from '../helpers/process.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { fetchText } from '../helpers/http.js';
import { PATH_TRAVERSAL_VECTORS, DOTFILE_VECTORS } from './harness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

describe('Suites 3 & 4: Path Traversal & Dotfile Protection (path-traversal & static-file-escape)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Production Static Server: blocks all directory traversal attack vectors', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const publicDir = path.join(projectDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'hello.txt'), 'allowed public content', 'utf8');

    // Create sensitive file in project root outside publicDir
    const secretFile = path.join(projectDir, 'super-secret.txt');
    fs.writeFileSync(secretFile, 'CONFIDENTIAL_DATA_ROOT', 'utf8');

    const port = await getAvailablePort();
    const server = http.createServer((req, res) => {
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(req.url?.split('?')[0] ?? '/');
      } catch {
        decodedPath = req.url?.split('?')[0] ?? '/';
      }
      const targetFile = path.join(publicDir, decodedPath.replace(/^\//, ''));
      const served = serveProdStatic(targetFile, publicDir, req, res);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      // 1. Legitimate file returns 200
      const okRes = await fetchText(`http://127.0.0.1:${port}/hello.txt`);
      expect(okRes.status).toBe(200);
      expect(okRes.body).toBe('allowed public content');

      // 2. Traversal attack vectors return 403 or 404, never 200 with sensitive content
      for (const vector of PATH_TRAVERSAL_VECTORS) {
        const rawPath = vector.startsWith('/') ? vector : '/' + vector;
        const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            { host: '127.0.0.1', port, path: rawPath, method: 'GET' },
            (resp) => {
              let body = '';
              resp.setEncoding('utf8');
              resp.on('data', (c) => (body += c));
              resp.on('end', () => resolve({ status: resp.statusCode || 0, body }));
            },
          );
          req.on('error', reject);
          req.end();
        });

        expect(res.body).not.toContain('CONFIDENTIAL_DATA_ROOT');
        expect([403, 404]).toContain(res.status);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
      await cleanup();
    }
  });

  it('Development Static Server: blocks all directory traversal attack vectors', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const publicDir = path.join(projectDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'hello.txt'), 'dev public content', 'utf8');

    const secretFile = path.join(projectDir, 'dev-secret.txt');
    fs.writeFileSync(secretFile, 'DEV_SECRET_DATA', 'utf8');

    const port = await getAvailablePort();
    const server = http.createServer((req, res) => {
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(req.url?.split('?')[0] ?? '/');
      } catch {
        decodedPath = req.url?.split('?')[0] ?? '/';
      }
      const targetFile = path.join(publicDir, decodedPath.replace(/^\//, ''));
      const served = serveDevStatic(targetFile, publicDir, req, res);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      for (const vector of PATH_TRAVERSAL_VECTORS) {
        const rawPath = vector.startsWith('/') ? vector : '/' + vector;
        const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            { host: '127.0.0.1', port, path: rawPath, method: 'GET' },
            (resp) => {
              let body = '';
              resp.setEncoding('utf8');
              resp.on('data', (c) => (body += c));
              resp.on('end', () => resolve({ status: resp.statusCode || 0, body }));
            },
          );
          req.on('error', reject);
          req.end();
        });

        expect(res.body).not.toContain('DEV_SECRET_DATA');
        expect([403, 404]).toContain(res.status);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
      await cleanup();
    }
  });

  it('Dotfile Protection: strictly prohibits serving .env and other hidden dotfiles as static assets', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const publicDir = path.join(projectDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });

    // Seed dotfiles inside public folder
    fs.writeFileSync(path.join(publicDir, '.env'), 'DATABASE_PASSWORD=SuperSecretPassword123!', 'utf8');
    fs.writeFileSync(path.join(publicDir, '.env.local'), 'PRIVATE_LOCAL_KEY=abcd', 'utf8');
    fs.writeFileSync(path.join(publicDir, '.git'), 'git directory placeholder', 'utf8');

    const port = await getAvailablePort();
    const server = http.createServer((req, res) => {
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(req.url?.split('?')[0] ?? '/');
      } catch {
        decodedPath = req.url?.split('?')[0] ?? '/';
      }
      const targetFile = path.join(publicDir, decodedPath.replace(/^\//, ''));
      const served = serveProdStatic(targetFile, publicDir, req, res);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      for (const dotfile of DOTFILE_VECTORS) {
        const res = await fetchText(`http://127.0.0.1:${port}${dotfile}`);
        // Dotfile access must be forbidden (403) or not found (404), NEVER 200
        expect([403, 404]).toContain(res.status);
        expect(res.body).not.toContain('SuperSecretPassword123!');
        expect(res.body).not.toContain('PRIVATE_LOCAL_KEY');
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
      await cleanup();
    }
  });
});
