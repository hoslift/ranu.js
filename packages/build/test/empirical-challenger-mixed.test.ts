import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as esbuild from 'esbuild';
import { detectDirectives } from '../src/compiler/directive-detector.js';
import { createRanuEsbuildPlugin } from '../src/bundler/esbuild-plugin-ranu.js';

describe('Target 6: Mixed Module Compilation Adversarial Stress Suite', () => {
  let tempDir: string;
  let staticOutDir: string;
  let tempOutDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-mixed-test-'));
    staticOutDir = path.join(tempDir, 'static');
    tempOutDir = path.join(tempDir, 'temp');
    fs.mkdirSync(staticOutDir, { recursive: true });
    fs.mkdirSync(tempOutDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('preserves all React components, hooks, constants and helpers in client bundle while replacing function-level "use server" actions with stubs', async () => {
    const mixedSource = `
import React, { useState } from 'react';

export const COMPONENT_NAME = 'UserProfile';
export const MAX_RETRY_COUNT = 3;

export function helperUtility(text: string): string {
  return text.trim().toLowerCase();
}

export function ProfileHeader({ title }: { title: string }) {
  const [count, setCount] = useState(0);
  return (
    <header className="profile-header">
      <h1>{title}</h1>
      <button onClick={() => setCount(count + 1)}>Clicks: {count}</button>
    </header>
  );
}

export const ProfileSidebar = ({ role }: { role: string }) => {
  return <aside>Role: {role}</aside>;
};

// Function-level Server Action 1: Standard function declaration
export async function updateUsername(newName: string) {
  'use server';
  // Secret server-only DB logic that must NEVER leak to client bundle
  const dbSecretKey = "SUPER_SECRET_DATABASE_KEY_12345";
  return { updated: true, newName, secret: dbSecretKey };
}

// Function-level Server Action 2: Arrow function
export const deleteAccount = async (userId: string) => {
  "use server";
  // Another secret server-only token
  const adminToken = "SUPER_SECRET_ADMIN_TOKEN_67890";
  return { deleted: userId, token: adminToken };
};

// Default export: React Component
export default function UserDashboard({ user }: { user: { name: string; role: string } }) {
  return (
    <div className="dashboard-container">
      <ProfileHeader title={user.name} />
      <ProfileSidebar role={user.role} />
    </div>
  );
}
`;

    const filePath = path.join(tempDir, 'app', 'profile', 'page.tsx');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, mixedSource, 'utf8');

    // 1. Static Analysis Verification
    const relPath = path.relative(tempDir, filePath).replace(/\\/g, '/');
    const analysis = detectDirectives(relPath, mixedSource);

    expect(analysis.isClient).toBe(false);
    expect(analysis.hasUseServer).toBe(true);
    expect(analysis.hasModuleUseServer).toBe(false);
    expect(analysis.actions.length).toBe(2);

    const actionNames = analysis.actions.map((a) => a.exportName);
    expect(actionNames).toContain('updateUsername');
    expect(actionNames).toContain('deleteAccount');

    for (const act of analysis.actions) {
      expect(act.actionId).toMatch(/^act_[a-f0-9]{16}$/);
      expect(act.isModuleLevel).toBe(false);
      expect(act.start).toBeDefined();
      expect(act.end).toBeDefined();
      expect(act.end!).toBeGreaterThan(act.start!);
    }

    // 2. Compilation via esbuild with ranu plugin (Browser / Client platform)
    const plugin = createRanuEsbuildPlugin({
      platform: 'browser',
      projectRoot: tempDir,
      staticOutDir,
      tempOutDir,
    });

    const buildResult = await esbuild.build({
      entryPoints: [filePath],
      bundle: false,
      write: false,
      format: 'esm',
      plugins: [plugin],
    });

    const clientOutput = buildResult.outputFiles[0].text;

    // 3. Structural and Security Assertions
    // Client components & constants are strictly preserved:
    expect(clientOutput).toContain('COMPONENT_NAME');
    expect(clientOutput).toContain('MAX_RETRY_COUNT');
    expect(clientOutput).toContain('helperUtility');
    expect(clientOutput).toContain('ProfileHeader');
    expect(clientOutput).toContain('ProfileSidebar');
    expect(clientOutput).toContain('UserDashboard');
    expect(clientOutput).toContain('profile-header');
    expect(clientOutput).toContain('dashboard-container');

    // Action stubs are injected:
    expect(clientOutput).toContain('createClientActionStub');
    expect(clientOutput).toContain(analysis.actions.find((a) => a.exportName === 'updateUsername')!.actionId);
    expect(clientOutput).toContain(analysis.actions.find((a) => a.exportName === 'deleteAccount')!.actionId);

    // Zero server-side secrets leak into the client bundle:
    expect(clientOutput).not.toContain('SUPER_SECRET_DATABASE_KEY_12345');
    expect(clientOutput).not.toContain('SUPER_SECRET_ADMIN_TOKEN_67890');
    expect(clientOutput).not.toContain('dbSecretKey');
    expect(clientOutput).not.toContain('adminToken');
  });

  it('handles mixed module with "use client" directive and function-level "use server"', async () => {
    const mixedClientSource = `"use client";
import React from 'react';

export function InteractiveButton() {
  return <button>Click me</button>;
}

export async function logTelemetry(event: string) {
  'use server';
  const serverTelemetryToken = "TELEMETRY_BACKEND_SECRET_999";
  return { logged: event };
}
`;

    const filePath = path.join(tempDir, 'app', 'components', 'interactive.tsx');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, mixedClientSource, 'utf8');

    const relPath = path.relative(tempDir, filePath).replace(/\\/g, '/');
    const analysis = detectDirectives(relPath, mixedClientSource);

    expect(analysis.isClient).toBe(true);
    expect(analysis.hasUseServer).toBe(true);
    expect(analysis.hasModuleUseServer).toBe(false);
    expect(analysis.actions.length).toBe(1);
    expect(analysis.actions[0].exportName).toBe('logTelemetry');

    const plugin = createRanuEsbuildPlugin({
      platform: 'browser',
      projectRoot: tempDir,
      staticOutDir,
      tempOutDir,
    });

    const buildResult = await esbuild.build({
      entryPoints: [filePath],
      bundle: false,
      write: false,
      format: 'esm',
      plugins: [plugin],
    });

    const clientOutput = buildResult.outputFiles[0].text;

    expect(clientOutput).toContain('InteractiveButton');
    expect(clientOutput).toContain('Click me');
    expect(clientOutput).toContain('createClientActionStub');
    expect(clientOutput).toContain(analysis.actions[0].actionId);
    expect(clientOutput).not.toContain('TELEMETRY_BACKEND_SECRET_999');
  });

  it('verifies pure "use server" module replaces entire file with stubs without leaking code', async () => {
    const pureServerSource = `"use server";

export async function sendEmail(to: string, body: string) {
  const smtpSecret = "SMTP_PASSWORD_XYZ";
  return { sent: true };
}

export default async function performServerBackup() {
  const awsKey = "AWS_SECRET_ACCESS_KEY_000";
  return { backup: "done" };
}
`;

    const filePath = path.join(tempDir, 'app', 'actions', 'email.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, pureServerSource, 'utf8');

    const relPath = path.relative(tempDir, filePath).replace(/\\/g, '/');
    const analysis = detectDirectives(relPath, pureServerSource);

    expect(analysis.hasModuleUseServer).toBe(true);
    expect(analysis.actions.length).toBe(2);

    const plugin = createRanuEsbuildPlugin({
      platform: 'browser',
      projectRoot: tempDir,
      staticOutDir,
      tempOutDir,
    });

    const buildResult = await esbuild.build({
      entryPoints: [filePath],
      bundle: false,
      write: false,
      format: 'esm',
      plugins: [plugin],
    });

    const clientOutput = buildResult.outputFiles[0].text;

    // Pure server action file must only contain stubs and exports
    expect(clientOutput).toContain('createClientActionStub');
    expect(clientOutput).not.toContain('SMTP_PASSWORD_XYZ');
    expect(clientOutput).not.toContain('AWS_SECRET_ACCESS_KEY_000');
    expect(clientOutput).not.toContain('smtpSecret');
    expect(clientOutput).not.toContain('awsKey');
  });
});
