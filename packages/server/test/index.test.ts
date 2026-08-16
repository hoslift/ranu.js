import { describe, it, expect, beforeEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  cookies,
  headers,
  redirect,
  notFound,
  getRequestContext,
} from '../src/index.js';
import {
  registerRequestContextStore,
  setRequestContextStore,
  type RequestContextStore,
  type RanuRequestContext,
  RedirectSignal,
  NotFoundSignal,
} from '@ranu/runtime';

class MockContextStore implements RequestContextStore {
  private storage = new AsyncLocalStorage<RanuRequestContext>();

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(context, callback);
  }

  get(): RanuRequestContext | undefined {
    return this.storage.getStore();
  }
}

function createMockContext(init?: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  requestId?: string;
  depth?: number;
}): RanuRequestContext {
  const url = new URL(init?.url ?? 'http://localhost:3000/api/test');
  const reqHeaders = new Headers(init?.headers);
  const request = new Request(url.toString(), {
    method: init?.method ?? 'GET',
    headers: reqHeaders,
  });

  return {
    requestId: init?.requestId ?? 'test-request-id-123',
    request,
    url,
    params: {},
    locals: new Map<string, unknown>(),
    signal: request.signal,
    responseCookies: [],
    depth: init?.depth ?? 1,
  };
}

describe('@ranu/server — Server Helpers', () => {
  let store: MockContextStore;

  beforeEach(() => {
    store = new MockContextStore();
    setRequestContextStore(store);
  });

  describe('getRequestContext()', () => {
    it('returns the active RanuRequestContext when called inside request execution', () => {
      const ctx = createMockContext();
      store.run(ctx, () => {
        const resolved = getRequestContext();
        expect(resolved).toBe(ctx);
        expect(resolved.requestId).toBe('test-request-id-123');
      });
    });

    it('throws a deterministic error when called outside active request lifecycle', () => {
      setRequestContextStore(undefined);
      expect(() => getRequestContext()).toThrowError(
        /getRequestContext\(\) was called outside a valid request lifecycle/
      );
    });
  });

  describe('headers()', () => {
    it('returns incoming request headers with case-insensitive access', () => {
      const ctx = createMockContext({
        headers: {
          'X-Custom-Header': 'CustomValue',
          'Authorization': 'Bearer token123',
        },
      });

      store.run(ctx, () => {
        const reqHeaders = headers();
        expect(reqHeaders.get('x-custom-header')).toBe('CustomValue');
        expect(reqHeaders.get('X-CUSTOM-HEADER')).toBe('CustomValue');
        expect(reqHeaders.get('authorization')).toBe('Bearer token123');
        expect(reqHeaders.has('x-custom-header')).toBe(true);
        expect(reqHeaders.has('missing-header')).toBe(false);
      });
    });

    it('enforces read-only semantics by throwing TypeError on mutation attempts', () => {
      const ctx = createMockContext({
        headers: { 'X-Initial': 'true' },
      });

      store.run(ctx, () => {
        const reqHeaders = headers();
        expect(() => reqHeaders.set('X-Added', 'fail')).toThrow(TypeError);
        expect(() => reqHeaders.append('X-Added', 'fail')).toThrow(TypeError);
        expect(() => reqHeaders.delete('X-Initial')).toThrow(TypeError);
      });
    });

    it('throws when called outside active request lifecycle', () => {
      setRequestContextStore(undefined);
      expect(() => headers()).toThrowError(
        /getRequestContext\(\) was called outside a valid request lifecycle/
      );
    });
  });

  describe('cookies()', () => {
    it('parses simple and multiple request cookies from Cookie header', () => {
      const ctx = createMockContext({
        headers: {
          cookie: 'session_id=s_12345; theme=dark; user_pref=compact',
        },
      });

      store.run(ctx, () => {
        const c = cookies();
        expect(c.has('session_id')).toBe(true);
        expect(c.has('theme')).toBe(true);
        expect(c.has('non_existent')).toBe(false);

        expect(c.get('session_id')).toEqual({ name: 'session_id', value: 's_12345' });
        expect(c.get('theme')).toEqual({ name: 'theme', value: 'dark' });
        expect(c.get('user_pref')).toEqual({ name: 'user_pref', value: 'compact' });

        const all = c.getAll();
        expect(all).toHaveLength(3);
      });
    });

    it('handles quoted and URL-encoded cookie values correctly', () => {
      const ctx = createMockContext({
        headers: {
          cookie: 'quoted="hello world"; encoded=hello%20world%21',
        },
      });

      store.run(ctx, () => {
        const c = cookies();
        expect(c.get('quoted')?.value).toBe('hello world');
        expect(c.get('encoded')?.value).toBe('hello world!');
      });
    });

    it('handles malformed and empty cookies safely without crashing', () => {
      const ctx = createMockContext({
        headers: {
          cookie: ';;   ; invalid; =emptyname; valid=123; malformed=%E0%A4%A; ',
        },
      });

      store.run(ctx, () => {
        const c = cookies();
        expect(c.get('valid')?.value).toBe('123');
        expect(c.get('invalid')?.value).toBe('');
      });
    });

    it('mutates cookies via set() and records into typed context.responseCookies without touching context.locals', () => {
      const ctx = createMockContext({
        headers: {
          cookie: 'initial=1',
        },
      });

      // Populate user application locals to ensure complete isolation
      ctx.locals.set('user', { name: 'Alice' });

      store.run(ctx, () => {
        const c = cookies();
        expect(c.get('initial')?.value).toBe('1');
        expect(c.has('new_cookie')).toBe(false);

        c.set('new_cookie', 'val_abc', {
          path: '/app',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 3600,
        });

        expect(c.has('new_cookie')).toBe(true);
        expect(c.get('new_cookie')?.value).toBe('val_abc');

        // Typed context.responseCookies is populated
        expect(ctx.responseCookies).toHaveLength(1);
        expect(ctx.responseCookies[0]).toBe(
          'new_cookie=val_abc; Max-Age=3600; Path=/app; Secure; HttpOnly; SameSite=Lax'
        );

        // context.locals remains untouched application state
        expect(ctx.locals.size).toBe(1);
        expect(ctx.locals.get('user')).toEqual({ name: 'Alice' });
      });
    });

    it('serializes Date and numeric expires correctly', () => {
      const ctx = createMockContext();

      store.run(ctx, () => {
        const c = cookies();
        const date = new Date('2030-01-01T00:00:00.000Z');
        c.set('exp_date', 'val1', { expires: date });
        c.set('exp_num', 'val2', { expires: date.getTime() });

        expect(ctx.responseCookies).toHaveLength(2);
        expect(ctx.responseCookies[0]).toContain(`Expires=${date.toUTCString()}`);
        expect(ctx.responseCookies[1]).toContain(`Expires=${date.toUTCString()}`);
      });
    });

    it('deletes cookies via delete() by setting Max-Age=0 and epoch expiration in responseCookies', () => {
      const ctx = createMockContext({
        headers: {
          cookie: 'auth_token=secret_123',
        },
      });

      store.run(ctx, () => {
        const c = cookies();
        expect(c.has('auth_token')).toBe(true);

        c.delete('auth_token', { path: '/auth' });

        expect(c.has('auth_token')).toBe(false);
        expect(c.get('auth_token')).toBeUndefined();

        expect(ctx.responseCookies).toHaveLength(1);
        expect(ctx.responseCookies[0]).toContain('auth_token=');
        expect(ctx.responseCookies[0]).toContain('Max-Age=0');
        expect(ctx.responseCookies[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        expect(ctx.responseCookies[0]).toContain('Path=/auth');
      });
    });

    it('validates cookie name against invalid characters and CRLF injection', () => {
      const ctx = createMockContext();

      store.run(ctx, () => {
        const c = cookies();
        expect(() => c.set('', 'val')).toThrow(TypeError);
        expect(() => c.set('invalid name', 'val')).toThrow(TypeError);
        expect(() => c.set('invalid;name', 'val')).toThrow(TypeError);
        expect(() => c.set('invalid=name', 'val')).toThrow(TypeError);
        expect(() => c.set('valid_name', 'bad\r\nvalue')).toThrow(TypeError);
      });
    });
  });

  describe('redirect()', () => {
    it('throws RedirectSignal with default status 307', () => {
      expect(() => redirect('/dashboard')).toThrow(RedirectSignal);
      try {
        redirect('/dashboard');
      } catch (err) {
        expect(err).toBeInstanceOf(RedirectSignal);
        const signal = err as RedirectSignal;
        expect(signal.url).toBe('/dashboard');
        expect(signal.status).toBe(307);
      }
    });

    it('throws RedirectSignal with custom status 308', () => {
      try {
        redirect('/new-location', 308);
      } catch (err) {
        expect(err).toBeInstanceOf(RedirectSignal);
        const signal = err as RedirectSignal;
        expect(signal.url).toBe('/new-location');
        expect(signal.status).toBe(308);
      }
    });

    it('rejects invalid redirect status codes', () => {
      expect(() => redirect('/test', 301 as any)).toThrow(/Invalid redirect status: 301/);
      expect(() => redirect('/test', 200 as any)).toThrow(/Invalid redirect status: 200/);
    });
  });

  describe('notFound()', () => {
    it('throws NotFoundSignal', () => {
      expect(() => notFound()).toThrow(NotFoundSignal);
    });
  });

  describe('Multi-Runtime Isolation & Deterministic Nested Resolution', () => {
    it('deterministically resolves innermost context in nested runtime execution regardless of registration order', async () => {
      const storeA = new MockContextStore();
      const storeB = new MockContextStore();

      // Test with registration order: A then B
      const unregA = registerRequestContextStore(storeA);
      const unregB = registerRequestContextStore(storeB);

      const ctxA = createMockContext({
        requestId: 'outer-runtime-A',
        headers: { 'X-Origin': 'Outer-A' },
        depth: 1,
      });

      const ctxB = createMockContext({
        requestId: 'inner-runtime-B',
        headers: { 'X-Origin': 'Inner-B' },
        depth: 2,
      });

      await storeA.run(ctxA, async () => {
        expect(getRequestContext().requestId).toBe('outer-runtime-A');
        expect(headers().get('x-origin')).toBe('Outer-A');

        // Nested execution in Runtime B
        await storeB.run(ctxB, async () => {
          expect(getRequestContext().requestId).toBe('inner-runtime-B');
          expect(headers().get('x-origin')).toBe('Inner-B');
        });

        // Control returns to Runtime A
        expect(getRequestContext().requestId).toBe('outer-runtime-A');
        expect(headers().get('x-origin')).toBe('Outer-A');
      });

      unregA();
      unregB();
    });

    it('deterministically resolves innermost context with REVERSE registration order (B then A)', async () => {
      const storeA = new MockContextStore();
      const storeB = new MockContextStore();

      // Reverse registration: B then A
      const unregB = registerRequestContextStore(storeB);
      const unregA = registerRequestContextStore(storeA);

      const ctxA = createMockContext({
        requestId: 'outer-runtime-A',
        headers: { 'X-Origin': 'Outer-A' },
        depth: 1,
      });

      const ctxB = createMockContext({
        requestId: 'inner-runtime-B',
        headers: { 'X-Origin': 'Inner-B' },
        depth: 2,
      });

      await storeA.run(ctxA, async () => {
        expect(getRequestContext().requestId).toBe('outer-runtime-A');
        expect(headers().get('x-origin')).toBe('Outer-A');

        // Nested execution in Runtime B
        await storeB.run(ctxB, async () => {
          expect(getRequestContext().requestId).toBe('inner-runtime-B');
          expect(headers().get('x-origin')).toBe('Inner-B');
        });

        // Control returns to Runtime A
        expect(getRequestContext().requestId).toBe('outer-runtime-A');
        expect(headers().get('x-origin')).toBe('Outer-A');
      });

      unregA();
      unregB();
    });

    it('unregisters store cleanly on disposal without leaving stale references', () => {
      const tempStore = new MockContextStore();
      const unregister = registerRequestContextStore(tempStore);

      const ctx = createMockContext({ requestId: 'temp-ctx' });

      tempStore.run(ctx, () => {
        expect(getRequestContext().requestId).toBe('temp-ctx');
      });

      // Dispose store
      unregister();

      // Calling helper after unregister must not see disposed store
      tempStore.run(ctx, () => {
        // Because tempStore is unregistered and default store is empty
        expect(() => getRequestContext()).toThrowError(/getRequestContext\(\) was called outside a valid request lifecycle/);
      });
    });

    it('maintains strict header and cookie isolation across concurrent async executions within the same store', async () => {
      const ctxA = createMockContext({
        url: 'http://localhost:3000/a',
        headers: { 'X-Tenant': 'Tenant-A', cookie: 'user=Alice' },
      });
      const ctxB = createMockContext({
        url: 'http://localhost:3000/b',
        headers: { 'X-Tenant': 'Tenant-B', cookie: 'user=Bob' },
      });

      const taskA = store.run(ctxA, async () => {
        await new Promise((res) => setTimeout(res, 20));
        expect(headers().get('x-tenant')).toBe('Tenant-A');
        expect(cookies().get('user')?.value).toBe('Alice');
        cookies().set('result', 'A_done');
        return cookies().get('result')?.value;
      });

      const taskB = store.run(ctxB, async () => {
        await new Promise((res) => setTimeout(res, 10));
        expect(headers().get('x-tenant')).toBe('Tenant-B');
        expect(cookies().get('user')?.value).toBe('Bob');
        cookies().set('result', 'B_done');
        return cookies().get('result')?.value;
      });

      const [resA, resB] = await Promise.all([taskA, taskB]);
      expect(resA).toBe('A_done');
      expect(resB).toBe('B_done');
    });
  });
});
