import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  generateDockerfile,
  generateDockerignore,
  writeContainerArtifacts,
} from '../src/index.js';

describe('@ranu/build — Container Deployment', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-container-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateDockerfile', () => {
    it('uses npm install when lockfile availability is unknown', () => {
      const dockerfile = generateDockerfile();

      expect(dockerfile).toContain('FROM node:22-alpine AS build');
      expect(dockerfile).toContain('RUN npm install');
      expect(dockerfile).not.toContain('RUN npm ci');
      expect(dockerfile).toContain('RUN npm run build');
      expect(dockerfile).toContain('RUN npm prune --production');
      expect(dockerfile).toContain('FROM node:22-alpine AS runtime');
      expect(dockerfile).toContain('ENV NODE_ENV=production');
      expect(dockerfile).toContain('USER node');
      expect(dockerfile).toContain('EXPOSE 3000');
      expect(dockerfile).toContain('CMD ["node",".ranu/build/server/entry.mjs"]');
    });

    it('generates pnpm multi-stage Dockerfile when requested', () => {
      const dockerfile = generateDockerfile({
        packageManager: 'pnpm',
        port: 8080,
        nodeVersion: '22-bookworm-slim',
      });

      expect(dockerfile).toContain('FROM node:22-bookworm-slim AS build');
      expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml ./');
      expect(dockerfile).toContain('RUN corepack enable && pnpm install --frozen-lockfile');
      expect(dockerfile).toContain('RUN pnpm run build');
      expect(dockerfile).toContain('RUN pnpm prune --prod');
      expect(dockerfile).toContain('ENV PORT=8080');
      expect(dockerfile).toContain('EXPOSE 8080');
    });

    it('generates yarn multi-stage Dockerfile when requested', () => {
      const dockerfile = generateDockerfile({
        packageManager: 'yarn',
        port: 4000,
      });

      expect(dockerfile).toContain('COPY package.json yarn.lock ./');
      expect(dockerfile).toContain('RUN yarn install --frozen-lockfile');
      expect(dockerfile).toContain('RUN yarn run build');
      expect(dockerfile).toContain('RUN yarn install --production --ignore-scripts --prefer-offline');
    });

    it('supports root user when nonRoot option is false', () => {
      const dockerfile = generateDockerfile({ nonRoot: false });
      expect(dockerfile).not.toContain('USER node');
    });

    it('uses npm ci when an npm lockfile is available', () => {
      expect(generateDockerfile({ npmLockfile: true })).toContain('RUN npm ci');
    });
  });

  describe('generateDockerignore', () => {
    it('generates standard ignore rules including base and local .env files', () => {
      const ignore = generateDockerignore();
      expect(ignore).toContain('.git');
      expect(ignore).toContain('node_modules');
      expect(ignore).toContain('.ranu/dev');
      expect(ignore).toContain('.env');
      expect(ignore).toContain('.env.*');
    });
  });

  describe('writeContainerArtifacts', () => {
    it('writes Dockerfile and .dockerignore into project root', () => {
      const res = writeContainerArtifacts(tempDir);
      expect(res.written).toBe(true);

      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      const dockerignorePath = path.join(tempDir, '.dockerignore');

      expect(fs.existsSync(dockerfilePath)).toBe(true);
      expect(fs.existsSync(dockerignorePath)).toBe(true);

      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');
      expect(dockerfileContent).toContain('FROM node:22-alpine AS build');
      expect(dockerfileContent).toContain('RUN npm install');
    });

    it('does not overwrite existing files when overwrite is false', () => {
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      fs.writeFileSync(dockerfilePath, '# Custom Dockerfile');

      const res = writeContainerArtifacts(tempDir, {}, false);
      expect(fs.readFileSync(dockerfilePath, 'utf8')).toBe('# Custom Dockerfile');
    });

    it('overwrites existing regular files when requested', () => {
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      fs.writeFileSync(dockerfilePath, '# Custom Dockerfile');

      expect(writeContainerArtifacts(tempDir, {}, true).written).toBe(true);
      expect(fs.readFileSync(dockerfilePath, 'utf8')).toContain('FROM node:22-alpine AS build');
    });

    it('detects npm lockfiles when writing artifacts', () => {
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '{}');

      writeContainerArtifacts(tempDir);

      expect(fs.readFileSync(path.join(tempDir, 'Dockerfile'), 'utf8')).toContain('RUN npm ci');
    });

    it('does not follow output symlinks', () => {
      const outsideFile = path.join(tempDir, 'outside');
      const dockerfilePath = path.join(tempDir, 'Dockerfile');
      fs.writeFileSync(outsideFile, 'outside');

      try {
        fs.symlinkSync(outsideFile, dockerfilePath);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES')
        ) {
          return;
        }
        throw error;
      }

      expect(() => writeContainerArtifacts(tempDir, {}, true)).toThrow();
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('outside');
    });

    it('does not follow dangling output symlinks', () => {
      const missingTarget = path.join(tempDir, 'missing');
      fs.symlinkSync(missingTarget, path.join(tempDir, '.dockerignore'));

      expect(writeContainerArtifacts(tempDir).written).toBe(true);
      expect(fs.existsSync(missingTarget)).toBe(false);
    });
  });
});
