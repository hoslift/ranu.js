import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineWorkspace([
  'packages/*',
  'adapters/*',
  'create-ranu',
  {
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
    },
    resolve: {
      alias: {
        '@ranu/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
        '@ranu/diagnostics': path.resolve(__dirname, 'packages/diagnostics/src/index.ts'),
        '@ranu/manifests': path.resolve(__dirname, 'packages/manifests/src/index.ts'),
        '@ranu/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
        '@ranu/router': path.resolve(__dirname, 'packages/router/src/index.ts'),
        '@ranu/runtime': path.resolve(__dirname, 'packages/runtime/src/index.ts'),
        '@ranu/runtime-node': path.resolve(__dirname, 'packages/runtime-node/src/index.ts'),
        '@ranu/server': path.resolve(__dirname, 'packages/server/src/index.ts'),
        '@ranu/react': path.resolve(__dirname, 'packages/react/src/index.ts'),
        '@ranu/build': path.resolve(__dirname, 'packages/build/src/index.ts'),
        '@ranu/dev': path.resolve(__dirname, 'packages/dev/src/index.ts'),
        '@ranu/cli': path.resolve(__dirname, 'packages/cli/src/index.ts'),
        '@ranu/plugin': path.resolve(__dirname, 'packages/plugin/src/index.ts'),
        'ranu/config': path.resolve(__dirname, 'packages/ranu/src/config.ts'),
        'ranu/react': path.resolve(__dirname, 'packages/ranu/src/react.ts'),
        'ranu/server': path.resolve(__dirname, 'packages/ranu/src/server.ts'),
        'ranu/plugin': path.resolve(__dirname, 'packages/ranu/src/plugin.ts'),
        'create-ranu': path.resolve(__dirname, 'create-ranu/src/index.ts'),
        'ranu': path.resolve(__dirname, 'packages/ranu/src/index.ts'),
      },
    },
  },
  {
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
    },
  },
]);
