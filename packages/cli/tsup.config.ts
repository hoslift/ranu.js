import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/ranu': 'src/bin/ranu.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    '@ranu/core',
    '@ranu/config',
    '@ranu/diagnostics',
    '@ranu/build',
    '@ranu/router',
    '@ranu/manifests',
    '@ranu/dev',
    '@ranu/runtime-node',
    '@ranu/ai',
    '@ranu/ai-gemini',
    '@ranu/ai-groq',
    '@ranu/ai-claude',
    '@ranu/ai-openai',
    '@ranu/ai-custom',
    '@ranujs/adapter-vercel',
    '@ranujs/adapter-cloudflare',
    '@ranujs/adapter-node',
    '@ranujs/adapter-netlify',
    '@ranujs/adapter-bun',
    '@ranujs/adapter-deno',
  ],
  platform: 'node',
  banner: ({ entry }) => {
    if (entry === 'src/bin/ranu.ts') {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
  tsconfig: 'tsconfig.build.json',
});
