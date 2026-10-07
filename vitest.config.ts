import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import projects from './vitest.workspace.ts';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

export default defineConfig(() => {
  const isRoot = path.resolve(process.cwd()) === path.resolve(rootDir);
  if (!isRoot) {
    return {
      test: {
        include: ['test/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
      },
    };
  }
  return {
    test: {
      root: rootDir,
      projects,
    },
  };
});
