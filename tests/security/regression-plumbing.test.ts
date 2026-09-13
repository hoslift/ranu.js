import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { scanDirectoryForSecrets, PATH_TRAVERSAL_VECTORS } from './harness.js';

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
      // Build boundaries fixture
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      const clientOutDir = path.join(projectDir, '.ranu/build/client');
      if (fs.existsSync(clientOutDir)) {
        const scan = scanDirectoryForSecrets(clientOutDir, [privateSecret]);
        expect(scan.leaked).toBe(false);
      }
    } finally {
      await cleanup();
    }
  });

  it('Traversal Vector Harness: provides standardized path traversal test vectors for router and runtime verification', () => {
    expect(PATH_TRAVERSAL_VECTORS.length).toBeGreaterThanOrEqual(8);
    for (const vector of PATH_TRAVERSAL_VECTORS) {
      expect(typeof vector).toBe('string');
      expect(vector.length).toBeGreaterThan(0);
    }
  });
});
