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
  '@ranujs/adapter-vercel': path.resolve(__dirname, 'adapters/vercel/src/index.ts'),
  '@ranujs/core/config': path.resolve(__dirname, 'packages/ranu/src/config.ts'),
  '@ranujs/core/react': path.resolve(__dirname, 'packages/ranu/src/react.ts'),
  '@ranujs/core/server': path.resolve(__dirname, 'packages/ranu/src/server.ts'),
  '@ranujs/core/plugin': path.resolve(__dirname, 'packages/ranu/src/plugin.ts'),
  '@ranujs/core/server-only': path.resolve(__dirname, 'packages/ranu/src/server-only.ts'),
  '@ranujs/core': path.resolve(__dirname, 'packages/ranu/src/index.ts'),
  'create-ranujs': path.resolve(__dirname, 'create-ranu/src/index.ts'),
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
      alias: {
        '@ranujs/core/config': path.resolve(__dirname, 'packages/ranu/dist/config.js'),
        '@ranujs/core/react': path.resolve(__dirname, 'packages/ranu/dist/react.js'),
        '@ranujs/core/server': path.resolve(__dirname, 'packages/ranu/dist/server.js'),
        '@ranujs/core/plugin': path.resolve(__dirname, 'packages/ranu/dist/plugin.js'),
        '@ranujs/core/server-only': path.resolve(__dirname, 'packages/ranu/dist/server-only.js'),
        '@ranujs/core': path.resolve(__dirname, 'packages/ranu/dist/index.js'),
        '@ranujs/adapter-vercel': path.resolve(__dirname, 'adapters/vercel/dist/index.js'),
        'ranu/config': path.resolve(__dirname, 'packages/ranu/dist/config.js'),
        'ranu/react': path.resolve(__dirname, 'packages/ranu/dist/react.js'),
        'ranu/server': path.resolve(__dirname, 'packages/ranu/dist/server.js'),
        'ranu/plugin': path.resolve(__dirname, 'packages/ranu/dist/plugin.js'),
        'ranu/server-only': path.resolve(__dirname, 'packages/ranu/dist/server-only.js'),
        ranu: path.resolve(__dirname, 'packages/ranu/dist/index.js'),
        '@ranu/core': path.resolve(__dirname, 'packages/core/dist/index.js'),
        '@ranu/diagnostics': path.resolve(__dirname, 'packages/diagnostics/dist/index.js'),
        '@ranu/manifests': path.resolve(__dirname, 'packages/manifests/dist/index.js'),
        '@ranu/config': path.resolve(__dirname, 'packages/config/dist/index.js'),
        '@ranu/router': path.resolve(__dirname, 'packages/router/dist/index.js'),
        '@ranu/runtime': path.resolve(__dirname, 'packages/runtime/dist/index.js'),
        '@ranu/runtime-node': path.resolve(__dirname, 'packages/runtime-node/dist/index.js'),
        '@ranu/server': path.resolve(__dirname, 'packages/server/dist/index.js'),
        '@ranu/react': path.resolve(__dirname, 'packages/react/dist/index.js'),
        '@ranu/build': path.resolve(__dirname, 'packages/build/dist/index.js'),
        '@ranu/dev': path.resolve(__dirname, 'packages/dev/dist/index.js'),
        '@ranu/cli': path.resolve(__dirname, 'packages/cli/dist/index.js'),
        '@ranu/plugin': path.resolve(__dirname, 'packages/plugin/dist/index.js'),
      },
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'cli',
      include: ['tests/cli/**/*.test.ts'],
      testTimeout: 60000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'deployment',
      include: ['tests/deployment/**/*.test.ts'],
      testTimeout: 120000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'security',
      include: ['tests/security/**/*.test.ts'],
      testTimeout: 60000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'performance',
      include: ['tests/performance/**/*.test.ts'],
      testTimeout: 120000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'smoke',
      include: ['tests/smoke/**/*.test.ts'],
      testTimeout: 180000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
  {
    test: {
      ...sharedTestConfig,
      name: 'examples',
      include: ['tests/examples/**/*.test.ts'],
      testTimeout: 240000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: sharedAliases,
    },
  },
]);
