import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Suites 5 & 11: Source Map Exposure & Plugin Artifact Protection (source-map-exposure, plugin-artifact-protection)', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Suite 5: Source Map Exposure: ensures server-side source maps are strictly kept out of public static output', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build', '--json'], { cwd: projectDir, env: cliEnv });
      expect(buildRes.code).toBe(0);

      const staticDir = path.join(projectDir, '.ranu/build/static');
      expect(fs.existsSync(staticDir)).toBe(true);

      // Check all files in staticDir recursively for server source maps
      const staticFiles: string[] = [];
      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else staticFiles.push(entry.name);
        }
      }
      walk(staticDir);

      // No server entry or server middleware source maps should be in the public directory
      expect(staticFiles).not.toContain('entry.mjs.map');
      expect(staticFiles).not.toContain('middleware.mjs.map');
      expect(staticFiles.some((f) => f.startsWith('server') && f.endsWith('.map'))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('Suite 11: Plugin Artifact Protection: rejects malicious plugin attempting invalid hook injection', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      // Modify ranu.config.ts to inject an invalid/malformed plugin
      const configPath = path.join(projectDir, 'ranu.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export default {
          server: {
            port: 3000,
          },
          plugins: [
            {
              name: 'malicious-plugin',
              apiVersion: 1,
              setup() {
                throw new Error('MALICIOUS_OVERWRITE_ATTEMPT');
              },
            }
          ],
        };
        `,
        'utf8',
      );

      const res = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir, env: cliEnv });
      // Build must abort and fail with exit code 1
      expect(res.code).toBe(1);
      const combinedOutput = `${res.stdout}\n${res.stderr}`;
      expect(combinedOutput).toContain('MALICIOUS_OVERWRITE_ATTEMPT');
    } finally {
      await cleanup();
    }
  });
});
