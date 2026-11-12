import { definePlugin, type RanuPlugin } from '@ranu/plugin';

export interface CustomPluginOptions {
  enabled?: boolean;
}

export function customPlugin(options: CustomPluginOptions = {}): RanuPlugin {
  return definePlugin({
    name: '@ranujs/plugin-custom',
    apiVersion: 1,
    version: '0.1.0',
    setup(context) {
      if (options.enabled ?? true) {
        context.logger.info('Custom Ranu.js plugin initialized');
      }
    },
  });
}

export default customPlugin;
