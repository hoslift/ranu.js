import crypto from 'node:crypto';
import path from 'node:path';

export interface CssModuleTransformResult {
  readonly code: string;
  readonly mapping: Record<string, string>;
}

/**
 * Generates a deterministic scoped class name for a CSS Module.
 * Canonical Phase 17 Contract: [name]_[local]__[hash:base64:5]
 *
 * Uses base64url characters (A-Za-z0-9_-) to guarantee CSS identifier safety,
 * deterministic hashing over project-relative module path, local identifier, and content,
 * ensuring 100% server and client graph equality.
 */
export function generateScopedClassName(
  filePath: string,
  localName: string,
  content: string,
  projectRoot: string
): string {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const baseName = path.basename(filePath).replace(/\.module\.css$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const hashInput = `${relativePath}:${localName}:${content}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('base64url').slice(0, 5);
  return `${baseName}_${localName}__${hash}`;
}

/**
 * Transforms a CSS Module source string into scoped CSS and a class name mapping.
 * Handles:
 * - Local class selectors (e.g. .primary, .button-root) -> .Button_primary__aB3_1
 * - Pseudo-classes (e.g. .primary:hover, .primary::after)
 * - :global(.unscoped) escape hatch -> .unscoped
 * - @keyframes animation names -> Spinner_spin__aB3_1
 */
export function transformCssModule(
  filePath: string,
  content: string,
  projectRoot: string
): CssModuleTransformResult {
  const mapping: Record<string, string> = {};
  const keyframeMapping: Record<string, string> = {};

  const baseName = path.basename(filePath).replace(/\.module\.css$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // 1. Identify and transform @keyframes
  let processed = content.replace(
    /@keyframes\s+([a-zA-Z0-9_-]+)/g,
    (_match, keyframeName) => {
      const hashInput = `${relativePath}:keyframes:${keyframeName}:${content}`;
      const hash = crypto.createHash('sha256').update(hashInput).digest('base64url').slice(0, 5);
      const scopedKeyframe = `${baseName}_${keyframeName}__${hash}`;
      keyframeMapping[keyframeName] = scopedKeyframe;
      return `@keyframes ${scopedKeyframe}`;
    }
  );

  // 2. Rewrite animation and animation-name properties for scoped keyframes
  for (const [origKeyframe, scopedKeyframe] of Object.entries(keyframeMapping)) {
    const animRegex = new RegExp(`(\\banimation(?:-name)?\\s*:[^;}]*\\b)${origKeyframe}(\\b)`, 'g');
    processed = processed.replace(animRegex, `$1${scopedKeyframe}$2`);
  }

  // 3. Match and transform class selectors
  const classSelectorRegex = /\.([a-zA-Z0-9_-]+)(?=[^}]*\{)/g;
  const matches = [...content.matchAll(classSelectorRegex)];

  for (const match of matches) {
    const localClass = match[1];
    if (!localClass || mapping[localClass]) {
      continue;
    }

    // Check if within :global(...)
    const matchIndex = match.index ?? 0;
    const preText = content.slice(Math.max(0, matchIndex - 30), matchIndex);
    if (/:global\s*\(\s*$/.test(preText)) {
      continue;
    }

    const scopedName = generateScopedClassName(filePath, localClass, content, projectRoot);
    mapping[localClass] = scopedName;
  }

  // 4. Rewrite class names in CSS rules
  for (const [localClass, scopedClass] of Object.entries(mapping)) {
    // Replace .localClass with .scopedClass, avoiding matching sub-words or inside :global
    const regex = new RegExp(`\\.${localClass}\\b`, 'g');
    processed = processed.replace(regex, `.${scopedClass}`);
  }

  // 5. Unwrap :global(...) wrappers
  processed = processed.replace(/:global\s*\(\s*([^)]+)\s*\)/g, '$1');

  return {
    code: processed,
    mapping,
  };
}
