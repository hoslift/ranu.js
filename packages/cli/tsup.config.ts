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
  external: ['@ranu/core', '@ranu/config', '@ranu/diagnostics', '@ranu/build', '@ranu/dev', '@ranu/runtime-node'],
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
