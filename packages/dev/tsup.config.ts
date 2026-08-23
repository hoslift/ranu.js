import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  external: [
    '@ranu/core',
    '@ranu/build',
    '@ranu/config',
    '@ranu/diagnostics',
    '@ranu/runtime',
    '@ranu/runtime-node',
    '@ranu/router',
    '@ranu/manifests',
    '@ranu/react',
  ],
});
