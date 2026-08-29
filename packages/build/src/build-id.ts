import { randomBytes } from 'node:crypto';

/**
 * Generate a canonical Ranu.js build ID.
 *
 * Characteristics:
 * - Deterministic format: base36 timestamp (9 chars) + cryptographic random hex (20 chars)
 * - Total length: 29 chars
 * - Lexicographically sortable / time-sortable prefix
 * - Filesystem safe (alphanumeric only)
 * - Header safe (no special characters or whitespace)
 * - No secret semantics
 */
export function generateBuildId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomBytes(10).toString('hex');
  return `${ts}${rand}`;
}

/**
 * Validates that a string is a valid build ID format.
 */
export function isValidBuildId(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    return false;
  }
  // Must be alphanumeric, hyphen, underscore only
  return /^[a-zA-Z0-9_-]+$/.test(id);
}
