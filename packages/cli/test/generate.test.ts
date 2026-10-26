import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCli } from '../src/cli.js';

describe('@ranu/cli generate command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-generate-test-'));
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates a page route component', async () => {
    const code = await runCli(['generate', 'route', '/about', '--root', tmpDir]);
    expect(code).toBe(0);

    const generatedFile = path.join(tmpDir, 'app', 'routes', 'about', 'page.tsx');
    expect(fs.existsSync(generatedFile)).toBe(true);

    const content = fs.readFileSync(generatedFile, 'utf-8');
    expect(content).toContain('export default function AboutPage()');
    expect(content).toContain('Route: /about');
  });

  it('generates a client page route component with --client', async () => {
    const code = await runCli(['generate', 'route', '/dashboard', '--client', '--root', tmpDir]);
    expect(code).toBe(0);

    const generatedFile = path.join(tmpDir, 'app', 'routes', 'dashboard', 'page.tsx');
    expect(fs.existsSync(generatedFile)).toBe(true);

    const content = fs.readFileSync(generatedFile, 'utf-8');
    expect(content).toContain("'use client';");
    expect(content).toContain('export default function DashboardPage()');
  });

  it('generates an API endpoint route handler', async () => {
    const code = await runCli(['generate', 'api', '/api/users', '--root', tmpDir]);
    expect(code).toBe(0);

    const generatedFile = path.join(tmpDir, 'app', 'routes', 'api', 'users', 'route.ts');
    expect(fs.existsSync(generatedFile)).toBe(true);

    const content = fs.readFileSync(generatedFile, 'utf-8');
    expect(content).toContain('export async function GET(');
    expect(content).toContain('export async function POST(');
  });

  it('generates a shared UI component', async () => {
    const code = await runCli(['generate', 'component', 'Header', '--root', tmpDir]);
    expect(code).toBe(0);

    const generatedFile = path.join(tmpDir, 'app', 'components', 'Header.tsx');
    expect(fs.existsSync(generatedFile)).toBe(true);

    const content = fs.readFileSync(generatedFile, 'utf-8');
    expect(content).toContain('export function Header(');
  });

  it('generates AI agent guide and llms.txt in project', async () => {
    const code = await runCli(['generate', 'guide', '--root', tmpDir]);
    expect(code).toBe(0);

    const llmsFile = path.join(tmpDir, 'public', 'llms.txt');
    const guideFile = path.join(tmpDir, '.ranu', 'AGENT_GUIDE.md');

    expect(fs.existsSync(llmsFile)).toBe(true);
    expect(fs.existsSync(guideFile)).toBe(true);

    const content = fs.readFileSync(llmsFile, 'utf-8');
    expect(content).toContain('Ranu.js Project Architecture & AI Agent Guide');
    expect(content).toContain('W3C Web Standards');
  });

  it('outputs structured JSON when --format json is provided', async () => {
    const jsonLogs: any[] = [];
    const origLog = console.log;
    console.log = (msg: string) => {
      try {
        jsonLogs.push(JSON.parse(msg));
      } catch {
        // ignore non-json
      }
    };

    try {
      const code = await runCli(['generate', 'route', '/contact', '--format', 'json', '--root', tmpDir]);
      expect(code).toBe(0);
      expect(jsonLogs.length).toBeGreaterThan(0);
      const output = jsonLogs[jsonLogs.length - 1];
      expect(output.success).toBe(true);
      expect(output.type).toBe('route');
      expect(output.target).toBe('/contact');
    } finally {
      console.log = origLog;
    }
  });
});
