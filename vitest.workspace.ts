import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sharedAliases = {
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
  '@ranu/adapter-vercel': path.resolve(__dirname, 'adapters/vercel/src/index.ts'),
  'ranu/config': path.resolve(__dirname, 'packages/ranu/src/config.ts'),
  'ranu/react': path.resolve(__dirname, 'packages/ranu/src/react.ts'),
  'ranu/server': path.resolve(__dirname, 'packages/ranu/src/server.ts'),
  'ranu/plugin': path.resolve(__dirname, 'packages/ranu/src/plugin.ts'),
  'ranu/server-only': path.resolve(__dirname, 'packages/ranu/src/server-only.ts'),
  'create-ranu': path.resolve(__dirname, 'create-ranu/src/index.ts'),
  ranu: path.resolve(__dirname, 'packages/ranu/src/index.ts'),
};

const sharedTestConfig = {
  setupFiles: [path.resolve(__dirname, 'tests/setup.ts')],
};

export default defineWorkspace([
  {
    test: {
      ...sharedTestConfig,
      name: 'packages',
      include: ['packages/*/test/**/*.{test,spec}.{ts,tsx}'],
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'adapters',
      include: ['adapters/*/test/**/*.{test,spec}.{ts,tsx}'],
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'create-ranu',
      include: ['create-ranu/test/**/*.{test,spec}.{ts,tsx}'],
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'api',
      include: ['tests/api/**/*.test.ts'],
    },
    resolve: {
      alias: [
        {
          find: /^ranu$/,
          replacement: path.resolve(__dirname, 'packages/ranu/dist/index.js'),
        },
        {
          find: /^ranu\/(.*)$/,
          replacement: path.resolve(__dirname, 'packages/ranu/dist/$1.js'),
        },
        {
          find: /^@ranu\/(.*)$/,
          replacement: path.resolve(__dirname, 'packages/$1/dist/index.js'),
        },
      ],
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
    },
  },
]);
