import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { RanuActionStreamError } from '@ranu/core';
import { createClientActionStub } from '../src/forms/client-stub.js';
import { useFormAction } from '../src/forms/use-form-action.js';
import { renderReactToStream } from '../src/stream.js';

describe('@ranu/react — Wire Protocol Action Stub & useFormAction', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('createClientActionStub submits JSON payload with headers', async () => {
    const actionId = 'act_1122334455667788';
    let interceptedUrl = '';
    let interceptedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => {
      interceptedUrl = String(url);
      interceptedInit = init;
      return new Response(JSON.stringify({ success: true, data: { user: 'alice' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const stub = createClientActionStub<{ name: string }, { user: string }>(actionId);
    expect((stub as any).$$ACTION_ID).toBe(actionId);

    const result = await stub({ name: 'alice' });

    expect(interceptedUrl).toBe('/_ranu/action/' + actionId);
    expect(interceptedInit?.method).toBe('POST');
    const headers = new Headers(interceptedInit?.headers);
    expect(headers.get('x-ranu-action-id')).toBe(actionId);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(interceptedInit?.body as string)).toEqual({ name: 'alice' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ user: 'alice' });

    // Test raw method
    const rawData = await stub.raw({ name: 'alice' });
    expect(rawData).toEqual({ user: 'alice' });
  });

  it('createClientActionStub submits FormData payload without manual Content-Type header', async () => {
    const actionId = 'act_aabbccddeeff0011';
    let interceptedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn(async (_url: any, init?: RequestInit) => {
      interceptedInit = init;
      return new Response(JSON.stringify({ success: true, data: { uploaded: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const stub = createClientActionStub(actionId);
    const formData = new FormData();
    formData.append('fileKey', 'value123');

    const result = await stub(formData);

    expect(interceptedInit?.body).toBe(formData);
    const headers = new Headers(interceptedInit?.headers);
    expect(headers.get('x-ranu-action-id')).toBe(actionId);
    // Content-Type must not be forced to json when FormData is provided
    expect(headers.get('content-type')).toBeNull();
    expect(result.success).toBe(true);
  });

  it('createClientActionStub handles streaming NDJSON and parses result', async () => {
    const actionId = 'act_9988776655443322';

    const ndjsonContent =
      JSON.stringify({ type: 'chunk', value: 'part 1' }) +
      '\n' +
      JSON.stringify({ type: 'chunk', value: 'part 2' }) +
      '\n' +
      JSON.stringify({ type: 'result', data: 'stream finished' }) +
      '\n';

    globalThis.fetch = vi.fn(async () => {
      return new Response(ndjsonContent, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      });
    });

    const stub = createClientActionStub(actionId);
    const result = await stub({ prompt: 'hello' });

    expect(result.success).toBe(true);
    expect(result.data).toBe('stream finished');
  });

  it('throws RanuActionStreamError on mid-stream exception frame', async () => {
    const actionId = 'act_9988776655443322';

    const ndjsonWithError =
      JSON.stringify({ type: 'chunk', value: 'initial data' }) +
      '\n' +
      JSON.stringify({
        $e: true,
        code: 'DOWNSTREAM_TIMEOUT',
        message: 'External service timed out mid-stream',
        recoverable: false,
      }) +
      '\n';

    globalThis.fetch = vi.fn(async () => {
      return new Response(ndjsonWithError, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      });
    });

    const stub = createClientActionStub(actionId);
    await expect(stub({})).rejects.toThrow(RanuActionStreamError);
    try {
      await stub({});
    } catch (err: any) {
      expect(err).toBeInstanceOf(RanuActionStreamError);
      expect(err.code).toBe('DOWNSTREAM_TIMEOUT');
      expect(err.message).toBe('External service timed out mid-stream');
      expect(err.recoverable).toBe(false);
    }
  });

  it('useFormAction integrates seamlessly with client action stub', async () => {
    const actionId = 'act_0011223344556677';

    globalThis.fetch = vi.fn(async (_url: any, init?: RequestInit) => {
      const parsed = JSON.parse(init?.body as string);
      if (!parsed.email) {
        return new Response(
          JSON.stringify({
            success: false,
            errors: { email: ['Email required'] },
            formErrors: [],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: { registered: true, email: parsed.email },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    const actionStub = createClientActionStub<{ email?: string }, { registered: boolean; email: string }>(
      actionId,
    );

    let capturedState: any;
    const onSuccess = vi.fn();
    const onError = vi.fn();

    function FormComponent() {
      capturedState = useFormAction(actionStub, { onSuccess, onError });
      return <form>Registration</form>;
    }

    await renderReactToStream(<FormComponent />);

    // 1. Submit with error
    const errRes = await capturedState.submit({ email: '' });
    expect(errRes.success).toBe(false);
    expect(errRes.errors).toEqual({ email: ['Email required'] });
    expect(onError).toHaveBeenCalledWith({ email: ['Email required'] }, []);

    // 2. Submit with success
    const succRes = await capturedState.submit({ email: 'user@ranu.dev' });
    expect(succRes.success).toBe(true);
    expect(succRes.data).toEqual({ registered: true, email: 'user@ranu.dev' });
    expect(onSuccess).toHaveBeenCalledWith({ registered: true, email: 'user@ranu.dev' });
  });

  it('accumulates chunks when terminal result frame does not include data', async () => {
    const actionId = 'act_chunk_acc_001';

    const ndjsonWithoutResultData =
      JSON.stringify({ type: 'chunk', value: 'token 1' }) +
      '\n' +
      JSON.stringify({ type: 'chunk', value: 'token 2' }) +
      '\n' +
      JSON.stringify({ type: 'chunk', value: 'token 3' }) +
      '\n' +
      JSON.stringify({ type: 'result', success: true }) +
      '\n';

    globalThis.fetch = vi.fn(async () => {
      return new Response(ndjsonWithoutResultData, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      });
    });

    const stub = createClientActionStub(actionId);
    const result = await stub({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual(['token 1', 'token 2', 'token 3']);
  });

  it('unwraps nested error frames into RanuActionStreamError', async () => {
    const actionId = 'act_nested_err_002';

    const ndjsonWithNestedError =
      JSON.stringify({
        $e: true,
        error: {
          code: 'NESTED_TIMEOUT',
          message: 'Operation timed out from nested service',
          recoverable: true,
        },
      }) + '\n';

    globalThis.fetch = vi.fn(async () => {
      return new Response(ndjsonWithNestedError, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      });
    });

    const stub = createClientActionStub(actionId);
    await expect(stub({})).rejects.toThrow(RanuActionStreamError);

    try {
      await stub({});
    } catch (err: any) {
      expect(err).toBeInstanceOf(RanuActionStreamError);
      expect(err.code).toBe('NESTED_TIMEOUT');
      expect(err.message).toBe('Operation timed out from nested service');
      expect(err.recoverable).toBe(true);
    }
  });
});
