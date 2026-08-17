import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  hasServerOnlyImport,
  isServerDirectoryModule,
  isServerOnlyModule,
} from '../src/compiler/server-only-detector.js';

describe('server-only-detector', () => {
  const projectRoot = path.resolve('/test/project');

  it('detects explicit static import of ranu/server-only', () => {
    const code = `import 'ranu/server-only';
export const secret = 'db-password';`;
    expect(hasServerOnlyImport('server/db.ts', code)).toBe(true);
  });

  it('detects double-quoted import of "ranu/server-only"', () => {
    const code = `import "ranu/server-only";`;
    expect(hasServerOnlyImport('app/server-util.ts', code)).toBe(true);
  });

  it('identifies modules located inside the project server/ directory', () => {
    const serverFile = path.join(projectRoot, 'server', 'database.ts');
    expect(isServerDirectoryModule(serverFile, projectRoot)).toBe(true);

    const appFile = path.join(projectRoot, 'app', 'page.tsx');
    expect(isServerDirectoryModule(appFile, projectRoot)).toBe(false);
  });

  it('combines directory and import marker checks', () => {
    const serverDirFile = path.join(projectRoot, 'server', 'api.ts');
    const result1 = isServerOnlyModule(serverDirFile, 'export const x = 1;', projectRoot);
    expect(result1.isServerOnly).toBe(true);
    expect(result1.reason).toBe('server-directory');

    const appFileWithImport = path.join(projectRoot, 'app', 'secret.ts');
    const result2 = isServerOnlyModule(appFileWithImport, `import 'ranu/server-only';`, projectRoot);
    expect(result2.isServerOnly).toBe(true);
    expect(result2.reason).toBe('server-only-import');

    const normalFile = path.join(projectRoot, 'app', 'page.tsx');
    const result3 = isServerOnlyModule(normalFile, 'export default function Page() {}', projectRoot);
    expect(result3.isServerOnly).toBe(false);
  });
});
