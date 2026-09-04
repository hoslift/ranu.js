/**
 * Ranu.js
 *
 * Public entry point for the Ranu.js framework.
 * Phase 0 skeleton — no implementation yet.
 *
 * @packageDocumentation
 */

export const RANU_VERSION = '0.0.0';

// Canonical configuration import is "ranu/config".
// Convenience re-exports from root package per 11_PUBLIC_API_SPECIFICATION.md §11-12:
export { defineConfig } from '@ranu/config';
export type { RanuUserConfig, RanuConfigContext } from '@ranu/config';

export type {
  RenderMode,
  StaticParamValue,
  StaticParamRecord,
  GenerateStaticParamsResult,
  GenerateStaticParams,
} from '@ranu/core';
