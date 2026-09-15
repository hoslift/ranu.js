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
