import fs from 'node:fs';
import path from 'node:path';

export interface SecretScanResult {
  leaked: boolean;
  findings: { file: string; match: string }[];
}

/**
 * Scan directory recursively for presence of forbidden secret patterns.
 */
export function scanDirectoryForSecrets(
  targetDir: string,
  secretTokens: string[],
): SecretScanResult {
  const findings: { file: string; match: string }[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const token of secretTokens) {
          if (content.includes(token)) {
            findings.push({ file: fullPath, match: token });
          }
        }
      }
    }
  }

  walk(targetDir);
  return {
    leaked: findings.length > 0,
    findings,
  };
}

/**
 * Standard traversal attack vectors.
 */
export const PATH_TRAVERSAL_VECTORS = [
  '../',
  '..\\',
  '../../etc/passwd',
  '..\\..\\windows\\win.ini',
  '%2e%2e%2f',
  '%2e%2e%5c',
  '..%252f',
  '..%c0%af',
  '/etc/passwd',
  'C:\\Windows\\win.ini',
];

/**
 * Standard dotfile paths that must never be served as static files.
 */
export const DOTFILE_VECTORS = [
  '/.env',
  '/.env.local',
  '/.env.production',
  '/.git/HEAD',
  '/.git/config',
  '/.gitignore',
  '/.ranu/build/server/entry.mjs',
];

/**
 * Standard CRLF / response splitting attack vectors.
 */
export const CRLF_INJECTION_VECTORS = [
  'evil\r\nInjected-Header: injected_value',
  'text/html\r\nSet-Cookie: session=hacked; Path=/',
  'attachment; filename="test.pdf"\r\n\r\n<script>alert(1)</script>',
];

/**
 * Standard adversarial XSS and script breakout sequences.
 */
export const XSS_SCRIPT_BREAKOUT_VECTORS = [
  '</script><script>alert("xss")</script>',
  '<!--<script>',
  '"><script>alert(document.cookie)</script>',
  '</script><svg onload=alert(1)>',
  'Line1\u2028Line2\u2029Line3',
];
