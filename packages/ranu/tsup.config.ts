import fs from 'node:fs';
import path from 'node:path';
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
  banner: ({ entry }: { entry?: string } = {}) => {
    if (entry && (entry.includes('bin') || entry.includes('ranu.ts') || entry.includes('ranu.js'))) {
      return { js: '#!/usr/bin/env node\n' };
    }
    if (entry === 'devtools' || (entry && entry.includes('devtools'))) {
      return { js: "'use client';\n" };
    }
    return {};
  },
  onSuccess: async () => {
    const devtoolsPath = path.resolve('dist/devtools.js');
    if (fs.existsSync(devtoolsPath)) {
      const content = fs.readFileSync(devtoolsPath, 'utf8');
      if (!content.startsWith("'use client';") && !content.startsWith('"use client";')) {
        fs.writeFileSync(devtoolsPath, `'use client';\n${content}`, 'utf8');
      }
    }
  },
  tsconfig: 'tsconfig.build.json',
});
