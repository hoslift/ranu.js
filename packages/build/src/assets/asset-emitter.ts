import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STATIC_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
  '.gif',
  '.avif',
  '.ico',
]);

export const STATIC_FONT_EXTENSIONS = new Set([
  '.woff2',
  '.woff',
  '.ttf',
  '.otf',
]);

export const STATIC_MEDIA_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mp3',
]);

export const ALL_STATIC_ASSET_EXTENSIONS = new Set([
  ...STATIC_IMAGE_EXTENSIONS,
  ...STATIC_FONT_EXTENSIONS,
  ...STATIC_MEDIA_EXTENSIONS,
]);

/**
 * Checks whether a given file path corresponds to a supported imported static asset.
 */
export function isStaticAssetFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALL_STATIC_ASSET_EXTENSIONS.has(ext);
}

export interface EmittedAssetResult {
  readonly publicUrl: string;
  readonly fullPath: string;
}

/**
 * Emits a static asset file with deterministic content-hashing into staticOutDir/assets/.
 */
export function emitStaticAsset(
  filePath: string,
  staticOutDir: string,
  projectRoot: string
): EmittedAssetResult {
  const normalizedFile = path.resolve(filePath);
  const normalizedRoot = path.resolve(projectRoot);

  // Security guard: Ensure file is inside project root
  if (!normalizedFile.startsWith(normalizedRoot)) {
    throw new Error(`Asset path "${filePath}" escapes project root "${projectRoot}".`);
  }

  const content = fs.readFileSync(normalizedFile);
  const ext = path.extname(normalizedFile).toLowerCase();
  const base = path.basename(normalizedFile, ext).replace(/[^a-zA-Z0-9_-]/g, '_');

  // Generate 8-character deterministic content hash
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  const emittedFileName = `${base}-${hash}${ext}`;

  const assetsDir = path.join(staticOutDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const targetPath = path.join(assetsDir, emittedFileName);
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, content);
  }

  return {
    publicUrl: `/_ranu/assets/${emittedFileName}`,
    fullPath: targetPath,
  };
}

export interface RewriteCssUrlsResult {
  readonly code: string;
  readonly referencedAssets: string[];
}

/**
 * Rewrites relative url(...) expressions in CSS stylesheets to deterministic hashed public asset URLs.
 * Leaves absolute URLs (http:, https:, //) and data URIs (data:) untouched.
 */
export function rewriteCssUrls(
  cssContent: string,
  cssFilePath: string,
  staticOutDir: string,
  projectRoot: string
): RewriteCssUrlsResult {
  const referencedAssets: string[] = [];
  const cssDir = path.dirname(cssFilePath);

  // Regular expression matching url(...) values with or without quotes
  const urlRegex = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

  const rewritten = cssContent.replace(urlRegex, (match, quote, rawUrl) => {
    const trimmed = rawUrl.trim();

    // 1. Preserve absolute, protocol-relative, and data URIs
    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('/_ranu/')
    ) {
      return match;
    }

    // 2. Resolve relative path against CSS file directory
    const resolvedPath = path.resolve(cssDir, trimmed);

    // Guard: Prevent path traversal escaping project root
    const normalizedRoot = path.resolve(projectRoot);
    if (!resolvedPath.startsWith(normalizedRoot)) {
      throw new Error(
        `Path traversal detected in CSS url("${trimmed}") in file "${cssFilePath}". Traversal outside project root is prohibited.`
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      // If file does not exist on disk, leave as-is and warn or return match
      return match;
    }

    // 3. Emit referenced static asset and rewrite url to hashed public URL
    const emitted = emitStaticAsset(resolvedPath, staticOutDir, projectRoot);
    referencedAssets.push(emitted.publicUrl);

    const safeQuote = quote || '"';
    return `url(${safeQuote}${emitted.publicUrl}${safeQuote})`;
  });

  return {
    code: rewritten,
    referencedAssets,
  };
}
