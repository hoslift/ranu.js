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
  tsconfig: 'tsconfig.build.json',
  banner: ({ entry }) => {
    if (entry === 'bin/create-ranu') {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
});
