import fs from 'node:fs';
import path from 'node:path';
import type http from 'node:http';
import { isPathContained } from '@ranu/build';

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Safely serves a file from an authorized root directory.
 * Returns true if served, false if not found or unauthorized.
 */
export function serveStaticFile(
  fullPath: string,
  authorizedRoot: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const normalizedFile = path.resolve(fullPath);
  const normalizedRoot = path.resolve(authorizedRoot);

  // Security guard: Ensure target file is strictly contained within authorized root
  if (!isPathContained(normalizedFile, normalizedRoot)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: Path traversal is prohibited');
    return true;
  }

  if (!fs.existsSync(normalizedFile)) {
    return false;
  }

  const stat = fs.statSync(normalizedFile);
  if (!stat.isFile()) {
    return false;
  }

  const mimeType = getMimeType(normalizedFile);
  const isHead = req.method?.toUpperCase() === 'HEAD';

  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });

  if (isHead) {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(normalizedFile);
  stream.on('error', (error) => {
    res.destroy(error);
  });
  stream.pipe(res);
  return true;
}
