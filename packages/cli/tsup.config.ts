import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/ranu': 'src/bin/ranu.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@ranu/core',
    '@ranu/config',
    '@ranu/diagnostics',
    '@ranu/build',
    '@ranu/dev',
    '@ranu/runtime-node',
    '@ranu/adapter-vercel',
  ],
  platform: 'node',
  banner: ({ entry }) => {
    if (entry === 'src/bin/ranu.ts') {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
  tsconfig: 'tsconfig.build.json',
});
