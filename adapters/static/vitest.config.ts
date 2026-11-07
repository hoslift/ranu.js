import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: [path.resolve(__dirname, '../../tests/setup.ts')],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@ranu/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@ranu/diagnostics': path.resolve(__dirname, '../../packages/diagnostics/src/index.ts'),
      '@ranu/manifests': path.resolve(__dirname, '../../packages/manifests/src/index.ts'),
      '@ranujs/adapter-static': path.resolve(__dirname, 'src/index.ts'),
    },
  },
});
