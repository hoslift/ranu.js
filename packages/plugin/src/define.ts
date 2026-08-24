import type { RanuPluginDefinition } from './types.js';

/**
 * Define an authoritative Ranu.js Plugin (Plugin API v1).
 * Validates metadata and enforce tier.
 */
export function definePlugin(definition: RanuPluginDefinition): RanuPluginDefinition {
  if (!definition || typeof definition !== 'object') {
    throw new Error('RANU_PLUGIN_INVALID: Plugin definition must be an object');
  }

  if (!definition.name || typeof definition.name !== 'string' || definition.name.trim() === '') {
    throw new Error('RANU_PLUGIN_INVALID: Plugin definition must specify a non-empty string "name"');
  }

  if (definition.apiVersion !== 1) {
    throw new Error(
      `RANU_PLUGIN_INCOMPATIBLE: Unsupported plugin apiVersion "${(definition as any).apiVersion}". Ranu.js supports Plugin API v1 (apiVersion: 1).`
    );
  }

  if (
    definition.enforce !== undefined &&
    definition.enforce !== 'pre' &&
    definition.enforce !== 'normal' &&
    definition.enforce !== 'post'
  ) {
    throw new Error(
      `RANU_PLUGIN_INVALID: Invalid enforce tier "${definition.enforce}". Must be "pre", "normal", or "post".`
    );
  }

  if (typeof definition.setup !== 'function') {
    throw new Error(
      `RANU_PLUGIN_INVALID: Plugin "${definition.name}" must implement a setup(context) function.`
    );
  }

  return definition;
}
