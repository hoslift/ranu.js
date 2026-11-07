import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectDirectives,
  computeActionId,
} from '../src/index.js';
import { validateActionManifest, type ActionManifest } from '@ranu/manifests';
import { runManifestStage } from '../src/pipeline/stage-manifests.js';
import type { BuildContext } from '../src/build-config.js';

describe('Server Actions Compiler Transform & Directive Detection', () => {
  it('detects module-level "use server" and extracts exported functions as action entrypoints', () => {
    const code = `"use server";

export async function updateUser(id: string, name: string) {
  return { id, name };
}

export const deleteUser = async (id: string) => {
  return { deleted: id };
};

export default async function saveSettings() {
  return { saved: true };
}
`;

    const result = detectDirectives('app/actions/user.ts', code);
    expect(result.hasUseServer).toBe(true);
    expect(result.isClient).toBe(false);
    expect(result.actions.length).toBe(3);

    const actionMap = new Map(result.actions.map((a) => [a.exportName, a]));
    expect(actionMap.has('updateUser')).toBe(true);
    expect(actionMap.has('deleteUser')).toBe(true);
    expect(actionMap.has('default')).toBe(true);

    for (const action of result.actions) {
      expect(action.actionId).toMatch(/^act_[a-f0-9]{16}$/);
      expect(action.isModuleLevel).toBe(true);
      expect(action.astSignatureHash).toBeDefined();
    }
  });

  it('detects function-level "use server" directives inside functions in mixed modules', () => {
    const code = `
export async function regularServerHelper() {
  return "helper";
}

export async function submitContactForm(formData: FormData) {
  'use server';
  return { status: "received" };
}

export const inlineAction = async () => {
  "use server";
  return { ok: true };
};
`;

    const result = detectDirectives('app/contact/page.tsx', code);
    expect(result.hasUseServer).toBe(true);
    expect(result.actions.length).toBe(2);

    const actionNames = result.actions.map((a) => a.exportName);
    expect(actionNames).toContain('submitContactForm');
    expect(actionNames).toContain('inlineAction');
    expect(actionNames).not.toContain('regularServerHelper');

    for (const act of result.actions) {
      expect(act.actionId).toMatch(/^act_[a-f0-9]{16}$/);
      expect(act.isModuleLevel).toBe(false);
    }
  });

  it('computes deterministic content-addressed action hash independent of whitespace and comments', () => {
    const code1 = `"use server";
// Primary comment
export async function calculateTotal(items: number[]) {
  /* multi-line comment */
  return items.reduce((a, b) => a + b, 0);
}
`;

    const code2 = `"use server";

export async function calculateTotal(   items: number[]   ) {


  return items.reduce((a, b) => a + b, 0);
}
`;

    const res1 = detectDirectives('app/checkout/actions.ts', code1);
    const res2 = detectDirectives('app/checkout/actions.ts', code2);

    expect(res1.actions[0].actionId).toBe(res2.actions[0].actionId);
    expect(res1.actions[0].actionId).toMatch(/^act_[a-f0-9]{16}$/);

    // Modified implementation produces different hash
    const code3 = `"use server";
export async function calculateTotal(items: number[]) {
  return items.reduce((a, b) => a + b, 10); // +10 tax
}
`;
    const res3 = detectDirectives('app/checkout/actions.ts', code3);
    expect(res3.actions[0].actionId).not.toBe(res1.actions[0].actionId);
  });

  it('action ID is decoupled from ephemeral buildId', () => {
    const code = `"use server";
export async function publishArticle(title: string) {
  return { title, publishedAt: Date.now() };
}
`;

    // Same source evaluated in build A and build B produces identical actionId
    const resA = detectDirectives('app/articles/actions.ts', code);
    const resB = detectDirectives('app/articles/actions.ts', code);

    expect(resA.actions[0].actionId).toBe(resB.actions[0].actionId);
  });

  it('runManifestStage emits and validates manifest/actions.json', () => {
    const tempDir = path.resolve('temp-test-actions-manifest');
    const ctx: BuildContext = {
      projectRoot: tempDir,
      buildId: 'build_actions_test_01',
      config: {} as any,
      tempOutDir: path.join(tempDir, '.ranu', 'temp'),
      outDir: path.join(tempDir, '.ranu', 'build'),
      manifestOutDir: path.join(tempDir, '.ranu', 'temp', 'manifest'),
      staticOutDir: path.join(tempDir, '.ranu', 'temp', 'static'),
      serverOutDir: path.join(tempDir, '.ranu', 'temp', 'server'),
    };

    const serverActions = {
      act_1234567890abcdef: {
        actionId: 'act_1234567890abcdef',
        routeId: 'app/actions/user.ts',
        exportName: 'updateUser',
        astSignatureHash: 'sig123',
        isMutating: true,
      },
    };

    const manifestResult = runManifestStage(ctx, [], {}, [], serverActions);
    expect(manifestResult.success).toBe(true);
    expect(manifestResult.actionManifest).toBeDefined();
    expect(manifestResult.actionManifest.actions['act_1234567890abcdef']).toBeDefined();

    const validation = validateActionManifest(
      manifestResult.actionManifest,
      'build_actions_test_01',
    );
    expect(validation.success).toBe(true);
    expect(manifestResult.buildDescriptor.manifests.actions).toBe('./manifest/actions.json');

    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('action ID computation normalizes leading ./ and backslashes identically', () => {
    const id1 = computeActionId('app/actions/user.ts', 'updateUser', '() => {}');
    const id2 = computeActionId('./app/actions/user.ts', 'updateUser', '() => {}');
    const id3 = computeActionId('app\\actions\\user.ts', 'updateUser', '() => {}');
    const id4 = computeActionId('.\\app\\actions\\user.ts', 'updateUser', '() => {}');

    expect(id1).toBe(id2);
    expect(id1).toBe(id3);
    expect(id1).toBe(id4);
  });

  it('exposes hasModuleUseServer and statement offsets for mixed module analysis', () => {
    const mixedCode = `
export function ProfileCard() {
  return "Profile";
}

export async function updateBio(bio: string) {
  'use server';
  return { updated: true };
}
`;
    const analysis = detectDirectives('app/profile.tsx', mixedCode);
    expect(analysis.hasUseServer).toBe(true);
    expect(analysis.hasModuleUseServer).toBe(false);
    expect(analysis.actions.length).toBe(1);
    expect(analysis.actions[0].exportName).toBe('updateBio');
    expect(analysis.actions[0].start).toBeDefined();
    expect(analysis.actions[0].end).toBeDefined();
    expect(analysis.actions[0].end!).toBeGreaterThan(analysis.actions[0].start!);
  });
});
