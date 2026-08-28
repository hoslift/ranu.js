import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    react: 'src/react.ts',
    server: 'src/server.ts',
    plugin: 'src/plugin.ts',
    'server-only': 'src/server-only.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    '@ranu/config',
    '@ranu/core',
    '@ranu/plugin',
    '@ranu/react',
    '@ranu/server',
  ],
  tsconfig: 'tsconfig.build.json',
});
