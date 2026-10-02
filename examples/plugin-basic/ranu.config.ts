import { defineConfig } from 'ranu/config';
import { definePlugin } from 'ranu/plugin';

export const bannerPlugin = (options: { text: string }) =>
  definePlugin({
    name: 'ranu-banner-plugin',
    apiVersion: 1,
    version: '1.0.0',
    setup(context) {
      context.logger.info(`[banner-plugin] Active banner configured: "${options.text}"`);
    },
  });

export default defineConfig({
  plugins: [bannerPlugin({ text: 'Welcome to Ranu.js Ecosystem' })],
  server: {
    port: 3000,
  },
});
