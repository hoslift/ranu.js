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
      '@ranu/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
      '@ranu/router': path.resolve(__dirname, '../../packages/router/src/index.ts'),
      '@ranu/runtime': path.resolve(__dirname, '../../packages/runtime/src/index.ts'),
      '@ranu/runtime-node': path.resolve(__dirname, '../../packages/runtime-node/src/index.ts'),
      '@ranu/server': path.resolve(__dirname, '../../packages/server/src/index.ts'),
      '@ranu/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
      '@ranu/build': path.resolve(__dirname, '../../packages/build/src/index.ts'),
      '@ranu/dev': path.resolve(__dirname, '../../packages/dev/src/index.ts'),
      '@ranu/cli': path.resolve(__dirname, '../../packages/cli/src/index.ts'),
      '@ranu/plugin': path.resolve(__dirname, '../../packages/plugin/src/index.ts'),
      '@ranujs/adapter-bun': path.resolve(__dirname, 'src/index.ts'),
    },
  },
});
