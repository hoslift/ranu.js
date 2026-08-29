import { describe, it, expect, beforeEach } from 'vitest';
import { ReactRefreshRuntime } from '../src/hmr/refresh-runtime.js';

describe('ReactRefreshRuntime (Phase 19 Fast Refresh)', () => {
  beforeEach(() => {
    ReactRefreshRuntime.reset();
  });

  it('identifies valid React component types', () => {
    function Button() {
      return null;
    }
    function helper() {
      return null;
    }
    const MemoComponent = {
      $$typeof: Symbol.for('react.memo'),
      type: Button,
    };
    const ForwardRefComponent = {
      $$typeof: Symbol.for('react.forward_ref'),
      render: Button,
    };

    expect(ReactRefreshRuntime.isLikelyComponentType(Button)).toBe(true);
    expect(ReactRefreshRuntime.isLikelyComponentType(helper)).toBe(false);
    expect(ReactRefreshRuntime.isLikelyComponentType(MemoComponent)).toBe(true);
    expect(ReactRefreshRuntime.isLikelyComponentType(ForwardRefComponent)).toBe(true);
    expect(ReactRefreshRuntime.isLikelyComponentType(123)).toBe(false);
    expect(ReactRefreshRuntime.isLikelyComponentType(null)).toBe(false);
  });

  it('validates module exports as safe refresh boundaries', () => {
    function Header() {
      return null;
    }
    function Footer() {
      return null;
    }

    const allComponents = { Header, Footer };
    const mixedExports = { Header, API_KEY: 'secret123' };
    const nonComponentExports = { add: (a: number, b: number) => a + b };

    expect(ReactRefreshRuntime.isRefreshBoundary(Header)).toBe(true);
    expect(ReactRefreshRuntime.isRefreshBoundary(allComponents)).toBe(true);
    expect(ReactRefreshRuntime.isRefreshBoundary(mixedExports)).toBe(false);
    expect(ReactRefreshRuntime.isRefreshBoundary(nonComponentExports)).toBe(false);
    expect(ReactRefreshRuntime.isRefreshBoundary(null)).toBe(false);
  });

  it('compares hook signatures for compatibility', () => {
    function Counter() {
      return null;
    }
    function CounterV2() {
      return null;
    }
    function CounterWithDifferentHooks() {
      return null;
    }

    ReactRefreshRuntime.setSignature(Counter, 'useState');
    ReactRefreshRuntime.setSignature(CounterV2, 'useState');
    ReactRefreshRuntime.setSignature(CounterWithDifferentHooks, 'useEffect');

    expect(ReactRefreshRuntime.areSignaturesCompatible(Counter, CounterV2)).toBe(true);
    expect(ReactRefreshRuntime.areSignaturesCompatible(Counter, CounterWithDifferentHooks)).toBe(
      false,
    );
  });

  it('registers components and invokes refresh listeners upon performReactRefresh', () => {
    function App() {
      return null;
    }
    ReactRefreshRuntime.register(App, 'App');

    let refreshed = false;
    const unsubscribe = ReactRefreshRuntime.onRefresh(() => {
      refreshed = true;
    });

    ReactRefreshRuntime.performReactRefresh();
    expect(refreshed).toBe(true);

    // Unsubscribe
    refreshed = false;
    unsubscribe();
    ReactRefreshRuntime.performReactRefresh();
    expect(refreshed).toBe(false);
  });

  it('creates transform signatures and returns the previously saved component', () => {
    function Counter() {
      return null;
    }
    const customHook = () => undefined;
    const signature = ReactRefreshRuntime.createSignatureFunctionForTransform();

    expect(signature(Counter, 'useState', [customHook])).toBe(Counter);
    expect((signature as unknown as (type: unknown, key: unknown) => unknown)(null, null)).toBe(
      Counter,
    );

    function CounterV2() {
      return null;
    }
    ReactRefreshRuntime.setSignature(CounterV2, 'useState', [customHook]);
    expect(ReactRefreshRuntime.areSignaturesCompatible(Counter, CounterV2)).toBe(true);
  });

  it('ignores invalid registrations and covers component-type edge cases', () => {
    ReactRefreshRuntime.register(null, 'null');
    ReactRefreshRuntime.register(undefined, 'undefined');
    ReactRefreshRuntime.register(123, 'number');
    ReactRefreshRuntime.register({ $$typeof: Symbol.for('react.memo') }, 'Memo');
    ReactRefreshRuntime.setSignature(null, 'invalid');
    ReactRefreshRuntime.setSignature('invalid', 'invalid');

    const anonymous = Object.defineProperty(function () {}, 'name', { value: '' });
    expect(ReactRefreshRuntime.isLikelyComponentType(anonymous)).toBe(false);
    expect(ReactRefreshRuntime.isLikelyComponentType({ $$typeof: Symbol() })).toBe(false);
    expect(ReactRefreshRuntime.isLikelyComponentType({ $$typeof: 'react.memo' })).toBe(false);
  });

  it('covers boundary metadata, primitives, empty exports, and signature absence', () => {
    function Header() {
      return null;
    }
    function Unregistered() {
      return null;
    }

    expect(ReactRefreshRuntime.isRefreshBoundary(undefined)).toBe(false);
    expect(ReactRefreshRuntime.isRefreshBoundary('not-a-module')).toBe(false);
    expect(ReactRefreshRuntime.isRefreshBoundary({})).toBe(false);
    expect(
      ReactRefreshRuntime.isRefreshBoundary({
        __esModule: true,
        $$typeof: Symbol.for('module'),
        Header,
      }),
    ).toBe(true);
    expect(ReactRefreshRuntime.areSignaturesCompatible(Header, Unregistered)).toBe(true);
    ReactRefreshRuntime.setSignature(Header, 'useState');
    expect(ReactRefreshRuntime.areSignaturesCompatible(Header, Unregistered)).toBe(false);
  });

  it('continues notifying listeners when an earlier listener throws', () => {
    let called = false;
    ReactRefreshRuntime.onRefresh(() => {
      throw new Error('listener failed');
    });
    ReactRefreshRuntime.onRefresh(() => {
      called = true;
    });

    expect(() => ReactRefreshRuntime.performReactRefresh()).not.toThrow();
    expect(called).toBe(true);
  });
});
