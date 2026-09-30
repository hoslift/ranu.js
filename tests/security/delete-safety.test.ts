import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { assertSafeDeletePath, cleanupTempArtifacts, promoteBuildArtifacts } from '@ranu/build';

describe('Suite 12: CLI and Build Delete Safety (CLI-delete-safety)', () => {
  it('rejects deletion of filesystem root directory', () => {
    const rootPath = path.parse(process.cwd()).root;
    expect(() => assertSafeDeletePath(rootPath)).toThrow(/Refusing to delete filesystem root/);
  });

  it('rejects deletion of user home directory', () => {
    const homeDir = os.homedir();
    expect(() => assertSafeDeletePath(homeDir)).toThrow(/Refusing to delete user home directory/);
  });

  it('rejects deletion of system temporary directory itself', () => {
    const tmpDir = os.tmpdir();
    expect(() => assertSafeDeletePath(tmpDir)).toThrow(/Refusing to delete system temporary directory itself/);
  });

  it('rejects deletion of project source code directories outside .ranu', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const packagesDir = path.resolve(process.cwd(), 'packages');
    expect(() => assertSafeDeletePath(srcDir)).toThrow(/Refusing to delete unauthorized path/);
    expect(() => assertSafeDeletePath(packagesDir)).toThrow(/Refusing to delete unauthorized path/);
  });

  it('rejects empty, null, or invalid path inputs', () => {
    expect(() => assertSafeDeletePath('')).toThrow(/target path must be a non-empty string/);
    expect(() => assertSafeDeletePath(null as any)).toThrow(/target path must be a non-empty string/);
    expect(() => assertSafeDeletePath(undefined as any)).toThrow(/target path must be a non-empty string/);
  });

  it('permits deletion strictly within .ranu directories', () => {
    const safeRanuTemp = path.resolve(process.cwd(), '.ranu', '.build_temp_test123');
    const safeRanuBuild = path.resolve(process.cwd(), '.ranu', 'build');
    expect(() => assertSafeDeletePath(safeRanuTemp)).not.toThrow();
    expect(() => assertSafeDeletePath(safeRanuBuild)).not.toThrow();
  });

  it('permits deletion within subdirectories of system temporary directory', () => {
    const safeTmpSubdir = path.resolve(os.tmpdir(), 'ranu-test-fixture-12345');
    expect(() => assertSafeDeletePath(safeTmpSubdir)).not.toThrow();
  });

  it('cleanupTempArtifacts intercepts unauthorized path deletion and throws refusal', () => {
    const dangerousPath = path.resolve(os.homedir());
    expect(() => cleanupTempArtifacts(dangerousPath)).toThrow(/Refusing to delete user home directory/);
  });

  it('promoteBuildArtifacts protects finalDir destination before promotion', () => {
    const dummyTemp = path.resolve(os.tmpdir(), 'safe_temp_123');
    fs.mkdirSync(dummyTemp, { recursive: true });
    try {
      const dangerousFinal = path.resolve(process.cwd(), 'packages');
      expect(() => promoteBuildArtifacts(dummyTemp, dangerousFinal)).toThrow(/Refusing to delete unauthorized path/);
    } finally {
      if (fs.existsSync(dummyTemp)) {
        fs.rmSync(dummyTemp, { recursive: true, force: true });
      }
    }
  });
});
