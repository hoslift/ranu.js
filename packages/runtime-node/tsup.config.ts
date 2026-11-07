import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@ranu/core',
    '@ranu/diagnostics',
    '@ranu/manifests',
    '@ranu/react',
    '@ranu/router',
    '@ranu/runtime',
    '@opentelemetry/api',
  ],
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
});
