import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  registerRequestContextStore,
  type RanuRequestContext,
  type RequestContextStore,
} from '@ranu/runtime';
import {
  ServerActionRegistry,
  executeServerAction,
  createActionDispatcher,
} from '../src/actions/rpc.js';
import { createClientActionStub } from '../../react/src/forms/client-stub.js';
import { RanuActionStreamError } from '@ranu/core';

class MockContextStore implements RequestContextStore {
  private als = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.als.getStore();
  }
}

describe('Empirical Challenger Adversarial Stress Suite (Targets 1 - 5)', () => {
  let unregister: (() => void) | undefined;
  let contextStore: MockContextStore;
  let registry: ServerActionRegistry;

  const createMockContext = (request: Request): RanuRequestContext => {
    const url = new URL(request.url);
    return {
      requestId: 'stress-req-001',
      request,
      url,
      params: {},
      locals: new Map<string, unknown>(),
      signal: request.signal,
      responseCookies: [],
      waitUntil: () => {},
    };
  };

  beforeEach(() => {
    contextStore = new MockContextStore();
    unregister = registerRequestContextStore(contextStore);
    registry = new ServerActionRegistry();
  });

  afterEach(() => {
    unregister?.();
    registry.clear();
  });

  // =========================================================================
  // TARGET 1: Malformed Action IDs Stress-Testing
  // =========================================================================
  describe('1. Malformed Action IDs', () => {
    const adversarialActionIds = [
      'act_invalid',
      'act_123',
      'act_XYZ',
      'act_!@#$',
      'act_0123456789abcdef0',    // 17 hex chars (too long)
      'act_0123456789abcde',     // 15 hex chars (too short)
      'act_0123456789ABCDEF',    // Uppercase hex
      'act_0123456789abcdef\n',  // Newline injection
      'act_0123456789abcdef\0',  // Null byte injection
      'act_0123456789abcdef/sub', // Path delimiter
      'act_0123456789abcdef?foo=bar', // Query string injection
      'act_',                    // Prefix only
      'act_                ',    // Whitespace suffix
      'act_0123456789abcdef ',   // Trailing space
      ' act_0123456789abcdef',   // Leading space
      'ACT_0123456789abcdef',    // Uppercase prefix
      '../act_0123456789abcdef', // Directory traversal
      'act_0123456789abcdef;DROP',// SQL-style injection
    ];

    for (const invalidId of adversarialActionIds) {
      it(`returns HTTP 400 Bad Request for malformed ID: "${invalidId}"`, async () => {
        const req = new Request(`http://localhost/_ranu/action/${encodeURIComponent(invalidId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const ctx = createMockContext(req);
        const res = await executeServerAction(invalidId, req, ctx, registry);

        expect(res.status).toBe(400);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.formErrors).toBeDefined();
        expect(json.formErrors.length).toBeGreaterThan(0);
        expect(json.formErrors[0]).toContain(`Invalid action ID format: "${invalidId}"`);
      });
    }

    it('returns HTTP 404 for valid format but non-existent action ID', async () => {
      const missingId = 'act_cafebabedeadbeef';
      const req = new Request(`http://localhost/_ranu/action/${missingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(missingId, req, ctx, registry);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.formErrors[0]).toContain(`Server Action "${missingId}" not found`);
    });
  });

  // =========================================================================
  // TARGET 2: Schema Validation Failure Stress-Testing
  // =========================================================================
  describe('2. Schema Validation Failure', () => {
    const actionId = 'act_aaaaaaaaaaaaaaaa';

    it('returns HTTP 422 with structured field errors for Standard Schema failure', async () => {
      const standardSchema = {
        '~standard': {
          version: 1,
          vendor: 'valibot-or-zod',
          validate: async (val: any) => {
            const issues: any[] = [];
            if (!val || typeof val.email !== 'string' || !val.email.includes('@')) {
              issues.push({ path: ['email'], message: 'Invalid email address format' });
            }
            if (!val || typeof val.age !== 'number' || val.age < 18) {
              issues.push({ path: ['age'], message: 'Must be at least 18 years old' });
            }
            if (issues.length > 0) {
              return { issues };
            }
            return { value: val };
          },
        },
      };

      registry.register(actionId, async (data) => data, undefined, standardSchema);

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', age: 16 }),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      expect(res.status).toBe(422);
      expect(res.headers.get('content-type')).toContain('application/json');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.errors).toBeDefined();
      expect(json.errors.email).toEqual(['Invalid email address format']);
      expect(json.errors.age).toEqual(['Must be at least 18 years old']);
    });

    it('returns HTTP 422 with formErrors for schema issues without path', async () => {
      const standardSchema = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: async () => ({
            issues: [{ message: 'Global root level form constraint violated' }],
          }),
        },
      };

      registry.register(actionId, async (data) => data, undefined, standardSchema);

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 123 }),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.formErrors).toContain('Global root level form constraint violated');
    });

    it('returns HTTP 422 with safeParse (Zod) schema validation failure', async () => {
      const zodLikeSchema = {
        safeParse: (val: any) => {
          if (!val?.username) {
            return {
              success: false,
              error: {
                issues: [{ path: ['username'], message: 'Username is mandatory' }],
              },
            };
          }
          return { success: true, data: val };
        },
      };

      registry.register(actionId, async (data) => data, undefined, zodLikeSchema);

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.errors.username).toEqual(['Username is mandatory']);
    });

    it('returns HTTP 422 with custom function validator that throws', async () => {
      const functionValidator = (val: any) => {
        if (!val?.secret) {
          throw new Error('Secret passkey required');
        }
        return val;
      };

      registry.register(actionId, async (data) => data, undefined, functionValidator);

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.formErrors).toContain('Secret passkey required');
    });
  });

  // =========================================================================
  // TARGET 3: Streaming NDJSON Frames & Client Resolution
  // =========================================================================
  describe('3. Streaming NDJSON Frames', () => {
    const streamActionId = 'act_bbbbbbbbbbbbbbbb';

    it('emits terminal frame {"type":"result","success":true,"data":chunks} for AsyncIterable', async () => {
      registry.register(streamActionId, async function* () {
        yield 'chunk1';
        yield 'chunk2';
        yield 'chunk3';
      });

      const req = new Request(`http://localhost/_ranu/action/${streamActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(streamActionId, req, ctx, registry);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/x-ndjson');

      const raw = await res.text();
      const frames = raw.trim().split('\n').map((l) => JSON.parse(l));

      expect(frames.length).toBe(4);
      expect(frames[0]).toEqual({ type: 'chunk', value: 'chunk1' });
      expect(frames[1]).toEqual({ type: 'chunk', value: 'chunk2' });
      expect(frames[2]).toEqual({ type: 'chunk', value: 'chunk3' });
      expect(frames[3]).toEqual({
        type: 'result',
        success: true,
        data: ['chunk1', 'chunk2', 'chunk3'],
      });
    });

    it('emits terminal frame for ReadableStream and client-stub resolves data without losing chunks', async () => {
      registry.register(streamActionId, async () => {
        return new ReadableStream({
          start(controller) {
            controller.enqueue({ item: 1 });
            controller.enqueue({ item: 2 });
            controller.close();
          },
        });
      });

      const req = new Request(`http://localhost/_ranu/action/${streamActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const serverRes = await executeServerAction(streamActionId, req, ctx, registry);
      const streamText = await serverRes.text();

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(streamText, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        });

        const stub = createClientActionStub(streamActionId);
        const clientRes = await stub({});

        expect(clientRes.success).toBe(true);
        expect(clientRes.data).toEqual([{ item: 1 }, { item: 2 }]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('client-stub handles chunks fragmented across multiple TCP packets / buffer boundaries', async () => {
      // Simulate fragmented stream chunks split across read() calls
      const fullNdjson =
        JSON.stringify({ type: 'chunk', value: 'fragmented-1' }) +
        '\n' +
        JSON.stringify({ type: 'chunk', value: 'fragmented-2' }) +
        '\n' +
        JSON.stringify({ type: 'result', success: true, data: ['fragmented-1', 'fragmented-2'] }) +
        '\n';

      // Split into tiny 10-byte fragments
      const fragments: Uint8Array[] = [];
      const encoder = new TextEncoder();
      const rawBytes = encoder.encode(fullNdjson);
      for (let i = 0; i < rawBytes.length; i += 10) {
        fragments.push(rawBytes.slice(i, i + 10));
      }

      const fragmentedStream = new ReadableStream({
        start(controller) {
          for (const frag of fragments) {
            controller.enqueue(frag);
          }
          controller.close();
        },
      });

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(fragmentedStream, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        });

        const stub = createClientActionStub(streamActionId);
        const result = await stub({});

        expect(result.success).toBe(true);
        expect(result.data).toEqual(['fragmented-1', 'fragmented-2']);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // TARGET 4: Mid-Stream Error Handling
  // =========================================================================
  describe('4. Mid-stream Error Handling', () => {
    const errorActionId = 'act_cccccccccccccccc';

    it('unwraps flat error frames into RanuActionStreamError on client', async () => {
      const flatErrorNdjson =
        JSON.stringify({ type: 'chunk', value: 'starting' }) +
        '\n' +
        JSON.stringify({
          $e: true,
          code: 'FLAT_ERR_CODE',
          message: 'Flat mid-stream failure',
          recoverable: true,
        }) +
        '\n';

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(flatErrorNdjson, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        });

        const stub = createClientActionStub(errorActionId);
        let capturedErr: any;
        try {
          await stub({});
        } catch (err) {
          capturedErr = err;
        }

        expect(capturedErr).toBeInstanceOf(RanuActionStreamError);
        expect(capturedErr.message).toBe('Flat mid-stream failure');
        expect(capturedErr.code).toBe('FLAT_ERR_CODE');
        expect(capturedErr.recoverable).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('unwraps nested { error: { code, message, recoverable } } frames into RanuActionStreamError on client', async () => {
      const nestedErrorNdjson =
        JSON.stringify({ type: 'chunk', value: 'starting' }) +
        '\n' +
        JSON.stringify({
          $e: true,
          error: {
            code: 'NESTED_ERR_CODE',
            message: 'Nested mid-stream failure',
            recoverable: false,
          },
        }) +
        '\n';

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(nestedErrorNdjson, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        });

        const stub = createClientActionStub(errorActionId);
        let capturedErr: any;
        try {
          await stub({});
        } catch (err) {
          capturedErr = err;
        }

        expect(capturedErr).toBeInstanceOf(RanuActionStreamError);
        expect(capturedErr.message).toBe('Nested mid-stream failure');
        expect(capturedErr.code).toBe('NESTED_ERR_CODE');
        expect(capturedErr.recoverable).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('end-to-end: server generator throws, server emits dual-format error frame, client throws RanuActionStreamError', async () => {
      registry.register(errorActionId, async function* () {
        yield { stage: 1 };
        const e: any = new Error('Database connection interrupted during stream');
        e.code = 'DB_CONNECTION_DROP';
        e.recoverable = true;
        throw e;
      });

      const req = new Request(`http://localhost/_ranu/action/${errorActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const serverRes = await executeServerAction(errorActionId, req, ctx, registry);
      const text = await serverRes.text();

      const frames = text.trim().split('\n').map((l) => JSON.parse(l));
      expect(frames.length).toBe(2);
      expect(frames[1].$e).toBe(true);
      expect(frames[1].code).toBe('DB_CONNECTION_DROP');
      expect(frames[1].error).toEqual({
        code: 'DB_CONNECTION_DROP',
        message: 'Database connection interrupted during stream',
        recoverable: true,
      });

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson' },
          });
        });

        const stub = createClientActionStub(errorActionId);
        await expect(stub({})).rejects.toThrow(RanuActionStreamError);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // TARGET 5: Prototype Pollution Hardening
  // =========================================================================
  describe('5. Prototype Pollution', () => {
    const protoActionId = 'act_dddddddddddddddd';

    it('formDataToObject rejects __proto__, constructor, prototype and does not pollute Object prototype', async () => {
      let receivedInput: any;
      registry.register(protoActionId, async (input) => {
        receivedInput = input;
        return { ok: true };
      });

      const formData = new FormData();
      formData.append('title', 'harmless title');
      formData.append('__proto__', 'polluted_proto');
      formData.append('constructor', 'polluted_constructor');
      formData.append('prototype', 'polluted_prototype');

      const req = new Request(`http://localhost/_ranu/action/${protoActionId}`, {
        method: 'POST',
        body: formData,
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(protoActionId, req, ctx, registry);

      expect(res.status).toBe(200);
      expect(receivedInput).toBeDefined();
      expect(receivedInput.title).toBe('harmless title');

      // Verify keys were completely skipped
      expect(receivedInput.__proto__).toBeUndefined();
      expect(receivedInput.constructor).toBeUndefined();
      expect(receivedInput.prototype).toBeUndefined();
      expect(Object.keys(receivedInput)).toEqual(['title']);

      // Assert global Object prototype was not contaminated
      expect((Object.prototype as any).polluted_proto).toBeUndefined();
      expect((Object.prototype as any).polluted_constructor).toBeUndefined();
      expect((Object.prototype as any).polluted_prototype).toBeUndefined();
      expect(({} as any).polluted_proto).toBeUndefined();
    });
  });
});
