import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { serveStaticFile } from '@ranu/dev';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { scanDirectoryForSecrets, PATH_TRAVERSAL_VECTORS } from './harness.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { fetchText } from '../helpers/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

describe('Phase 28 — Security Regression Infrastructure Harness', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Secret Scanning Harness: detects seeded server private secret if present in client artifacts', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-boundaries', root);
    const privateSecret = 'RANU_TEST_PRIVATE_SECRET_9f3c8a1b2d';

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      const clientOutDir = path.join(projectDir, '.ranu/build/client');
      // CodeRabbit suggestion: Assert client artifact directory exists to prevent false passes
      expect(fs.existsSync(clientOutDir)).toBe(true);

      const scan = scanDirectoryForSecrets(clientOutDir, [privateSecret]);
      expect(scan.leaked).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('Traversal Vector Harness: executes standardized path traversal vectors against static server and confirms containment', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const publicDir = path.join(projectDir, 'public');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'hello.txt'), 'public file content', 'utf8');

    // Create sensitive file outside public directory
    const sensitiveFile = path.join(projectDir, 'sensitive.txt');
    fs.writeFileSync(sensitiveFile, 'TOP_SECRET_DATA_DO_NOT_LEAK', 'utf8');

    const port = await getAvailablePort();

    const server = http.createServer((req, res) => {
      // Decode URL safely to simulate real HTTP static request handling
      const reqUrl = req.url ?? '/';
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(reqUrl.split('?')[0]);
      } catch {
        decodedPath = reqUrl.split('?')[0];
      }

      const filePath = path.join(publicDir, decodedPath.replace(/^\//, ''));
      const served = serveStaticFile(filePath, publicDir, req, res);
      if (!served) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));

    try {
      // 1. Legitimate static file request returns 200
      const normalRes = await fetchText(`http://127.0.0.1:${port}/hello.txt`);
      expect(normalRes.status).toBe(200);
      expect(normalRes.body).toBe('public file content');

      // 2. Traversal attack vectors: send literal unnormalized request paths over raw HTTP
      for (const vector of PATH_TRAVERSAL_VECTORS) {
        const rawPath = vector.startsWith('/') ? vector : '/' + vector;
        const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
          const req = http.request(
            {
              host: '127.0.0.1',
              port,
              path: rawPath,
              method: 'GET',
            },
            (resp) => {
              let body = '';
              resp.setEncoding('utf8');
              resp.on('data', (chunk) => (body += chunk));
              resp.on('end', () => resolve({ status: resp.statusCode || 0, body }));
            },
          );
          req.on('error', reject);
          req.end();
        });

        // Traversal attempts must either be 403 Forbidden or 404 Not Found, never 200 returning sensitive content
        expect(res.body).not.toContain('TOP_SECRET_DATA_DO_NOT_LEAK');
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      releasePort(port);
      await cleanup();
    }
  });
});
