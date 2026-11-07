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

class TestContextStore implements RequestContextStore {
  private als = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.als.getStore();
  }
}

describe('Adversarial Wire Protocol Challenger Tests', () => {
  let unregister: (() => void) | undefined;
  let contextStore: TestContextStore;
  let registry: ServerActionRegistry;

  const createMockContext = (request: Request): RanuRequestContext => {
    const url = new URL(request.url);
    const locals = new Map<string, unknown>();
    const responseCookies: string[] = [];

    return {
      requestId: 'adv-req-12345',
      request,
      url,
      params: {},
      locals,
      signal: request.signal,
      responseCookies,
      waitUntil: () => {},
    };
  };

  beforeEach(() => {
    contextStore = new TestContextStore();
    unregister = registerRequestContextStore(contextStore);
    registry = new ServerActionRegistry();
  });

  afterEach(() => {
    unregister?.();
    registry.clear();
  });

  // =========================================================================
  // TARGET 1: Wire Protocol Endpoint Hardening
  // =========================================================================
  describe('Target 1: Endpoint Hardening', () => {
    const validActionId = 'act_0123456789abcdef';

    beforeEach(() => {
      registry.register(validActionId, async () => ({ ok: true }));
    });

    it('rejects all non-POST methods with 405 and Allow: POST', async () => {
      const methods = ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
      for (const method of methods) {
        const req = new Request(`http://localhost/_ranu/action/${validActionId}`, {
          method,
        });
        const ctx = createMockContext(req);
        const res = await executeServerAction(validActionId, req, ctx, registry);
        expect(res.status, `Method ${method} should return 405`).toBe(405);
        expect(res.headers.get('Allow'), `Method ${method} should have Allow: POST`).toBe('POST');
      }
    });

    it('asserts status code on malformed action IDs', async () => {
      const malformedIds = [
        'act_../../../etc',
        'act_../etc',
        'act_1234',                    // Too short (4 hex instead of 16)
        'act_0123456789abcdef01',      // Too long (18 hex instead of 16)
        'act_0123456789ABCDEF',        // Uppercase
        'act_0123456789ghijkl',        // Non-hex characters
        '../act_0123456789abcdef',      // Traversal prefix
        'act_0123456789abcdef;DROP',   // Special chars
        '',                            // Empty
        'plain_id',                    // Missing act_ prefix
      ];

      for (const malformedId of malformedIds) {
        const req = new Request(`http://localhost/_ranu/action/${malformedId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const ctx = createMockContext(req);
        const res = await executeServerAction(malformedId, req, ctx, registry);
        
        // Let's inspect the actual status code returned by the server:
        // The requirement asks: "Malformed Action IDs: Assert 400 Bad Request"
        console.log(`[Malformed ID Probe] id="${malformedId}" -> status=${res.status}`);
        expect(res.status, `Malformed ID "${malformedId}" should return 400`).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
      }
    });

    it('returns 404 for well-formed but non-existent action ID', async () => {
      const unknownId = 'act_fedcba9876543210';
      const req = new Request(`http://localhost/_ranu/action/${unknownId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(unknownId, req, ctx, registry);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.formErrors[0]).toContain('not found');
    });
  });

  // =========================================================================
  // TARGET 2: Payload Extraction & Validation Robustness
  // =========================================================================
  describe('Target 2: Payload Extraction & Validation Robustness', () => {
    const actionId = 'act_2222333344445555';

    it('handles JSON payloads with deeply nested objects, arrays, and unicode', async () => {
      let receivedInput: unknown;
      registry.register(actionId, async (input) => {
        receivedInput = input;
        return { echo: input };
      });

      const complexPayload = {
        nested: {
          level1: {
            level2: {
              items: [1, 'two', { three: true }],
            },
          },
        },
        unicode: 'こんにちは 世界 🚀🔥',
        specialChars: '<script>alert("xss")</script>&"\'',
        numeric: [0, -1, 3.14159, 1e10],
        boolean: false,
        nullVal: null,
      };

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(complexPayload),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(receivedInput).toEqual(complexPayload);
    });

    it('handles empty JSON body and malformed JSON syntax gracefully', async () => {
      registry.register(actionId, async (input) => ({ input }));

      // 1. Empty body with Content-Type: application/json
      const emptyReq = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });
      const emptyCtx = createMockContext(emptyReq);
      const emptyRes = await executeServerAction(actionId, emptyReq, emptyCtx, registry);
      console.log(`[Empty JSON Body Probe] status=${emptyRes.status}`);
      expect(emptyRes.status).toBe(400);
      const emptyBody = await emptyRes.json();
      expect(emptyBody.success).toBe(false);

      // 2. Malformed JSON syntax
      const malformedReq = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"unclosed": ',
      });
      const malformedCtx = createMockContext(malformedReq);
      const malformedRes = await executeServerAction(actionId, malformedReq, malformedCtx, registry);
      expect(malformedRes.status).toBe(400);
      const malformedBody = await malformedRes.json();
      expect(malformedBody.success).toBe(false);
    });

    it('handles multipart/form-data with duplicate keys, empty fields, and file-like inputs', async () => {
      let receivedInput: unknown;
      registry.register(actionId, async (input) => {
        receivedInput = input;
        return { received: input };
      });

      const formData = new FormData();
      formData.append('tags', 'tag1');
      formData.append('tags', 'tag2');
      formData.append('tags', 'tag3');
      formData.append('emptyField', '');
      formData.append('avatar', new File(['binary content'], 'avatar.png', { type: 'image/png' }));

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        body: formData,
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);
      expect(res.status).toBe(200);

      const input = receivedInput as Record<string, unknown>;
      expect(Array.isArray(input.tags)).toBe(true);
      expect(input.tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(input.emptyField).toBe('');
      expect(input.avatar).toBeInstanceOf(File);
      expect((input.avatar as File).name).toBe('avatar.png');
    });

    it('inspects schema validation failure status code (422 vs 400)', async () => {
      const schema = {
        '~standard': {
          version: 1,
          vendor: 'zod-mock',
          validate: (val: any) => {
            if (!val || typeof val.email !== 'string' || !val.email.includes('@')) {
              return {
                issues: [
                  { message: 'Invalid email address', path: ['email'] },
                  { message: 'Age is required', path: ['age'] },
                ],
              };
            }
            return { value: val };
          },
        },
      };

      registry.register(actionId, async (data) => data, undefined, schema);

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad-email' }),
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      console.log(`[Schema Validation Status Probe] status=${res.status}`);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.errors.email).toContain('Invalid email address');
      expect(body.errors.age).toContain('Age is required');
    });
  });

  // =========================================================================
  // TARGET 3: Streaming NDJSON & Mid-Stream Error Frames
  // =========================================================================
  describe('Target 3: Streaming NDJSON & Mid-Stream Error Frames', () => {
    const streamActionId = 'act_7777888899990000';

    it('verifies server stream generation and end-to-end client stub consumption', async () => {
      registry.register(streamActionId, async function* () {
        yield { part: 1, data: 'alpha' };
        yield { part: 2, data: 'beta' };
        yield { part: 3, data: 'gamma' };
      });

      const req = new Request(`http://localhost/_ranu/action/${streamActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const serverRes = await executeServerAction(streamActionId, req, ctx, registry);

      expect(serverRes.status).toBe(200);
      expect(serverRes.headers.get('content-type')).toContain('application/x-ndjson');

      // Check the raw NDJSON lines emitted by server
      const rawText = await serverRes.text();
      const lines = rawText.trim().split('\n').map((l) => JSON.parse(l));
      console.log('[Server Emitted NDJSON Lines]:', JSON.stringify(lines));

      expect(lines.length).toBe(4);
      expect(lines[0]).toEqual({ type: 'chunk', value: { part: 1, data: 'alpha' } });
      expect(lines[1]).toEqual({ type: 'chunk', value: { part: 2, data: 'beta' } });
      expect(lines[2]).toEqual({ type: 'chunk', value: { part: 3, data: 'gamma' } });
      expect(lines[3]).toEqual({
        type: 'result',
        success: true,
        data: [
          { part: 1, data: 'alpha' },
          { part: 2, data: 'beta' },
          { part: 3, data: 'gamma' },
        ],
      });

      // Now connect to client stub directly using a mock fetch that returns the real server response
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          // Re-create a fresh response from rawText
          return new Response(rawText, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
          });
        });

        const stub = createClientActionStub(streamActionId);
        const clientResult = await stub({});
        console.log('[Client Stub Return Value for Streaming Action]:', JSON.stringify(clientResult));
        expect(clientResult.data).toEqual([
          { part: 1, data: 'alpha' },
          { part: 2, data: 'beta' },
          { part: 3, data: 'gamma' },
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('verifies mid-stream exception frame generation and client stub rejection', async () => {
      registry.register(streamActionId, async function* () {
        yield { step: 1 };
        const midError: any = new Error('Mid-stream failure occurred!');
        midError.code = 'STREAM_CRASH';
        midError.recoverable = true;
        throw midError;
      });

      const req = new Request(`http://localhost/_ranu/action/${streamActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ctx = createMockContext(req);
      const serverRes = await executeServerAction(streamActionId, req, ctx, registry);

      const rawText = await serverRes.text();
      const lines = rawText.trim().split('\n').map((l) => JSON.parse(l));
      console.log('[Mid-Stream Error Lines]:', JSON.stringify(lines));

      expect(lines.length).toBe(2);
      expect(lines[0]).toEqual({ type: 'chunk', value: { step: 1 } });
      const errorFrame = lines[1];
      console.log('[Mid-Stream Error Frame Structure]:', JSON.stringify(errorFrame));
      expect(errorFrame.$e).toBe(true);

      // Verify client stub handling of this exact server response
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async () => {
          return new Response(rawText, {
            status: 200,
            headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
          });
        });

        const stub = createClientActionStub(streamActionId);
        await expect(stub({})).rejects.toThrow(RanuActionStreamError);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // TARGET 4: N-1 Deployment Grace Table Rolling Pod Simulation
  // =========================================================================
  describe('Target 4: N-1 Deployment Grace Table Rolling Pod Simulation', () => {
    it('simulates multi-pod rolling deployment with N-1 action invocation', async () => {
      // Simulate Pod N running Build 2:
      // Current actions for Build 2
      const build2ActionId = 'act_2222222222222222';
      // Grace table actions from Build 1
      const build1GraceActionId = 'act_1111111111111111';

      registry.register(build2ActionId, async (data: any) => ({
        podVersion: 'build-2',
        processed: data,
      }));

      registry.registerGrace(build1GraceActionId, async (data: any) => ({
        podVersion: 'build-1-grace',
        processed: data,
      }));

      // Case A: Client on Build 1 hits Pod N (grace table action)
      const graceReq = new Request(`http://localhost/_ranu/action/${build1GraceActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'from-old-client' }),
      });
      const graceCtx = createMockContext(graceReq);
      const graceRes = await executeServerAction(build1GraceActionId, graceReq, graceCtx, registry);
      expect(graceRes.status).toBe(200);
      const graceBody = await graceRes.json();
      expect(graceBody.success).toBe(true);
      expect(graceBody.data).toEqual({
        podVersion: 'build-1-grace',
        processed: { item: 'from-old-client' },
      });

      // Case B: Client on Build 2 hits Pod N (current build action)
      const currentReq = new Request(`http://localhost/_ranu/action/${build2ActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'from-new-client' }),
      });
      const currentCtx = createMockContext(currentReq);
      const currentRes = await executeServerAction(build2ActionId, currentReq, currentCtx, registry);
      expect(currentRes.status).toBe(200);
      const currentBody = await currentRes.json();
      expect(currentBody.success).toBe(true);
      expect(currentBody.data).toEqual({
        podVersion: 'build-2',
        processed: { item: 'from-new-client' },
      });

      // Case C: Ancient or non-existent action hits Pod N -> 404
      const ancientActionId = 'act_0000000000000000';
      const ancientReq = new Request(`http://localhost/_ranu/action/${ancientActionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const ancientCtx = createMockContext(ancientReq);
      const ancientRes = await executeServerAction(ancientActionId, ancientReq, ancientCtx, registry);
      expect(ancientRes.status).toBe(404);
      const ancientBody = await ancientRes.json();
      expect(ancientBody.success).toBe(false);
      expect(ancientBody.formErrors[0]).toContain('not found');
    });
  });

  // =========================================================================
  // TARGET 5: Prototype Pollution Hardening
  // =========================================================================
  describe('Target 5: Prototype Pollution Hardening', () => {
    it('safely ignores __proto__, constructor, and prototype in FormData payloads', async () => {
      const actionId = 'act_9999000011112222';
      let capturedPayload: any = null;

      registry.register(actionId, async (data) => {
        capturedPayload = data;
        return { ok: true };
      });

      const formData = new FormData();
      formData.append('username', 'alice');
      formData.append('__proto__', 'polluted');
      formData.append('constructor', 'polluted');
      formData.append('prototype', 'polluted');

      const req = new Request(`http://localhost/_ranu/action/${actionId}`, {
        method: 'POST',
        body: formData,
      });
      const ctx = createMockContext(req);
      const res = await executeServerAction(actionId, req, ctx, registry);

      expect(res.status).toBe(200);
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.username).toBe('alice');
      expect((capturedPayload as any).__proto__).toBeUndefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });
});
