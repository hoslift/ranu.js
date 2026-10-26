import { describe, it, expect, beforeEach } from 'vitest';
import util from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { headers, type ReadonlyHeaders } from '../src/index.js';
import {
  setRequestContextStore,
  type RequestContextStore,
  type RanuRequestContext,
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
  headers?: Record<string, string>;
}): { context: RanuRequestContext; rawHeaders: Headers } {
  const url = new URL('http://localhost:3000/api/test');
  const rawHeaders = new Headers(init?.headers);
  const request = new Request(url.toString(), {
    method: 'GET',
    headers: rawHeaders,
  });

  const context: RanuRequestContext = {
    requestId: 'test-adversarial-req',
    request,
    url,
    params: {},
    locals: new Map<string, unknown>(),
    signal: request.signal,
    responseCookies: [],
    depth: 1,
    waitUntil: () => {},
    waitUntilPromises: [],
  };

  return { context, rawHeaders };
}

describe('@ranu/server — Adversarial Request Header Immutability Attack Suite', () => {
  let store: MockContextStore;

  beforeEach(() => {
    store = new MockContextStore();
    setRequestContextStore(store);
  });

  describe('Vector 1: Direct Property Assignment Traps (set trap)', () => {
    it('repels direct property assignment with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          (reqHeaders as any).injected = 'malicious';
        }).toThrow(TypeError);
        expect(() => {
          (reqHeaders as any)['x-foo'] = 'mutated';
        }).toThrow(TypeError);
        expect(() => {
          (reqHeaders as any).get = () => 'hacked';
        }).toThrow(TypeError);
        expect(() => {
          (reqHeaders as any)[Symbol('custom-symbol')] = 'bad';
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 2: Direct Property Deletion Traps (deleteProperty trap)', () => {
    it('repels delete operations with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          delete (reqHeaders as any).injected;
        }).toThrow(TypeError);
        expect(() => {
          delete (reqHeaders as any)['x-foo'];
        }).toThrow(TypeError);
        expect(() => {
          delete (reqHeaders as any).get;
        }).toThrow(TypeError);
        expect(() => {
          delete (reqHeaders as any)[Symbol.iterator];
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 3: Object.defineProperty & Object.defineProperties Traps (defineProperty trap)', () => {
    it('repels Object.defineProperty and Object.defineProperties with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          Object.defineProperty(reqHeaders, 'injected', {
            value: 'blocked',
            writable: true,
            configurable: true,
          });
        }).toThrow(TypeError);

        expect(() => {
          Object.defineProperty(reqHeaders, 'get', {
            value: () => 'pwned',
            writable: true,
            configurable: true,
          });
        }).toThrow(TypeError);

        expect(() => {
          Object.defineProperty(reqHeaders, 'getterProp', {
            get: () => 'injected',
            configurable: true,
          });
        }).toThrow(TypeError);

        expect(() => {
          Object.defineProperties(reqHeaders, {
            foo: { value: 1, configurable: true },
            bar: { value: 2, configurable: true },
          });
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 4: Object.setPrototypeOf & Prototype Modification (setPrototypeOf trap)', () => {
    it('repels Object.setPrototypeOf with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          Object.setPrototypeOf(reqHeaders, {});
        }).toThrow(TypeError);

        expect(() => {
          Object.setPrototypeOf(reqHeaders, null);
        }).toThrow(TypeError);

        expect(() => {
          Object.setPrototypeOf(reqHeaders, Headers.prototype);
        }).toThrow(TypeError);

        expect(() => {
          (reqHeaders as any).__proto__ = {};
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 5: Reflect API Mutation Traps', () => {
    it('repels Reflect.set, Reflect.deleteProperty, Reflect.defineProperty, Reflect.setPrototypeOf with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();

        // Reflect.set
        expect(() => {
          Reflect.set(reqHeaders, 'injected', 'value');
        }).toThrow(TypeError);
        expect(() => {
          Reflect.set(reqHeaders, 'get', () => {});
        }).toThrow(TypeError);
        expect(() => {
          Reflect.set(reqHeaders, Symbol('test'), 123);
        }).toThrow(TypeError);

        // Reflect.deleteProperty
        expect(() => {
          Reflect.deleteProperty(reqHeaders, 'injected');
        }).toThrow(TypeError);
        expect(() => {
          Reflect.deleteProperty(reqHeaders, 'get');
        }).toThrow(TypeError);
        expect(() => {
          Reflect.deleteProperty(reqHeaders, Symbol.iterator);
        }).toThrow(TypeError);

        // Reflect.defineProperty
        expect(() => {
          Reflect.defineProperty(reqHeaders, 'injected', { value: 123 });
        }).toThrow(TypeError);

        // Reflect.setPrototypeOf
        expect(() => {
          Reflect.setPrototypeOf(reqHeaders, {});
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 6: WHATWG Headers Built-in Mutator Traps', () => {
    it('repels .set(), .append(), and .delete() with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          (reqHeaders as any).set('x-foo', 'mutated');
        }).toThrow(TypeError);
        expect(() => {
          (reqHeaders as any).append('x-bar', 'appended');
        }).toThrow(TypeError);
        expect(() => {
          (reqHeaders as any).delete('x-foo');
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 7: Direct Prototype Method Invocation (Headers.prototype.*.call)', () => {
    it('repels direct Headers.prototype invocations with TypeError', () => {
      const { context } = createMockContext({ headers: { 'x-foo': 'initial' } });
      store.run(context, () => {
        const reqHeaders = headers();
        expect(() => {
          Headers.prototype.set.call(reqHeaders, 'x-foo', 'mutated');
        }).toThrow(TypeError);
        expect(() => {
          Headers.prototype.append.call(reqHeaders, 'x-bar', 'appended');
        }).toThrow(TypeError);
        expect(() => {
          Headers.prototype.delete.call(reqHeaders, 'x-foo');
        }).toThrow(TypeError);
      });
    });
  });

  describe('Vector 8: Underlying Object Leak via forEach Callback', () => {
    it('adversarially probes whether forEach exposes mutable underlying Headers instance', () => {
      const { context, rawHeaders } = createMockContext({
        headers: {
          'x-probe': 'initial',
          'authorization': 'Bearer secret',
        },
      });

      store.run(context, () => {
        const reqHeaders = headers();
        const exposedParents: any[] = [];
        const customThis = { role: 'tester' };

        reqHeaders.forEach(function (val, key, parent) {
          exposedParents.push(parent);
          // Verify thisArg binding
          expect(this).toBe(customThis);
        }, customThis);

        expect(exposedParents.length).toBe(2);

        for (const exposedParent of exposedParents) {
          // The 3rd parameter parent must be the ReadonlyHeaders proxy itself, NEVER rawHeaders
          expect(exposedParent).toBe(reqHeaders);
          expect(exposedParent).not.toBe(rawHeaders);

          // Attempting to mutate via the exposed parent MUST throw TypeError
          expect(() => {
            exposedParent.set('x-injected', 'bypassed');
          }).toThrow(TypeError);

          expect(() => {
            exposedParent.append('x-probe', 'second-value');
          }).toThrow(TypeError);

          expect(() => {
            exposedParent.delete('x-probe');
          }).toThrow(TypeError);

          expect(() => {
            (exposedParent as any).tampered = true;
          }).toThrow(TypeError);

          expect(() => {
            delete (exposedParent as any).authorization;
          }).toThrow(TypeError);
        }

        // Verify underlying headers were never modified
        expect(rawHeaders.has('x-injected')).toBe(false);
        expect(rawHeaders.get('x-probe')).toBe('initial');
        expect(rawHeaders.get('authorization')).toBe('Bearer secret');
      });
    });
  });

  describe('Vector 9: Read-Only Inspection Correctness & Non-Mutation', () => {
    it('accurately inspects headers without throwing or mutating', () => {
      const { context } = createMockContext({
        headers: {
          'x-alpha': 'one',
          'x-beta': 'two',
        },
      });

      store.run(context, () => {
        const reqHeaders = headers();

        // get / has case-insensitive
        expect(reqHeaders.get('x-alpha')).toBe('one');
        expect(reqHeaders.get('X-ALPHA')).toBe('one');
        expect(reqHeaders.get('missing')).toBeNull();
        expect(reqHeaders.has('x-beta')).toBe(true);
        expect(reqHeaders.has('X-BETA')).toBe(true);
        expect(reqHeaders.has('missing')).toBe(false);

        // entries
        const entries = Array.from(reqHeaders.entries());
        expect(entries).toEqual([
          ['x-alpha', 'one'],
          ['x-beta', 'two'],
        ]);

        // keys
        const keys = Array.from(reqHeaders.keys());
        expect(keys).toEqual(['x-alpha', 'x-beta']);

        // values
        const values = Array.from(reqHeaders.values());
        expect(values).toEqual(['one', 'two']);

        // for...of
        const pairs: [string, string][] = [];
        for (const pair of reqHeaders) {
          pairs.push(pair);
        }
        expect(pairs).toEqual([
          ['x-alpha', 'one'],
          ['x-beta', 'two'],
        ]);
      });
    });
  });

  describe('Vector 10: Extensibility & Object Tampering Traps (preventExtensions trap)', () => {
    it('repels Object.preventExtensions and Reflect.preventExtensions with TypeError', () => {
      const { context, rawHeaders } = createMockContext({
        headers: { 'x-guard': 'active' },
      });

      store.run(context, () => {
        const reqHeaders = headers();

        // Object.preventExtensions must throw TypeError
        expect(() => {
          Object.preventExtensions(reqHeaders);
        }).toThrow(TypeError);

        // Reflect.preventExtensions must throw TypeError
        expect(() => {
          Reflect.preventExtensions(reqHeaders);
        }).toThrow(TypeError);

        // Object.freeze must throw TypeError (delegates to preventExtensions)
        expect(() => {
          Object.freeze(reqHeaders);
        }).toThrow(TypeError);

        // Object.seal must throw TypeError (delegates to preventExtensions)
        expect(() => {
          Object.seal(reqHeaders);
        }).toThrow(TypeError);

        // Verify extensibility invariants remain intact
        expect(Object.isExtensible(reqHeaders)).toBe(true);
        expect(Object.isExtensible(rawHeaders)).toBe(true);
      });
    });
  });

  describe('Vector 11: Safe Node.js Inspection & Logging (util.inspect & console.log)', () => {
    it('inspects ReadonlyHeaders safely without crashing on private member #headersList', () => {
      const { context } = createMockContext({
        headers: {
          'x-alpha': 'value1',
          'authorization': 'Bearer token-xyz',
        },
      });

      store.run(context, () => {
        const reqHeaders = headers();

        // Direct util.inspect call must not throw
        let output = '';
        expect(() => {
          output = util.inspect(reqHeaders);
        }).not.toThrow();

        expect(output).toContain('ReadonlyHeaders');
        expect(output).toContain('x-alpha');
        expect(output).toContain('value1');
        expect(output).toContain('authorization');
        expect(output).toContain('Bearer token-xyz');

        // Nested object inspect
        let nestedOutput = '';
        expect(() => {
          nestedOutput = util.inspect({ request: { headers: reqHeaders } });
        }).not.toThrow();
        expect(nestedOutput).toContain('ReadonlyHeaders');

        // Custom inspect symbol access
        const customInspectSymbol = Symbol.for('nodejs.util.inspect.custom');
        const customInspectFn = (reqHeaders as any)[customInspectSymbol];
        expect(typeof customInspectFn).toBe('function');
        const customResult = customInspectFn.call(reqHeaders, 2, {}, util.inspect);
        expect(customResult).toContain('ReadonlyHeaders');

        // Depth guard (< 0) must format compactly
        expect(customInspectFn.call(reqHeaders, -1, { stylize: (s: string) => s }, util.inspect)).toBe(
          '[ReadonlyHeaders]'
        );
      });
    });
  });

  describe('Vector 12: Comprehensive WHATWG Iteration & Isolation', () => {
    it('preserves exact header entries across all standard WHATWG iteration protocols', () => {
      const { context } = createMockContext({
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req-9876',
        },
      });

      store.run(context, () => {
        const reqHeaders = headers();

        // entries()
        const entriesMap = new Map(Array.from(reqHeaders.entries()));
        expect(entriesMap.get('content-type')).toBe('application/json');
        expect(entriesMap.get('x-request-id')).toBe('req-9876');

        // keys()
        const keys = Array.from(reqHeaders.keys());
        expect(keys).toContain('content-type');
        expect(keys).toContain('x-request-id');

        // values()
        const values = Array.from(reqHeaders.values());
        expect(values).toContain('application/json');
        expect(values).toContain('req-9876');

        // for...of
        const forOfMap = new Map();
        for (const [k, v] of reqHeaders) {
          forOfMap.set(k, v);
        }
        expect(forOfMap.get('content-type')).toBe('application/json');
        expect(forOfMap.get('x-request-id')).toBe('req-9876');
      });
    });

    it('handles empty headers iteration gracefully', () => {
      const { context } = createMockContext({ headers: {} });

      store.run(context, () => {
        const reqHeaders = headers();
        let called = false;
        reqHeaders.forEach(() => {
          called = true;
        });
        expect(called).toBe(false);
        expect(Array.from(reqHeaders.entries())).toEqual([]);
        expect(Array.from(reqHeaders.keys())).toEqual([]);
        expect(Array.from(reqHeaders.values())).toEqual([]);
      });
    });
  });
});
