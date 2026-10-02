import { definePlugin } from '@ranujs/core/plugin';

export function bannerPlugin(options: { text: string }) {
  return definePlugin({
    name: 'ranu-banner-plugin',
    apiVersion: 1,
    version: '1.0.0',
    setup(context) {
      context.logger.info(`[banner-plugin] Active banner configured: "${options.text}"`);
    },
  });
}
