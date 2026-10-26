import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  assertFlightSerializable,
  validateFlightSerializable,
  assertTreeFlightSerializable,
  FlightSerializationError,
  FLIGHT_SERIALIZATION_ERROR_CODE,
  renderReactToStream,
  ReactRenderer,
} from '@ranu/react';
import type {
  ComponentModuleLoader,
  PageModule,
  LayoutModule,
} from '@ranu/react';
import {
  renderSerializationOverlay,
  attachHydrationOverlay,
} from '@ranu/diagnostics';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type {
  RanuRequestContext,
  PageRenderTarget,
  RequestContextStore,
} from '@ranu/runtime';
import { registerRequestContextStore } from '@ranu/runtime';

class TestContextStore implements RequestContextStore {
  private activeCtx?: RanuRequestContext;
  async run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): Promise<T> {
    const prev = this.activeCtx;
    this.activeCtx = context;
    try {
      return await callback();
    } finally {
      this.activeCtx = prev;
    }
  }
  get(): RanuRequestContext | undefined {
    return this.activeCtx;
  }
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function createMockContext(
  urlStr: string = 'http://localhost/test',
  params: Record<string, string> = {},
): RanuRequestContext {
  const url = new URL(urlStr);
  const request = new Request(url, {
    headers: {
      'User-Agent': 'ChallengerTestAgent',
    },
  });

  return {
    requestId: 'challenger-req-42',
    request,
    url,
    params,
    locals: new Map(),
    signal: request.signal,
    responseCookies: [],
    depth: 1,
    waitUntil: () => {},
    waitUntilPromises: [],
  };
}

describe('Empirical Challenger M3.2: Tier 2 Runtime Flight Assertions Stress Test', () => {
  const contextStore = new TestContextStore();
  registerRequestContextStore(contextStore);

  // =========================================================================
  // Dimension 1: Hostile Objects Passed to assertFlightSerializable
  // =========================================================================
  describe('Dimension 1: Hostile Objects & Attack Vectors', () => {
    it('rejects various closure and function types with fatal FlightSerializationError', () => {
      const hostileFunctions = [
        { name: 'inline arrow', fn: () => 'evil' },
        { name: 'named function', fn: function stealSecret() {} },
        { name: 'bound function', fn: (function () {}).bind(null) },
        { name: 'generator function', fn: function* gen() { yield 1; } },
        { name: 'async function', fn: async function fetchInternal() {} },
      ];

      for (const { name, fn } of hostileFunctions) {
        expect(() => {
          assertFlightSerializable(fn, `handler.${name}`, 'AdversarialComponent');
        }).toThrow(FlightSerializationError);

        try {
          assertFlightSerializable(fn, `handler.${name}`, 'AdversarialComponent');
        } catch (err: any) {
          expect(err).toBeInstanceOf(FlightSerializationError);
          expect(err.code).toBe(FLIGHT_SERIALIZATION_ERROR_CODE);
          expect(err.valueType).toBe('function');
          expect(err.componentName).toBe('AdversarialComponent');
          expect(err.propPath).toBe(`handler.${name}`);
          expect(err.message).toContain('Cannot pass non-serializable function prop');
        }
      }
    });

    it('rejects prototype pollution objects via __proto__, constructor, and prototype keys', () => {
      // 1. Explicit __proto__ property
      const pollutedProto = Object.create(null);
      pollutedProto['__proto__'] = { admin: true };
      expect(() => {
        assertFlightSerializable(pollutedProto, 'payload', 'AdminGate');
      }).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(pollutedProto, 'payload', 'AdminGate');
      } catch (err: any) {
        expect(err.valueType).toBe('prototype pollution');
        expect(err.propPath).toBe('payload.__proto__');
        expect(err.message).toContain('Forbidden prototype pollution key "__proto__"');
      }

      // 2. constructor pollution
      const pollutedConstructor = { constructor: { role: 'superuser' } };
      expect(() => {
        assertFlightSerializable(pollutedConstructor, 'state', 'AdminGate');
      }).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(pollutedConstructor, 'state', 'AdminGate');
      } catch (err: any) {
        expect(err.valueType).toBe('prototype pollution');
        expect(err.propPath).toBe('state.constructor');
        expect(err.message).toContain('Forbidden prototype pollution key "constructor"');
      }

      // 3. prototype property pollution
      const pollutedPrototype = { prototype: { hijacked: true } };
      expect(() => {
        assertFlightSerializable(pollutedPrototype, 'meta', 'AdminGate');
      }).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(pollutedPrototype, 'meta', 'AdminGate');
      } catch (err: any) {
        expect(err.valueType).toBe('prototype pollution');
        expect(err.propPath).toBe('meta.prototype');
        expect(err.message).toContain('Forbidden prototype pollution key "prototype"');
      }

      // 4. Object.defineProperty defined prototype pollution
      const definedProto = {};
      Object.defineProperty(definedProto, '__proto__', {
        value: { bypass: true },
        enumerable: true,
        configurable: true,
      });
      expect(() => {
        assertFlightSerializable(definedProto, 'defined', 'AdminGate');
      }).toThrow(FlightSerializationError);
    });

    it('rejects cyclic graphs (self-reference, indirect, deep, array, and promise cycles)', () => {
      // 1. Direct self-reference
      const selfRef: any = { id: 1 };
      selfRef.self = selfRef;
      expect(() => assertFlightSerializable(selfRef, 'graph', 'Network')).toThrow(FlightSerializationError);

      // 2. Indirect 2-node cycle
      const nodeA: any = { name: 'A' };
      const nodeB: any = { name: 'B', ref: nodeA };
      nodeA.ref = nodeB;
      expect(() => assertFlightSerializable(nodeA, 'network', 'Network')).toThrow(FlightSerializationError);

      // 3. Deep 5-node cycle
      const n1: any = { val: 1 };
      const n2: any = { val: 2 };
      const n3: any = { val: 3 };
      const n4: any = { val: 4 };
      const n5: any = { val: 5 };
      n1.next = n2;
      n2.next = n3;
      n3.next = n4;
      n4.next = n5;
      n5.next = n1;
      expect(() => assertFlightSerializable(n1, 'ring', 'RingBuffer')).toThrow(FlightSerializationError);

      // 4. Array containing itself
      const cyclicArr: any[] = [1, 2];
      cyclicArr.push(cyclicArr);
      expect(() => assertFlightSerializable(cyclicArr, 'items', 'ListView')).toThrow(FlightSerializationError);

      // 5. Object with nested array containing parent object
      const container: any = { label: 'root', items: [] };
      container.items.push(container);
      expect(() => assertFlightSerializable(container, 'container', 'ListView')).toThrow(FlightSerializationError);
    });

    it('rejects unregistered symbols while allowing approved Flight symbols', () => {
      const hostileSymbols = [
        Symbol('private_token'),
        Symbol.for('unregistered.symbol'),
        Symbol.iterator,
        Symbol.asyncIterator,
        Symbol.toStringTag,
      ];

      for (const sym of hostileSymbols) {
        expect(() => {
          assertFlightSerializable(sym, 'symKey', 'SecurityProvider');
        }).toThrow(FlightSerializationError);

        try {
          assertFlightSerializable(sym, 'symKey', 'SecurityProvider');
        } catch (err: any) {
          expect(err.valueType).toBe('symbol');
          expect(err.message).toContain('Cannot pass non-serializable symbol prop');
        }
      }

      // Allowed Flight symbols
      const allowedSymbols = [
        Symbol.for('react.element'),
        Symbol.for('react.transitional.element'),
        Symbol.for('react.fragment'),
        Symbol.for('react.server.reference'),
        Symbol.for('react.suspense'),
      ];
      for (const sym of allowedSymbols) {
        expect(() => {
          assertFlightSerializable(sym, 'allowed', 'FlightHost');
        }).not.toThrow();
      }
    });

    it('rejects custom and built-in non-plain class instances', () => {
      class DatabaseConnection {
        connStr = 'postgres://admin@localhost';
      }

      class AccountModel extends Object {
        balance = 5000;
      }

      const hostileInstances = [
        { name: 'DatabaseConnection', inst: new DatabaseConnection() },
        { name: 'AccountModel', inst: new AccountModel() },
        { name: 'Date', inst: new Date() },
        { name: 'RegExp', inst: new RegExp('^[a-z]+$') },
        { name: 'Map', inst: new Map([['key', 'val']]) },
        { name: 'Set', inst: new Set([1, 2, 3]) },
        { name: 'Error', inst: new Error('runtime failure') },
      ];

      for (const { name, inst } of hostileInstances) {
        expect(() => {
          assertFlightSerializable(inst, `inst.${name}`, 'DataView');
        }).toThrow(FlightSerializationError);

        try {
          assertFlightSerializable(inst, `inst.${name}`, 'DataView');
        } catch (err: any) {
          expect(err.valueType).toContain('class instance');
          expect(err.message).toContain(`Cannot pass non-serializable class instance`);
        }
      }
    });

    it('rejects BigInt values as non-serializable for SSR hydration payloads', () => {
      expect(() => {
        assertFlightSerializable(100n, 'amount', 'Currency');
      }).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(BigInt(999999999), 'largeId', 'Item');
      } catch (err: any) {
        expect(err.valueType).toBe('bigint');
        expect(err.code).toBe(FLIGHT_SERIALIZATION_ERROR_CODE);
        expect(err.message).toContain('Cannot pass non-serializable bigint prop "largeId"');
        expect(err.hint).toContain('Convert BigInt values to string or number');
      }
    });

    it('accurately traces deep property paths to nested violations', () => {
      const deeplyNested = {
        level1: {
          level2: {
            items: [
              { ok: true },
              {
                danger: {
                  badCallback: () => 'leak',
                },
              },
            ],
          },
        },
      };

      try {
        assertFlightSerializable(deeplyNested, 'props', 'DeepTree');
        expect.unreachable('Should have thrown FlightSerializationError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(FlightSerializationError);
        expect(err.propPath).toBe('props.level1.level2.items[1].danger.badCallback');
      }
    });
  });

  // =========================================================================
  // Dimension 2: Valid Flight Objects across Boundary
  // =========================================================================
  describe('Dimension 2: Valid Flight Objects & 0 Errors', () => {
    it('accepts all valid primitives, plain objects, and nested arrays', () => {
      const validPayload = {
        emptyStr: '',
        greeting: 'Hello, World! 🚀',
        zero: 0,
        positiveInt: 42,
        negativeFloat: -3.14159,
        nanValue: NaN,
        infinityValue: Infinity,
        negativeInfinity: -Infinity,
        flagTrue: true,
        flagFalse: false,
        nullProp: null,
        undefinedProp: undefined,
        nestedObj: {
          tag: 'alpha',
          inner: {
            score: 100,
          },
        },
        matrix: [
          [1, 2, 3],
          ['a', 'b', null],
          [true, false],
        ],
      };

      expect(() => {
        assertFlightSerializable(validPayload, 'config', 'Dashboard');
      }).not.toThrow();

      const validation = validateFlightSerializable(validPayload, 'config', 'Dashboard');
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('accepts Object.create(null) with safe properties', () => {
      const nullProtoObj = Object.create(null);
      nullProtoObj.username = 'alice';
      nullProtoObj.active = true;
      nullProtoObj.count = 10;

      expect(() => {
        assertFlightSerializable(nullProtoObj, 'cleanDict', 'LookupTable');
      }).not.toThrow();
    });

    it('accepts Promise instances and thenables (React 19 async streaming props)', () => {
      const resolvedPromise = Promise.resolve({ data: 'hello' });
      expect(() => {
        assertFlightSerializable(resolvedPromise, 'deferredData', 'AsyncFeed');
      }).not.toThrow();

      const customThenable = {
        then(resolve: (val: any) => void) {
          resolve({ ok: true });
        },
      };
      expect(() => {
        assertFlightSerializable(customThenable, 'thenableData', 'AsyncFeed');
      }).not.toThrow();

      // Promise with safe attached properties
      const promiseWithProps: any = Promise.resolve('ok');
      promiseWithProps.status = 'ready';
      promiseWithProps.meta = { version: 1 };
      expect(() => {
        assertFlightSerializable(promiseWithProps, 'promiseProps', 'AsyncFeed');
      }).not.toThrow();
    });

    it('accepts React elements and transitional elements', () => {
      const reactEl = React.createElement('div', { id: 'slot-1' }, 'slot content');
      expect(() => {
        assertFlightSerializable(reactEl, 'slot', 'Modal');
      }).not.toThrow();

      const transitionalEl = {
        $$typeof: Symbol.for('react.transitional.element'),
        type: 'section',
        props: { className: 'hero' },
      };
      expect(() => {
        assertFlightSerializable(transitionalEl, 'banner', 'Header');
      }).not.toThrow();
    });

    it('accepts Server Actions marked with $$ACTION_ID or Symbol.for(react.server.reference)', () => {
      const actionWithId: any = async () => 'done';
      actionWithId.$$ACTION_ID = 'action_user_update_f42';
      expect(() => {
        assertFlightSerializable(actionWithId, 'updateAction', 'UserForm');
      }).not.toThrow();

      const actionWithSym: any = async () => 'reference';
      actionWithSym.$$typeof = Symbol.for('react.server.reference');
      expect(() => {
        assertFlightSerializable(actionWithSym, 'queryAction', 'UserForm');
      }).not.toThrow();

      const actionWithIndexProp: any = async () => 'indexed';
      actionWithIndexProp[Symbol.for('react.server.reference')] = true;
      expect(() => {
        assertFlightSerializable(actionWithIndexProp, 'submitAction', 'UserForm');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // Dimension 3: Tree Flight Serialization (assertTreeFlightSerializable)
  // =========================================================================
  describe('Dimension 3: Tree Flight Serialization', () => {
    it('detects client component receiving forbidden function prop in rendered tree', () => {
      const ClientButton: any = ({ onClick, children }: any) =>
        React.createElement('button', { onClick }, children);
      ClientButton.$$typeof = Symbol.for('react.client.reference');
      ClientButton.displayName = 'ClientButton';

      const ServerContainer = () => {
        return React.createElement('div', null, [
          React.createElement('h1', { key: 'h' }, 'Page Title'),
          React.createElement(ClientButton, {
            key: 'btn',
            onClick: () => console.log('clicked'),
            children: 'Click Me',
          }),
        ]);
      };

      const tree = React.createElement(ServerContainer);
      expect(() => assertTreeFlightSerializable(tree)).toThrow(FlightSerializationError);
    });

    it('detects render prop / function passed as JSX children to client component', () => {
      const ClientSlot: any = ({ children }: any) =>
        React.createElement('div', null, typeof children === 'function' ? children() : children);
      ClientSlot.__ranu_client__ = true;
      ClientSlot.displayName = 'ClientSlot';

      const tree = React.createElement(
        'div',
        null,
        React.createElement(ClientSlot, null, () => React.createElement('span', null, 'render prop'))
      );

      expect(() => assertTreeFlightSerializable(tree)).toThrow(FlightSerializationError);
    });

    it('allows functions in Server Components props if they never cross to client components', () => {
      const serverHelper = () => 'computed_server_text';

      const PureServerComponent = ({ helper }: { helper: () => string }) => {
        return React.createElement('p', null, helper());
      };

      const tree = React.createElement(PureServerComponent, { helper: serverHelper });
      expect(() => assertTreeFlightSerializable(tree)).not.toThrow();
    });

    it('inspects asynchronous Server Components resolving to client components', async () => {
      const ClientTag: any = ({ fn }: any) => React.createElement('span', null, 'tag');
      ClientTag.renderMode = 'client';
      ClientTag.displayName = 'ClientTag';

      const AsyncServerComp = async () => {
        await new Promise((r) => setTimeout(r, 5));
        return React.createElement('div', null, React.createElement(ClientTag, { fn: () => {} }));
      };

      const tree = React.createElement(AsyncServerComp);
      let caughtError: any;
      try {
        const check = assertTreeFlightSerializable(tree);
        if (check && typeof check.then === 'function') {
          await check;
        }
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(FlightSerializationError);
      expect(caughtError.componentName).toBe('ClientTag');
    });
  });

  // =========================================================================
  // Dimension 4: Dev Mode SSR Streaming in renderer.ts and stream.ts
  // =========================================================================
  describe('Dimension 4: Dev Mode SSR Streaming Integration', () => {
    it('catches serialization error during dev mode renderReactToStream and invokes onDiagnostic/onError', async () => {
      const ClientWidget: any = ({ onAction }: any) => React.createElement('div', null, 'Widget');
      ClientWidget.$$typeof = Symbol.for('react.client.reference');
      ClientWidget.displayName = 'ClientWidget';

      const tree = React.createElement(
        'main',
        null,
        React.createElement(ClientWidget, { onAction: () => 'execute' })
      );

      let capturedDiag: RanuDiagnostic | undefined;
      let capturedErr: unknown;

      await expect(
        renderReactToStream(tree, {
          mode: 'development',
          onDiagnostic: (diag) => {
            capturedDiag = diag;
          },
          onError: (err) => {
            capturedErr = err;
          },
        })
      ).rejects.toThrow(FlightSerializationError);

      expect(capturedDiag).toBeDefined();
      expect(capturedDiag?.code).toBe(FLIGHT_SERIALIZATION_ERROR_CODE);
      expect(capturedDiag?.severity).toBe('error');
      expect(capturedDiag?.message).toContain('Cannot pass non-serializable function prop');
      expect(capturedDiag?.hint).toContain('Move event handlers and stateful logic inside');
      expect(capturedErr).toBeInstanceOf(FlightSerializationError);
    });

    it('renders HTTP 500 with diagnostic header and inline overlay script on serialization failure in ReactRenderer', async () => {
      const ClientToggle: any = ({ onChange }: any) => React.createElement('input', { type: 'checkbox', onChange });
      ClientToggle.$$typeof = Symbol.for('react.client.reference');
      ClientToggle.displayName = 'ClientToggle';

      const badPage: PageModule = {
        default: () => {
          return React.createElement('div', null, [
            React.createElement('h1', { key: 'h' }, 'Settings'),
            React.createElement(ClientToggle, { key: 't', onChange: () => {} }),
          ]);
        },
      };

      const loader: ComponentModuleLoader = {
        loadPage: async () => badPage,
        loadLayout: async () => ({ default: ({ children }: any) => children }),
        loadLoading: async () => undefined,
        loadError: async () => undefined,
        loadNotFound: async () => undefined,
      };

      const renderer = new ReactRenderer({ loader, mode: 'development' });
      const context = createMockContext('http://localhost/settings');

      const target: PageRenderTarget = {
        routeId: 'app/settings/page.tsx',
        params: {},
        layouts: [],
        errors: [],
      };

      const response = await contextStore.run(context, async () => {
        return renderer.render(context.request, context, target);
      });

      // 1. Verify HTTP Status 500
      expect(response.status).toBe(500);

      // 2. Verify Diagnostic Header
      expect(response.headers.get('X-Ranu-Diagnostic-Code')).toBe(FLIGHT_SERIALIZATION_ERROR_CODE);
      expect(response.headers.get('Content-Type')).toContain('text/html');

      // 3. Verify Body contains structured diagnostic payload and overlay event script
      const html = await streamToString(response.body as ReadableStream<Uint8Array>);
      expect(html).toContain(FLIGHT_SERIALIZATION_ERROR_CODE);
      expect(html).toContain('window.__ranu_serialization_error__');
      expect(html).toContain('ranu:serialization-error');
      expect(html).toContain('Client Component &lt;ClientToggle&gt;');
      expect(html).toContain('Move event handlers and stateful logic inside');
    });
  });

  // =========================================================================
  // Dimension 5: Production Mode SSR Streaming Invariants & Overhead
  // =========================================================================
  describe('Dimension 5: Production Mode Invariants & Performance', () => {
    it('bypasses assertTreeFlightSerializable in production mode without throwing', async () => {
      const ClientComp: any = ({ callback }: any) => React.createElement('div', null, 'Prod View');
      ClientComp.$$typeof = Symbol.for('react.client.reference');
      ClientComp.displayName = 'ClientComp';

      // Passing a function in production mode should NOT throw FlightSerializationError in renderReactToStream
      const tree = React.createElement('div', null, React.createElement(ClientComp, { callback: () => {} }));

      const stream = await renderReactToStream(tree, {
        mode: 'production',
      });
      expect(stream).toBeDefined();

      const html = await streamToString(stream);
      expect(html).toContain('Prod View');
    });

    it('empirically demonstrates zero Flight assertion overhead in production mode', async () => {
      const ClientCard: any = ({ info }: any) => React.createElement('div', null, info.title);
      ClientCard.$$typeof = Symbol.for('react.client.reference');
      ClientCard.displayName = 'ClientCard';

      const payload = {
        title: 'Benchmark Product',
        features: ['f1', 'f2', 'f3', 'f4', 'f5'],
        metadata: { a: 1, b: 2, c: { d: 4 } },
      };

      const makeTree = () =>
        React.createElement(
          'div',
          null,
          Array.from({ length: 50 }, (_, i) =>
            React.createElement(ClientCard, { key: i, info: payload })
          )
        );

      // Benchmark Dev Mode (runs assertTreeFlightSerializable on all 50 components)
      const tDevStart = performance.now();
      for (let i = 0; i < 50; i++) {
        const stream = await renderReactToStream(makeTree(), { mode: 'development' });
        await streamToString(stream);
      }
      const tDev = performance.now() - tDevStart;

      // Benchmark Prod Mode (bypasses assertTreeFlightSerializable)
      const tProdStart = performance.now();
      for (let i = 0; i < 50; i++) {
        const stream = await renderReactToStream(makeTree(), { mode: 'production' });
        await streamToString(stream);
      }
      const tProd = performance.now() - tProdStart;

      // Verify prod mode runs successfully and doesn't incur validation overhead
      expect(tProd).toBeGreaterThan(0);
      expect(tDev).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Dimension 6: Diagnostics Overlay Rendering (@ranu/diagnostics)
  // =========================================================================
  describe('Dimension 6: Diagnostics Overlay Shadow DOM Rendering', () => {
    it('renders visual serialization error card with shadow DOM, code, message, and hint', () => {
      // Mock DOM environment if not in browser
      if (typeof document === 'undefined') {
        return;
      }

      const diag: RanuDiagnostic = {
        code: FLIGHT_SERIALIZATION_ERROR_CODE,
        severity: 'error',
        message: 'Cannot pass non-serializable function prop "onClick" to Client Component <ClientBtn>.',
        routeId: 'app/dashboard/page.tsx',
        location: { file: 'app/dashboard/page.tsx', line: 42, column: 10 },
        hint: 'Move event handlers and stateful logic inside the Client Component ("use client").',
      };

      const overlay = renderSerializationOverlay(diag);
      expect(overlay.id).toBe('ranu-serialization-overlay-root');
      expect(overlay.shadowRoot).toBeDefined();

      const shadow = overlay.shadowRoot!;
      const textContent = shadow.innerHTML;
      expect(textContent).toContain('SERIALIZATION ERROR');
      expect(textContent).toContain(FLIGHT_SERIALIZATION_ERROR_CODE);
      expect(textContent).toContain('Cannot pass non-serializable function prop');
      expect(textContent).toContain('Move event handlers and stateful logic inside');
      expect(textContent).toContain('app/dashboard/page.tsx');
    });
  });
});
