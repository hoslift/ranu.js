import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCheckCommand } from '../src/commands/check.js';
import { createCliLogger } from '../src/logger.js';
import type { DiagnosticReport } from '@ranu/diagnostics';

describe('@ranu/cli check command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-check-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupValidProject(): void {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Root layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `export default function RootLayout({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }`
    );

    // Root page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `export default function HomePage() { return <h1>Home</h1>; }`
    );
  }

  it('passes on a valid project and outputs DiagnosticReport with success: true in --format json mode', async () => {
    setupValidProject();

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(0);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(true);
    expect(report.summary.errors).toBe(0);
    expect(report.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('detects server-only boundary violation in client code and outputs actionable hint and importChain', async () => {
    setupValidProject();
    const appDir = path.join(tempDir, 'app');

    // Create client component that imports server-only
    fs.writeFileSync(
      path.join(appDir, 'ClientWidget.tsx'),
      `"use client";
       import 'ranu/server-only';
       export function ClientWidget() { return <div>Widget</div>; }`
    );

    // Import client component in page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { ClientWidget } from './ClientWidget.js';
       export default function HomePage() { return <ClientWidget />; }`
    );

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(false);
    expect(report.summary.errors).toBeGreaterThanOrEqual(1);

    const boundaryDiag = report.diagnostics.find(
      (d) => d.code === 'RANU_BUILD_SERVER_ONLY_CLIENT'
    );
    expect(boundaryDiag).toBeDefined();
    expect(boundaryDiag?.hint).toContain('Remove server-only import');
    expect(boundaryDiag?.importChain).toBeDefined();
    expect(boundaryDiag?.importChain?.length).toBeGreaterThan(0);
  });

  it('detects private server environment variable leak in client component', async () => {
    setupValidProject();
    const appDir = path.join(tempDir, 'app');

    // Client component accessing private server env var
    fs.writeFileSync(
      path.join(appDir, 'ClientSecret.tsx'),
      `"use client";
       export function ClientSecret() {
         const secret = process.env.DATABASE_PASSWORD;
         return <div>{secret}</div>;
       }`
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { ClientSecret } from './ClientSecret.js';
       export default function HomePage() { return <ClientSecret />; }`
    );

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(false);

    const envDiag = report.diagnostics.find(
      (d) => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT'
    );
    expect(envDiag).toBeDefined();
    expect(envDiag?.hint).toContain('RANU_PUBLIC_');
  });

  it('detects non-serializable function props passed to client components across boundary', async () => {
    setupValidProject();
    const appDir = path.join(tempDir, 'app');

    // Client component
    fs.writeFileSync(
      path.join(appDir, 'Button.tsx'),
      `"use client";
       export function Button({ onClick }: { onClick: () => void }) {
         return <button onClick={onClick}>Click</button>;
       }`
    );

    // Server page passes an inline function to the client component
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { Button } from './Button.js';
       export default function HomePage() {
         return <Button onClick={() => console.log('bad')} />;
       }`
    );

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(false);

    const propDiag = report.diagnostics.find(
      (d) => d.code === 'RANU_BUILD_NON_SERIALIZABLE_PROP'
    );
    expect(propDiag).toBeDefined();
    expect(propDiag?.hint).toContain('Move event handlers');
  });

  it('outputs human-readable diagnostic messages and timing in text mode', async () => {
    setupValidProject();

    const logger = createCliLogger({ quiet: false });
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});

    const exitCode = await runCheckCommand({ args: [], root: tempDir }, logger);

    expect(exitCode).toBe(0);
    expect(successSpy).toHaveBeenCalled();
    expect(successSpy.mock.calls[0]?.[0]).toContain('Check passed in');
  });

  it('captures broken configuration syntax as RANU_CONFIG_LOAD_FAILED in DiagnosticReport', async () => {
    setupValidProject();
    fs.writeFileSync(path.join(tempDir, 'ranu.config.ts'), 'export default { broken syntax');

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(false);
    expect(report.summary.errors).toBeGreaterThanOrEqual(1);

    const diag = report.diagnostics.find((d) => d.code === 'RANU_CONFIG_LOAD_FAILED');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.location?.file).toContain('ranu.config.ts');
  });

  it('captures broken configuration schema as RANU_CONFIG_INVALID in DiagnosticReport', async () => {
    setupValidProject();
    fs.writeFileSync(path.join(tempDir, 'ranu.config.ts'), 'export default { server: { port: -99 } };');

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    const exitCode = await runCheckCommand(
      { args: [], root: tempDir, format: 'json', json: true },
      logger
    );

    expect(exitCode).toBe(1);
    const report = loggedData as DiagnosticReport;
    expect(report.success).toBe(false);
    expect(report.summary.errors).toBeGreaterThanOrEqual(1);

    const diag = report.diagnostics.find((d) => d.code === 'RANU_CONFIG_INVALID');
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe('error');
    expect(diag?.message).toContain('server.port');
  });
});
