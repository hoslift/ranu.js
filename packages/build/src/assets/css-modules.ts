import crypto from 'node:crypto';
import path from 'node:path';

export interface CssModuleTransformResult {
  readonly code: string;
  readonly mapping: Record<string, string>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  projectRoot: string,
): string {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const baseName = path
    .basename(filePath)
    .replace(/\.module\.css$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
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
  projectRoot: string,
): CssModuleTransformResult {
  const mapping: Record<string, string> = {};
  const keyframeMapping: Record<string, string> = {};

  const baseName = path
    .basename(filePath)
    .replace(/\.module\.css$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  // 1. Identify and transform @keyframes
  let processed = content.replace(/@keyframes\s+([a-zA-Z0-9_-]+)/g, (_match, keyframeName) => {
    const hashInput = `${relativePath}:keyframes:${keyframeName}:${content}`;
    const hash = crypto.createHash('sha256').update(hashInput).digest('base64url').slice(0, 5);
    const scopedKeyframe = `${baseName}_${keyframeName}__${hash}`;
    keyframeMapping[keyframeName] = scopedKeyframe;
    return `@keyframes ${scopedKeyframe}`;
  });

  // 2. Rewrite animation and animation-name properties for scoped keyframes
  for (const [origKeyframe, scopedKeyframe] of Object.entries(keyframeMapping)) {
    const animRegex = new RegExp(`(\\banimation(?:-name)?\\s*:[^;}]*\\b)${origKeyframe}(\\b)`, 'g');
    processed = processed.replace(animRegex, `$1${scopedKeyframe}$2`);
  }

  // 3. Collect class names only from rule selector preludes, not declaration values.
  const classSelectorRegex = /\.([_a-zA-Z][a-zA-Z0-9_-]*)/g;
  for (
    let braceIndex = content.indexOf('{');
    braceIndex !== -1;
    braceIndex = content.indexOf('{', braceIndex + 1)
  ) {
    const selectorStart = Math.max(
      content.lastIndexOf('{', braceIndex - 1),
      content.lastIndexOf('}', braceIndex - 1),
      content.lastIndexOf(';', braceIndex - 1),
    );
    const selectorText = content
      .slice(selectorStart + 1, braceIndex)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:global\s*\(\s*([^)]+)\s*\)/g, '');

    if (selectorText.trimStart().startsWith('@')) {
      continue;
    }

    for (const match of selectorText.matchAll(classSelectorRegex)) {
      const localClass = match[1];
      if (!localClass || mapping[localClass]) {
        continue;
      }

      mapping[localClass] = generateScopedClassName(filePath, localClass, content, projectRoot);
    }
  }

  // 4. Protect :global(...) selectors while rewriting local class names.
  const globalSelectors: string[] = [];
  processed = processed.replace(/:global\s*\(\s*([^)]+)\s*\)/g, (_match, selector: string) => {
    const token = `__RANU_GLOBAL_SELECTOR_${globalSelectors.length}__`;
    globalSelectors.push(selector.trim());
    return token;
  });

  for (const [localClass, scopedClass] of Object.entries(mapping)) {
    // Reject identifier continuations, including hyphens such as .btn-large.
    const regex = new RegExp(`\\.${escapeRegExp(localClass)}(?![\\w-])`, 'g');
    processed = processed.replace(regex, `.${scopedClass}`);
  }

  // 5. Restore global selectors without their :global(...) wrappers.
  processed = processed.replace(/__RANU_GLOBAL_SELECTOR_(\d+)__/g, (match, index: string) => {
    return globalSelectors[Number(index)] ?? match;
  });

  return {
    code: processed,
    mapping,
  };
}
