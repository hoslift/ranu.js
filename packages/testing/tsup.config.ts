import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@ranu/core',
    '@ranu/manifests',
    '@ranu/router',
    '@ranu/runtime',
    '@ranu/runtime-node',
    '@ranu/server',
  ],
  tsconfig: 'tsconfig.build.json',
});
