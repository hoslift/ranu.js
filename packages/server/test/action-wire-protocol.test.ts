import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { cookies } from '../src/cookies.js';
import { headers } from '../src/headers.js';
import { getRequestContext } from '../src/context.js';

class TestContextStore implements RequestContextStore {
  private als = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.als.getStore();
  }
}

describe('Server Actions HTTP RPC Wire Protocol', () => {
  let unregister: (() => void) | undefined;
  let contextStore: TestContextStore;
  let registry: ServerActionRegistry;

  const createMockContext = (request: Request): RanuRequestContext => {
    const url = new URL(request.url);
    const locals = new Map<string, unknown>();
    const responseCookies: string[] = [];

    return {
      requestId: 'test-req-uuid-1234',
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

  it('rejects non-POST HTTP methods with 405 Method Not Allowed', async () => {
    const actionId = 'act_0123456789abcdef';
    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'GET',
    });
    const context = createMockContext(request);

    const response = await executeServerAction(actionId, request, context, registry);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('rejects invalid actionId formats with 400 Bad Request', async () => {
    const actionId = 'invalid_action_id';
    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const context = createMockContext(request);

    const response = await executeServerAction(actionId, request, context, registry);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.formErrors[0]).toContain('Invalid action ID format');
  });

  it('returns 404 when action is not found in current build or grace table', async () => {
    const actionId = 'act_0123456789abcdef';
    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const context = createMockContext(request);

    const response = await executeServerAction(actionId, request, context, registry);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.formErrors[0]).toContain('not found');
  });

  it('executes action with JSON payload and Standard Schema validation', async () => {
    const actionId = 'act_aabbccddeeff0011';

    // Standard Schema mock
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: any) => {
          if (!value.name || typeof value.name !== 'string') {
            return {
              issues: [{ message: 'Name is required and must be a string', path: ['name'] }],
            };
          }
          return { value: { name: value.name.toUpperCase() } };
        },
      },
    };

    registry.register(
      actionId,
      async (input: { name: string }) => {
        return { message: `Hello, ${input.name}!` };
      },
      undefined,
      schema,
    );

    // 1. Valid payload
    const validReq = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    const validCtx = createMockContext(validReq);

    const validRes = await contextStore.run(validCtx, () =>
      executeServerAction(actionId, validReq, validCtx, registry),
    );
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.success).toBe(true);
    expect(validBody.data).toEqual({ message: 'Hello, ALICE!' });

    // 2. Invalid payload failing schema validation
    const invalidReq = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 12345 }),
    });
    const invalidCtx = createMockContext(invalidReq);

    const invalidRes = await contextStore.run(invalidCtx, () =>
      executeServerAction(actionId, invalidReq, invalidCtx, registry),
    );
    expect(invalidRes.status).toBe(422);
    const invalidBody = await invalidRes.json();
    expect(invalidBody.success).toBe(false);
    expect(invalidBody.errors.name).toContain('Name is required and must be a string');
  });

  it('executes action with FormData payload', async () => {
    const actionId = 'act_1122334455667788';

    registry.register(actionId, async (data: Record<string, unknown>) => {
      return { user: data.username, email: data.email };
    });

    const formData = new FormData();
    formData.append('username', 'ranuuser');
    formData.append('email', 'user@ranu.dev');

    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      body: formData,
    });
    const context = createMockContext(request);

    const response = await contextStore.run(context, () =>
      executeServerAction(actionId, request, context, registry),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ user: 'ranuuser', email: 'user@ranu.dev' });
  });

  it('runs within active RanuRequestContext with cookies(), headers(), and getRequestContext()', async () => {
    const actionId = 'act_ccaabb1122334455';

    registry.register(actionId, async () => {
      const ctx = getRequestContext();
      const currentHeaders = headers();
      const currentCookies = cookies();

      currentCookies.set('session_id', 'sess_999', { httpOnly: true });

      return {
        requestId: ctx.requestId,
        authHeader: currentHeaders.get('authorization'),
      };
    });

    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token-xyz',
      },
      body: JSON.stringify({}),
    });
    const context = createMockContext(request);

    const response = await contextStore.run(context, () =>
      executeServerAction(actionId, request, context, registry),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.requestId).toBe('test-req-uuid-1234');
    expect(body.data.authHeader).toBe('Bearer test-token-xyz');
    expect(context.responseCookies.length).toBeGreaterThan(0);
    expect(context.responseCookies[0]).toContain('session_id=sess_999');
  });

  it('serializes streaming NDJSON response', async () => {
    const actionId = 'act_1111222233334444';

    registry.register(actionId, async function* () {
      yield { step: 1, text: 'Thinking...' };
      yield { step: 2, text: 'Generating response...' };
      yield { step: 3, text: 'Complete!' };
    });

    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const context = createMockContext(request);

    const response = await contextStore.run(context, () =>
      executeServerAction(actionId, request, context, registry),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');

    const text = await response.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));

    expect(lines.length).toBe(4);
    expect(lines[0]).toEqual({ type: 'chunk', value: { step: 1, text: 'Thinking...' } });
    expect(lines[1]).toEqual({ type: 'chunk', value: { step: 2, text: 'Generating response...' } });
    expect(lines[2]).toEqual({ type: 'chunk', value: { step: 3, text: 'Complete!' } });
    expect(lines[3]).toEqual({
      type: 'result',
      success: true,
      data: [
        { step: 1, text: 'Thinking...' },
        { step: 2, text: 'Generating response...' },
        { step: 3, text: 'Complete!' },
      ],
    });
  });

  it('emits structured mid-stream exception frame when streaming fails', async () => {
    const actionId = 'act_aaaabbbbccccdddd';

    registry.register(actionId, async function* () {
      yield { part: 1 };
      const streamErr: any = new Error('Database connection lost mid-stream');
      streamErr.code = 'DB_TIMEOUT';
      streamErr.recoverable = false;
      throw streamErr;
    });

    const request = new Request(`http://localhost/_ranu/action/${actionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const context = createMockContext(request);

    const response = await contextStore.run(context, () =>
      executeServerAction(actionId, request, context, registry),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');

    const text = await response.text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));

    expect(lines.length).toBe(2);
    expect(lines[0]).toEqual({ type: 'chunk', value: { part: 1 } });
    expect(lines[1]).toEqual({
      $e: true,
      code: 'DB_TIMEOUT',
      message: 'Database connection lost mid-stream',
      recoverable: false,
      error: {
        code: 'DB_TIMEOUT',
        message: 'Database connection lost mid-stream',
        recoverable: false,
      },
    });
  });

  it('resolves N-1 Grace Table actions seamlessly during rolling updates', async () => {
    const currentActionId = 'act_c0c0c0c0c0c0c0c0';
    const previousGraceActionId = 'act_b0b0b0b0b0b0b0b0';

    // Current build action
    registry.register(currentActionId, async () => ({ version: 'v2' }));

    // N-1 Grace table action (from previous build)
    registry.registerGrace(previousGraceActionId, async () => ({ version: 'v1' }));

    // Request from current client
    const currentReq = new Request(`http://localhost/_ranu/action/${currentActionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const currentCtx = createMockContext(currentReq);
    const currentRes = await executeServerAction(currentActionId, currentReq, currentCtx, registry);
    const currentBody = await currentRes.json();
    expect(currentBody.data).toEqual({ version: 'v2' });

    // Request from N-1 client routed to this pod
    const graceReq = new Request(`http://localhost/_ranu/action/${previousGraceActionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const graceCtx = createMockContext(graceReq);
    const graceRes = await executeServerAction(previousGraceActionId, graceReq, graceCtx, registry);
    expect(graceRes.status).toBe(200);
    const graceBody = await graceRes.json();
    expect(graceBody.data).toEqual({ version: 'v1' });
  });
});
