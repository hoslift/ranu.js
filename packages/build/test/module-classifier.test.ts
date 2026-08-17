import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildModuleGraph,
  extractModuleImports,
  isNodeBuiltinModule,
} from '../src/graph/module-classifier.js';

describe('module-classifier', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-graph-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('identifies Node built-in module specifiers', () => {
    expect(isNodeBuiltinModule('node:fs')).toBe(true);
    expect(isNodeBuiltinModule('node:path')).toBe(true);
    expect(isNodeBuiltinModule('fs')).toBe(true);
    expect(isNodeBuiltinModule('path')).toBe(true);
    expect(isNodeBuiltinModule('react')).toBe(false);
    expect(isNodeBuiltinModule('./utils')).toBe(false);
  });

  it('extracts static and dynamic imports with source locations', () => {
    const filePath = path.join(tempDir, 'sample.ts');
    const content = `
import React from 'react';
import { helper } from './utils/helper.js';
import 'node:fs';

export async function load() {
  const dynamic = await import('./dynamic-mod.js');
}
`;
    fs.writeFileSync(filePath, content);

    const imports = extractModuleImports(filePath, content, tempDir);
    expect(imports.length).toBe(4);

    expect(imports[0]?.specifier).toBe('react');
    expect(imports[0]?.isNodeBuiltin).toBe(false);

    expect(imports[1]?.specifier).toBe('./utils/helper.js');

    expect(imports[2]?.specifier).toBe('node:fs');
    expect(imports[2]?.isNodeBuiltin).toBe(true);

    expect(imports[3]?.specifier).toBe('./dynamic-mod.js');
    expect(imports[3]?.isDynamic).toBe(true);
  });

  it('builds and classifies module graph with server roots, client entries, and shared modules', () => {
    // 1. Setup files
    const appDir = path.join(tempDir, 'app');
    const compDir = path.join(appDir, 'components');
    const utilDir = path.join(tempDir, 'utils');
    const serverDir = path.join(tempDir, 'server');

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(compDir, { recursive: true });
    fs.mkdirSync(utilDir, { recursive: true });
    fs.mkdirSync(serverDir, { recursive: true });

    // Page (server root)
    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(
      pageFile,
      `import { Counter } from './components/Counter.js';
import { sharedFormat } from '../utils/format.js';
export default function Page() { return null; }`
    );

    // Client component ("use client")
    const counterFile = path.join(compDir, 'Counter.tsx');
    fs.writeFileSync(
      counterFile,
      `"use client";
import { clientUtil } from './client-util.js';
import { sharedFormat } from '../../utils/format.js';
export function Counter() { return null; }`
    );

    // Client util
    const clientUtilFile = path.join(compDir, 'client-util.ts');
    fs.writeFileSync(clientUtilFile, `export const clientUtil = 42;`);

    // Shared util
    const formatFile = path.join(utilDir, 'format.ts');
    fs.writeFileSync(formatFile, `export function sharedFormat(s: string) { return s; }`);

    // Server only file
    const dbFile = path.join(serverDir, 'db.ts');
    fs.writeFileSync(dbFile, `export const db = {};`);

    // 2. Build graph
    const graph = buildModuleGraph([pageFile], tempDir);

    // 3. Assert classifications
    const pageNode = graph.nodes.get('app/page.tsx');
    expect(pageNode?.classification).toBe('server-reachable');

    const counterNode = graph.nodes.get('app/components/Counter.tsx');
    expect(counterNode?.isClientEntry).toBe(true);
    expect(counterNode?.classification).toBe('client-entry');

    const clientUtilNode = graph.nodes.get('app/components/client-util.ts');
    expect(clientUtilNode?.classification).toBe('client-reachable');

    const formatNode = graph.nodes.get('utils/format.ts');
    expect(formatNode?.classification).toBe('shared');

    expect(graph.serverRoots).toContain('app/page.tsx');
    expect(graph.clientEntries).toContain('app/components/Counter.tsx');
  });
});
