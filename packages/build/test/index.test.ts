import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { discoverRoutes, generateRouteManifest } from '@ranu/router';
import { validateRouteManifest } from '@ranu/manifests';
import { analyzeRouteMethods } from '../src/analyzer.js';

describe('Ranu.js Router & Build E2E integration', () => {
  let tempAppDir: string;

  beforeEach(() => {
    tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Ranu.js-build-integration-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempAppDir)) {
      fs.rmSync(tempAppDir, { recursive: true, force: true });
    }
  });

  it('runs real build analyzer -> router discoverRoutes -> manifest generation and V2 validation', () => {
    // Set up API directory
    fs.mkdirSync(path.join(tempAppDir, 'api', 'users'), { recursive: true });
    fs.writeFileSync(
      path.join(tempAppDir, 'api', 'users', 'route.ts'),
      `
      export async function GET() {}
      export async function POST() {}
      `
    );

    // Call discoverRoutes with the real analyzer
    const { records, diagnostics } = discoverRoutes(tempAppDir, {
      analyzeRouteMethods
    });

    expect(diagnostics).toHaveLength(0);
    expect(records).toHaveLength(1);
    
    const apiRecord = records.find(r => r.kind === 'api');
    expect(apiRecord).toBeDefined();
    expect(apiRecord!.kind).toBe('api');
    expect(apiRecord!.methods).toEqual(['GET', 'POST']);

    // Generate Route Manifest
    const manifest = generateRouteManifest(records, 'build_test');
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].id).toBe('api:/api/users');
    expect((manifest.routes[0] as any).methods).toEqual(['GET', 'POST']);

    // Validate Manifest
    const validation = validateRouteManifest(manifest);
    expect(validation.success).toBe(true);
    expect(validation.diagnostics).toHaveLength(0);
  });
});
