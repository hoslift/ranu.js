import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runFixCommand, type FixResult } from '../src/commands/fix.js';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli fix command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-fix-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupBasicApp(): void {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Root layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }`
    );

    // Root page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `export default function HomePage() { return <h1>Home</h1>; }`
    );
  }

  it('reports healthy when workspace has no issues', async () => {
    setupBasicApp();

    const logger = createCliLogger({ quiet: true });
    const successSpy = vi.spyOn(logger, 'success');

    const exitCode = await runFixCommand({ args: [], root: tempDir }, logger);
    expect(exitCode).toBe(0);
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('No issues found'));
  });

  it('automatically adds missing "use client" directive', async () => {
    setupBasicApp();
    const appDir = path.join(tempDir, 'app');

    // Create a component that requires client directive
    const clientCompPath = path.join(appDir, 'ClientWidget.tsx');
    fs.writeFileSync(
      clientCompPath,
      `import { useState } from 'react';
export function ClientWidget() {
  const [val] = useState(0);
  return <div>{val}</div>;
}`
    );

    // Page importing client component
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { ClientWidget } from './ClientWidget.js';
export default function Page() { return <ClientWidget />; }`
    );

    const logger = createCliLogger({ quiet: true });
    const exitCode = await runFixCommand({ args: [], root: tempDir }, logger);

    const updatedContent = fs.readFileSync(clientCompPath, 'utf8');
    expect(updatedContent).toContain("'use client';");
  });

  it('respects --dry-run mode without modifying disk files', async () => {
    setupBasicApp();
    const appDir = path.join(tempDir, 'app');

    const clientCompPath = path.join(appDir, 'ClientWidget.tsx');
    const initialContent = `import { useState } from 'react';
export function ClientWidget() { return <div>Widget</div>; }`;
    fs.writeFileSync(clientCompPath, initialContent);

    // Page importing client component
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { ClientWidget } from './ClientWidget.js';
export default function Page() { return <ClientWidget />; }`
    );

    const logger = createCliLogger({ quiet: true });
    await runFixCommand({ args: [], root: tempDir, dryRun: true }, logger);

    const contentAfterDryRun = fs.readFileSync(clientCompPath, 'utf8');
    expect(contentAfterDryRun).toBe(initialContent);
  });

  it('supports --format json for structured output', async () => {
    setupBasicApp();
    const appDir = path.join(tempDir, 'app');

    // Missing method export in API route
    const apiDir = path.join(appDir, 'api', 'empty');
    fs.mkdirSync(apiDir, { recursive: true });
    const routeFile = path.join(apiDir, 'route.ts');
    fs.writeFileSync(routeFile, `// Empty route`);

    let loggedData: unknown;
    const logger = createCliLogger({ json: true });
    vi.spyOn(logger, 'json').mockImplementation((data) => {
      loggedData = data;
    });

    await runFixCommand({ args: [], root: tempDir, format: 'json', json: true }, logger);

    expect(loggedData).toBeDefined();
    const result = loggedData as FixResult;
    expect(typeof result.fixedCount).toBe('number');
    expect(Array.isArray(result.patches)).toBe(true);
    expect(result.patches.length).toBeGreaterThan(0);
    expect(result.patches[0]?.file).toBe('app/api/empty/route.ts');
    expect(result.patches[0]?.diff).toContain('+ export async function GET');

    // Verify disk was updated
    const updatedRoute = fs.readFileSync(routeFile, 'utf8');
    expect(updatedRoute).toContain('export async function GET');
  });

  it('replaces private secret references with RANU_PUBLIC_ prefix', async () => {
    setupBasicApp();
    const appDir = path.join(tempDir, 'app');

    const clientFile = path.join(appDir, 'Counter.tsx');
    fs.writeFileSync(
      clientFile,
      `'use client';
export function Counter() {
  const apiKey = process.env.SECRET_KEY;
  return <div>{apiKey}</div>;
}`
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import { Counter } from './Counter.js';
export default function Page() { return <Counter />; }`
    );

    const logger = createCliLogger({ quiet: true });
    await runFixCommand({ args: [], root: tempDir }, logger);

    const updated = fs.readFileSync(clientFile, 'utf8');
    expect(updated).toContain('process.env.RANU_PUBLIC_SECRET_KEY');
  });
});
