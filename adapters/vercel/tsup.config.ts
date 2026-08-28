import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@ranu/core', '@ranu/manifests', '@ranu/runtime-node', 'esbuild'],
  tsconfig: 'tsconfig.build.json',
});
