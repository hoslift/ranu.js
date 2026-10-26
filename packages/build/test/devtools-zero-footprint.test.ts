import { describe, it, expect } from 'vitest';
import * as esbuild from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {
  auditProductionBundle,
  DEVTOOLS_SENSITIVE_SYMBOLS,
} from '../src/output/bundle-audit.js';
import { createRanuEsbuildPlugin } from '../src/bundler/esbuild-plugin-ranu.js';

describe('DevTools Zero-Footprint Production Audit', () => {
  it('confirms clean production bundle with 0 leaked bytes', () => {
    const cleanBundle = `
      // Production client bundle
      function App() { return React.createElement('div', null, 'Hello World'); }
      export default App;
    `;
    const audit = auditProductionBundle(cleanBundle);
    expect(audit.passed).toBe(true);
    expect(audit.leakedDevtoolsBytes).toBe(0);
    expect(audit.matchedDevtoolsSymbols).toEqual([]);
    expect(audit.report).toContain('Zero bytes of @ranu/devtools detected');
  });

  it('fails audit when DevTools dock symbols leak into bundle', () => {
    for (const symbol of DEVTOOLS_SENSITIVE_SYMBOLS) {
      const contaminatedBundle = `
        function ClientPage() {
          ${symbol}();
          return React.createElement('h1', null, 'Test');
        }
      `;
      const audit = auditProductionBundle(contaminatedBundle);
      expect(audit.passed).toBe(false);
      expect(audit.leakedDevtoolsBytes).toBeGreaterThan(0);
      expect(audit.matchedDevtoolsSymbols).toContain(symbol);
      expect(audit.report).toContain('DevTools zero-footprint violation');
    }
  });

  it('verifies esbuild plugin strips @ranu/devtools in production browser bundles', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-devtools-audit-'));
    const entryFile = path.join(tempDir, 'entry.js');

    // Simulate client component conditionally or directly referencing devtools
    fs.writeFileSync(
      entryFile,
      `
      import { mountDevToolsDock, DevToolsDock, AIStudio } from '@ranu/devtools';
      export function Page() {
        mountDevToolsDock();
        return DevToolsDock();
      }
      `,
      'utf8'
    );

    try {
      const plugin = createRanuEsbuildPlugin({
        platform: 'browser',
        projectRoot: tempDir,
        staticOutDir: path.join(tempDir, 'static'),
        tempOutDir: path.join(tempDir, 'temp'),
      });

      const result = await esbuild.build({
        entryPoints: [entryFile],
        bundle: true,
        write: false,
        format: 'esm',
        plugins: [plugin],
      });

      const outputText = result.outputFiles[0]?.text ?? '';

      // The emitted bundle should only contain the empty stubs:
      expect(outputText).not.toContain('shadowRoot');
      expect(outputText).not.toContain('2147483646');
      expect(outputText).not.toContain('computeLineDiff');
      expect(outputText).not.toContain('ranu-devtools-dock');
    } finally {
      process.env.NODE_ENV = prevEnv;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
