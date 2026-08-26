import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffoldProject, validateProjectName, validateTargetDirectory } from '../../create-ranu/src/index.js';
import { build } from '@ranu/build';

describe('create-ranu integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.resolve(__dirname, '../../fixtures/temp-scaffold-test');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a complete Ranu.js app and builds successfully with @ranu/build', async () => {
    const projectDir = path.join(tempDir, 'sample-app');

    const result = await scaffoldProject({
      projectPath: projectDir,
      packageManager: 'pnpm',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.filesCreated).toContain('package.json');
    expect(result.filesCreated).toContain('ranu.config.ts');
    expect(result.filesCreated).toContain('app/layout.tsx');
    expect(result.filesCreated).toContain('app/page.tsx');
    expect(result.filesCreated).toContain('tsconfig.json');
    expect(result.filesCreated).toContain('.gitignore');
    expect(result.filesCreated).toContain('README.md');
    expect(result.filesCreated).toContain('public/robots.txt');

    const buildResult = await build({
      projectRoot: projectDir,
      mode: 'production',
      minify: false,
      sourceMaps: false,
    });

    if (!buildResult.success) {
      console.error('Build Diagnostics:', JSON.stringify(buildResult.diagnostics, null, 2));
    }

    expect(buildResult.success).toBe(true);
    expect(buildResult.buildId).toBeDefined();
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'server', 'entry.mjs'))).toBe(true);
  });

  it('rejects path traversal and invalid target paths safely', () => {
    const nameValidation = validateProjectName('../sneaky-name');
    expect(nameValidation.valid).toBe(false);

    const dirValidation = validateTargetDirectory(path.parse(tempDir).root);
    expect(dirValidation.valid).toBe(false);
  });
});
