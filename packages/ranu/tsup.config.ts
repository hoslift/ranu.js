import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    react: 'src/react.ts',
    server: 'src/server.ts',
    plugin: 'src/plugin.ts',
    testing: 'src/testing.ts',
    devtools: 'src/devtools.ts',
    'server-only': 'src/server-only.ts',
    ai: 'src/ai.ts',
    'ai/gemini': 'src/ai/gemini.ts',
    'ai/groq': 'src/ai/groq.ts',
    'ai/claude': 'src/ai/claude.ts',
    'ai/openai': 'src/ai/openai.ts',
    'ai/custom': 'src/ai/custom.ts',
    'bin/ranu': 'src/bin/ranu.ts',
    'bin/ranujs': 'src/bin/ranu.ts',
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
