import { describe, it, expect } from 'vitest';
import type { RanuRequestContext, DispatchResult } from '../src/index.js';

describe('@ranu/runtime', () => {
  it('RanuRequestContext type is defined (compile-time check)', () => {
    // Type-only check — just ensure the types import correctly
    const ctx: RanuRequestContext = {
      request: new Request('http://localhost/'),
      params: {},
      locals: {},
    };
    expect(ctx.params).toEqual({});
  });

  it('DispatchResult type works', () => {
    const result: DispatchResult = { type: 'not-found' };
    expect(result.type).toBe('not-found');
  });
});
