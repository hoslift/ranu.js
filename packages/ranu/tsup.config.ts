import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    react: 'src/react.ts',
    server: 'src/server.ts',
    plugin: 'src/plugin.ts',
    'server-only': 'src/server-only.ts',
    'bin/ranu': 'src/bin/ranu.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'esbuild',
    'dotenv',
    'typescript',
  ],
  noExternal: [/@ranu\/.*/],
  banner: ({ entry }) => {
    if (entry && (entry.includes('bin') || entry.includes('ranu.ts') || entry.includes('ranu.js'))) {
      return { js: '#!/usr/bin/env node\n' };
    }
    return {};
  },
  tsconfig: 'tsconfig.build.json',
});
