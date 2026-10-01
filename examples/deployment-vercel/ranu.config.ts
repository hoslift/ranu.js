import { defineConfig } from '@hoslift/ranu/config';
import { vercelAdapter } from '@hoslift/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      runtimeVersion: 'nodejs22.x',
    }),
  },
});
