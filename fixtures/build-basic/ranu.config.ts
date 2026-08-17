import { defineConfig } from '@ranu/config';

export default defineConfig({
  server: {
    port: 3000,
  },
  rendering: {
    defaultMode: 'server',
  },
});
