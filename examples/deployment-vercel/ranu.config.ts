import { defineConfig } from '@ranujs/core/config';
import { vercelAdapter } from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      runtimeVersion: 'nodejs22.x',
    }),
  },
});
