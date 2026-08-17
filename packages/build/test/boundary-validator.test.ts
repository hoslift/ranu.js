import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildModuleGraph } from '../src/graph/module-classifier.js';
import { validateGraphBoundaries } from '../src/graph/boundary-validator.js';

describe('boundary-validator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-boundary-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('passes validation when client graph imports only client-safe shared modules', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pageFile, `import { ClientBtn } from './btn.js'; export default function P() {}`);

    const btnFile = path.join(appDir, 'btn.tsx');
    fs.writeFileSync(btnFile, `"use client"; import { format } from './format.js'; export function ClientBtn() {}`);

    const formatFile = path.join(appDir, 'format.ts');
    fs.writeFileSync(formatFile, `export const format = (s: string) => s;`);

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateGraphBoundaries(graph);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('rejects client component importing ranu/server-only', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pageFile, `import { BadClient } from './bad.js'; export default function P() {}`);

    const badClientFile = path.join(appDir, 'bad.tsx');
    fs.writeFileSync(badClientFile, `"use client"; import 'ranu/server-only'; export function BadClient() {}`);

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateGraphBoundaries(graph);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'RANU_BUILD_SERVER_ONLY_CLIENT')).toBe(true);
  });

  it('rejects client component importing a module from server/ directory', () => {
    const appDir = path.join(tempDir, 'app');
    const serverDir = path.join(tempDir, 'server');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(serverDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pageFile, `import { Counter } from './Counter.js'; export default function P() {}`);

    const counterFile = path.join(appDir, 'Counter.tsx');
    fs.writeFileSync(counterFile, `"use client"; import { db } from '../server/db.js'; export function Counter() {}`);

    const dbFile = path.join(serverDir, 'db.ts');
    fs.writeFileSync(dbFile, `export const db = { secret: 123 };`);

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateGraphBoundaries(graph);

    expect(result.success).toBe(false);
    const diag = result.diagnostics.find(d => d.code === 'RANU_BUILD_CLIENT_SERVER_BOUNDARY');
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('server/db.ts');
    expect(diag?.message).toContain('Import chain');
  });

  it('rejects client component importing Node built-in modules', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pageFile, `import { ClientNode } from './client-node.js'; export default function P() {}`);

    const clientNodeFile = path.join(appDir, 'client-node.tsx');
    fs.writeFileSync(clientNodeFile, `"use client"; import fs from 'node:fs'; export function ClientNode() {}`);

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateGraphBoundaries(graph);

    expect(result.success).toBe(false);
    const diag = result.diagnostics.find(d => d.code === 'RANU_BUILD_NODE_BUILTIN_CLIENT');
    expect(diag).toBeDefined();
    expect(diag?.message).toContain('node:fs');
  });

  it('allows server roots to import Node built-ins without error', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pageFile, `import fs from 'node:fs'; export default function P() { return null; }`);

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateGraphBoundaries(graph);

    expect(result.success).toBe(true);
  });
});
