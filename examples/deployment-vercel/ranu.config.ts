import { defineConfig } from 'ranu/config';
import { vercelAdapter } from '@ranu/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      runtimeVersion: 'nodejs22.x',
    }),
  },
});
