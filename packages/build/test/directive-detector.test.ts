import { describe, it, expect } from 'vitest';
import { detectDirectives, isClientDirective } from '../src/compiler/directive-detector.js';

describe('directive-detector', () => {
  it('detects top-level "use client" directive prologue', () => {
    const code = `"use client";
import React from 'react';
export function Counter() { return <button>Click</button>; }`;

    const result = detectDirectives('app/components/Counter.tsx', code);
    expect(result.isClient).toBe(true);
    expect(isClientDirective('app/components/Counter.tsx', code)).toBe(true);
  });

  it('detects single-quoted \'use client\' directive', () => {
    const code = `'use client';
export default function Widget() { return null; }`;

    const result = detectDirectives('app/components/Widget.tsx', code);
    expect(result.isClient).toBe(true);
  });

  it('allows leading comments and whitespace before directive', () => {
    const code = `// Component header comment
/* Multi-line header */

"use client";

import { useState } from 'react';`;

    const result = detectDirectives('app/components/Button.tsx', code);
    expect(result.isClient).toBe(true);
  });

  it('does NOT classify as client boundary when directive is placed after an import', () => {
    const code = `import React from 'react';
"use client";
export function BadComponent() {}`;

    const result = detectDirectives('app/components/Bad.tsx', code);
    expect(result.isClient).toBe(false);
  });

  it('does NOT classify when "use client" is inside a function or statement', () => {
    const code = `export function doSomething() {
  const msg = "use client";
  return msg;
}`;

    const result = detectDirectives('app/utils/helper.ts', code);
    expect(result.isClient).toBe(false);
  });

  it('recognizes "use server" without marking module as client', () => {
    const code = `"use server";
export async function serverAction() {}`;

    const result = detectDirectives('app/actions.ts', code);
    expect(result.isClient).toBe(false);
    expect(result.hasUseServer).toBe(true);
  });

  it('returns false for standard server modules without directives', () => {
    const code = `export default function ServerPage() { return <h1>SSR</h1>; }`;
    const result = detectDirectives('app/page.tsx', code);
    expect(result.isClient).toBe(false);
  });
});
