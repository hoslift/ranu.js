import type { PluginLogger } from './types.js';

/**
 * Creates a standard PluginLogger tagged with the plugin's identity.
 */
export function createPluginLogger(pluginName: string): PluginLogger {
  const prefix = `[plugin:${pluginName}]`;

  return {
    info(message: string, ...args: unknown[]) {
      console.log(`${prefix} ${message}`, ...args);
    },
    warn(message: string, ...args: unknown[]) {
      console.warn(`${prefix} ${message}`, ...args);
    },
    error(message: string, ...args: unknown[]) {
      console.error(`${prefix} ${message}`, ...args);
    },
    debug(message: string, ...args: unknown[]) {
      if (process.env.DEBUG || process.env.RANU_DEBUG) {
        console.debug(`${prefix} ${message}`, ...args);
      }
    },
  };
}
