import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  banner: {
    js: "'use client';\n",
  },
  external: [
    'react',
    'react-dom',
    '@ranu/core',
    '@ranu/diagnostics',
  ],
  tsconfig: 'tsconfig.build.json',
});
