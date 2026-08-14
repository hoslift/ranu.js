import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['@ranu/core', '@ranu/build', '@ranu/config', '@ranu/diagnostics', '@ranu/runtime-node', '@ranu/router', '@ranu/react'],
  platform: 'node',
});
