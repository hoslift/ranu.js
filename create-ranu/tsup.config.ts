import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/create-ranu': 'src/bin/create-ranu.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'node',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
