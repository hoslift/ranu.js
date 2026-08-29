import fs from 'node:fs';
import path from 'node:path';
import { isPathContained } from '../output/artifact-writer.js';

/**
 * Derives the canonical relative static HTML output file path for a concrete pathname.
 *
 * Rules:
 * - Root "/" -> "static/pages/index.html"
 * - trailingSlash = "never" (default):
 *   - "/about" -> "static/pages/about.html"
 *   - "/blog/post-1" -> "static/pages/blog/post-1.html"
 * - trailingSlash = "always":
 *   - "/about" or "/about/" -> "static/pages/about/index.html"
 *   - "/blog/post-1" or "/blog/post-1/" -> "static/pages/blog/post-1/index.html"
 */
export function deriveStaticOutputPath(
  pathname: string,
  trailingSlash: 'never' | 'always' = 'never'
): string {
  // Normalize and clean incoming pathname
  const normalized = pathname.trim();
  if (normalized === '' || normalized === '/') {
    return path.join('static', 'pages', 'index.html').replace(/\\/g, '/');
  }

  // Strip leading and trailing slashes for segment parsing without ReDoS
  const segments = normalized
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => {
      // Defense in depth: reject any traversal characters
      if (seg === '.' || seg === '..' || seg.includes('\\') || seg.includes('\0')) {
        throw new Error(
          `Invalid static pathname segment "${seg}" in "${pathname}". Traversal characters are strictly prohibited.`,
        );
      }
      return seg;
    });

  if (segments.length === 0) {
    return path.join('static', 'pages', 'index.html').replace(/\\/g, '/');
  }

  if (trailingSlash === 'always') {
    return path.join('static', 'pages', ...segments, 'index.html').replace(/\\/g, '/');
  }

  // trailingSlash === 'never'
  const parentDirs = segments.slice(0, -1);
  const lastSegment = segments[segments.length - 1] ?? 'index';
  return path.join('static', 'pages', ...parentDirs, `${lastSegment}.html`).replace(/\\/g, '/');
}

/**
 * Safely writes pre-rendered static HTML content to disk inside the authorized build output root.
 */
export function writeStaticPage(
  baseOutputDir: string,
  relativeFilePath: string,
  htmlContent: string
): string {
  const fullPath = path.resolve(baseOutputDir, relativeFilePath);

  // Security guard: ensure output file is strictly contained within baseOutputDir
  if (!isPathContained(fullPath, baseOutputDir)) {
    throw new Error(
      `Security violation: Attempted to write static page outside the authorized output directory. Destination "${fullPath}" escapes base "${baseOutputDir}".`
    );
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, htmlContent, 'utf8');
  return fullPath;
}
