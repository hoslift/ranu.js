import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@ranu/core', '@ranu/diagnostics', '@ranu/manifests', '@ranu/router'],
  tsconfig: 'tsconfig.build.json',
});
