import { describe, it, expect, vi } from 'vitest';
import { createFormAction } from '../src/actions/form-action.js';
import type { StandardSchemaV1 } from '../src/actions/types.js';

describe('@ranu/server createFormAction', () => {
  it('validates input using Standard Schema v1 (~standard) and prevents handler execution on invalid payload', async () => {
    const handler = vi.fn(async (input: { email: string; age: number }) => {
      return { id: 'usr_1', email: input.email };
    });

    const standardSchema: StandardSchemaV1<{ email: string; age: number }> = {
      '~standard': {
        version: 1,
        vendor: 'mock-validator',
        validate(value: any) {
          const issues = [];
          if (!value?.email || !value.email.includes('@')) {
            issues.push({ message: 'Must be a valid email', path: ['email'] });
          }
          if (typeof value?.age !== 'number' || value.age < 18) {
            issues.push({ message: 'Must be at least 18 years old', path: ['age'] });
          }
          if (issues.length > 0) {
            return { issues };
          }
          return { value: { email: value.email, age: Number(value.age) } };
        },
      },
    };

    const action = createFormAction({
      schema: standardSchema,
      handler,
    });

    // 1. Submit invalid object
    const invalidResult = await action({ email: 'not-an-email', age: 15 });
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.errors).toEqual({
      email: ['Must be a valid email'],
      age: ['Must be at least 18 years old'],
    });
    expect(handler).not.toHaveBeenCalled();

    // 2. Submit valid object
    const validResult = await action({ email: 'developer@example.com', age: 25 });
    expect(validResult.success).toBe(true);
    expect(validResult.data).toEqual({ id: 'usr_1', email: 'developer@example.com' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles FormData input from browser form submissions', async () => {
    const action = createFormAction({
      handler: async (data: any) => {
        return { receivedTitle: data.title };
      },
    });

    const formData = new FormData();
    formData.append('title', 'Hoslift Release Standard');

    const result = await action(formData);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ receivedTitle: 'Hoslift Release Standard' });
  });

  it('handles WHATWG Request with application/json payload', async () => {
    const action = createFormAction({
      handler: async (data: { query: string }, req?: Request) => {
        expect(req).toBeDefined();
        return { resultsCount: 42, query: data.query };
      },
    });

    const request = new Request('http://localhost:3000/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'ranu.js' }),
    });

    const result = await action(request);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ resultsCount: 42, query: 'ranu.js' });
  });

  it('supports Zod-like safeParse schema objects', async () => {
    const mockZod = {
      safeParse(val: any) {
        if (!val?.username) {
          return {
            success: false,
            error: {
              issues: [{ message: 'Username is required', path: ['username'] }],
            },
          };
        }
        return { success: true, data: { username: String(val.username).toLowerCase() } };
      },
    };

    const action = createFormAction({
      schema: mockZod as any,
      handler: async (data: { username: string }) => {
        return { profileUrl: `/u/${data.username}` };
      },
    });

    const badResult = await action({});
    expect(badResult.success).toBe(false);
    expect(badResult.errors?.username).toContain('Username is required');

    const goodResult = await action({ username: 'AdminUser' });
    expect(goodResult.success).toBe(true);
    expect(goodResult.data).toEqual({ profileUrl: '/u/adminuser' });
  });

  it('supports action.raw() direct invocation', async () => {
    const action = createFormAction({
      handler: async (data: { n: number }) => data.n * 2,
    });

    const direct = await action.raw({ n: 21 });
    expect(direct).toBe(42);
  });

  it('catches handler exceptions gracefully and returns formErrors', async () => {
    const action = createFormAction({
      handler: async () => {
        throw new Error('Database transaction lock conflict');
      },
    });

    const result = await action({});
    expect(result.success).toBe(false);
    expect(result.formErrors).toContain('Database transaction lock conflict');
  });
});
