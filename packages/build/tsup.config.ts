import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@ranu/config',
    '@ranu/core',
    '@ranu/diagnostics',
    '@ranu/manifests',
    '@ranu/plugin',
    '@ranu/react',
    '@ranu/router',
    '@ranu/runtime',
    '@ranu/server',
    'esbuild',
    'typescript',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
});
