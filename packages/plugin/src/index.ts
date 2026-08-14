/**
 * @ranu/plugin
 *
 * definePlugin(), Plugin API v1 types, plugin manager, hook runner.
 * Internal package — not public application API.
 * Exposed through Ranu.js/plugin public subpath.
 *
 * Phase 0 skeleton — full implementation in Phase 21.
 */

/** A Ranu.js plugin definition */
export interface RanuPlugin {
  name: string;
  version?: string;
}

/**
 * Define a Ranu.js plugin.
 * Stub — full implementation in Phase 21.
 */
export function definePlugin(plugin: RanuPlugin): RanuPlugin {
  if (!plugin.name) {
    throw new Error('Ranu.js plugin must have a name');
  }
  return plugin;
}
