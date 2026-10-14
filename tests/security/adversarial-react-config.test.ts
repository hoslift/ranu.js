import { describe, it, expect } from 'vitest';
import { wrapRouteParams } from '@ranu/react';
import {
  validateHydrationPayload,
  serializeHydrationData,
  deserializeHydrationData,
} from '@ranu/react';
import type { RanuHydrationPayload } from '@ranu/react';
import {
  defineConfig,
  validateUserConfig,
  resolveConfig,
} from '@ranu/config';

describe('Adversarial Challenge: @ranu/react Async Route Params & Serialization', () => {
  describe('Route Params Dual-Access & Reflection Boundaries', () => {
    it('supports synchronous property access, promise resolution, and reflection', async () => {
      const raw = { id: 'item-100', slug: 'deep-dive', 'param-key': 'k-val' };
      const params = wrapRouteParams(raw);

      // 1. Synchronous direct access
      expect(params.id).toBe('item-100');
      expect(params.slug).toBe('deep-dive');
      expect(params['param-key']).toBe('k-val');

      // 2. Asynchronous Promise resolution
      const resolved = await params;
      expect(resolved).toEqual(raw);
      expect(resolved.id).toBe('item-100');
      expect(Object.isFrozen(resolved)).toBe(true);

      // 3. Object reflection (Object.keys, Object.entries, Object.values)
      const keys = Object.keys(params);
      expect(keys).toContain('id');
      expect(keys).toContain('slug');
      expect(keys).toContain('param-key');
      expect(keys.length).toBe(3);

      const entries = Object.entries(params);
      expect(entries).toEqual([
        ['id', 'item-100'],
        ['slug', 'deep-dive'],
        ['param-key', 'k-val'],
      ]);

      const values = Object.values(params);
      expect(values).toEqual(['item-100', 'deep-dive', 'k-val']);

      // 4. for...in iteration
      const iteratedKeys: string[] = [];
      for (const k in params) {
        iteratedKeys.push(k);
      }
      expect(iteratedKeys).toContain('id');
      expect(iteratedKeys).toContain('slug');
      expect(iteratedKeys).toContain('param-key');

      // 5. Property descriptors and immutability
      expect(Object.isFrozen(params)).toBe(false); // The Promise itself is not frozen, but properties are non-writable/configurable
      const desc = Object.getOwnPropertyDescriptor(params, 'id');
      expect(desc?.enumerable).toBe(true);
      expect(desc?.writable).toBe(false);
      expect(desc?.configurable).toBe(false);

      // Attempting mutation
      expect(() => {
        // @ts-expect-error mutating non-writable property
        params.id = 'hacked';
      }).toThrow(TypeError);
    });

    it('handles prototype pollution keys safely without polluting global prototypes', () => {
      const raw = {
        __proto__: { injected: 'polluted' },
        constructor: 'custom-constructor',
        toString: 'custom-to-string',
      } as any;

      const params = wrapRouteParams(raw);

      // Verify global prototypes remain unpolluted
      expect(({} as any).injected).toBeUndefined();
      expect(Object.prototype.hasOwnProperty('injected')).toBe(false);
      expect(Promise.prototype.hasOwnProperty('injected')).toBe(false);

      // Verify instance behavior
      expect(params.constructor).toBeDefined();
    });

    it('handles Promise method collisions in route params (then, catch, finally)', async () => {
      // Stress: Route with params named "catch" or "finally"
      const rawWithCatch = { catch: 'route-catch', finally: 'route-finally' };
      const wrappedCatch = wrapRouteParams(rawWithCatch);
      expect(wrappedCatch.catch).toBe('route-catch');
      expect(wrappedCatch.finally).toBe('route-finally');

      // Stress: What if a param is named "then"?
      // Overwriting "then" with a non-function value on a Promise affects thenable checks.
      const rawWithThen = { then: 'not-a-func', id: '42' };
      const wrappedThen = wrapRouteParams(rawWithThen);
      expect(wrappedThen.id).toBe('42');
      expect(wrappedThen.then).toBe('not-a-func');
      // When then is not a function, await treats the object as a non-thenable value!
      const resolved = await wrappedThen;
      expect(resolved).toBeDefined();
    });

    it('survives large parameter volume (1,000 keys) without call stack overflow', async () => {
      const largeParams: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeParams[`key_${i}`] = `val_${i}`;
      }

      const params = wrapRouteParams(largeParams);
      expect(params.key_0).toBe('val_0');
      expect(params.key_999).toBe('val_999');

      const resolved = await params;
      expect(resolved.key_500).toBe('val_500');
      expect(Object.keys(params).length).toBe(1000);
    });

    it('executes 10,000 wrapRouteParams iterations rapidly without leaking memory', () => {
      for (let i = 0; i < 10000; i++) {
        const p = wrapRouteParams({ iteration: String(i), status: 'ok' });
        expect(p.iteration).toBe(String(i));
      }
    });
  });

  describe('Hydration Payload Serialization & XSS Immunity', () => {
    const validBasePayload: RanuHydrationPayload = {
      buildId: 'b_test123',
      routeId: 'app/product/[id]/page.tsx',
      pathname: '/product/123',
      params: { id: '123' },
      searchParams: { q: 'shoes', filter: ['red', 'blue'] },
      publicEnv: { RANU_PUBLIC_APP: 'true' },
      assets: { js: ['/assets/main.js'], css: ['/assets/main.css'] },
      renderMode: 'server',
    };

    it('strictly rejects when a Promise (wrapRouteParams) leaks into hydrationPayload params', () => {
      const leakedPayload = {
        ...validBasePayload,
        params: wrapRouteParams({ id: '123' }),
      };

      // validateHydrationPayload must reject because a Promise is not a plain object
      expect(() => {
        validateHydrationPayload(leakedPayload as any);
      }).toThrow(TypeError);

      // serializeHydrationData must also reject
      expect(() => {
        serializeHydrationData(leakedPayload as any);
      }).toThrow(TypeError);
    });

    it('neutralizes XSS and script breakout attempts in serialization', () => {
      const xssPayload: RanuHydrationPayload = {
        ...validBasePayload,
        params: {
          xss1: '</script><script>alert("pwned")</script>',
          xss2: '<!--<script>',
          xss3: '-->',
          unicode: 'line \u2028 and paragraph \u2029 separators',
        },
      };

      const serialized = serializeHydrationData(xssPayload);

      // Verify no raw script breakout tokens remain
      expect(serialized).not.toContain('</script>');
      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('<!--');
      expect(serialized).toContain('\\u003c/script\\u003e');
      expect(serialized).toContain('\\u003cscript\\u003e');

      // Verify perfect lossless deserialization roundtrip
      const deserialized = deserializeHydrationData(serialized);
      expect(deserialized.params.xss1).toBe('</script><script>alert("pwned")</script>');
      expect(deserialized.params.xss2).toBe('<!--<script>');
      expect(deserialized.params.unicode).toBe('line \u2028 and paragraph \u2029 separators');
    });

    it('rejects forbidden prototype pollution keys in hydration serialization and deserialization', () => {
      // In payload object directly
      const attackPayload1 = {
        ...validBasePayload,
        params: { __proto__: { admin: true } },
      };
      expect(() => serializeHydrationData(attackPayload1 as any)).toThrow(TypeError);

      // In JSON string deserialization
      const poisonedJson = '{"buildId":"b1","routeId":"r1","pathname":"/","params":{"__proto__":{"polluted":true}},"searchParams":{},"publicEnv":{},"assets":{"js":[],"css":[]}}';
      expect(() => deserializeHydrationData(poisonedJson)).toThrow(TypeError);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('rejects unsupported non-serializable values (Functions, Symbols, BigInt, Cycles)', () => {
      expect(() => {
        serializeHydrationData({
          ...validBasePayload,
          params: { fn: (() => {}) as any },
        });
      }).toThrow(TypeError);

      expect(() => {
        serializeHydrationData({
          ...validBasePayload,
          params: { sym: Symbol('bad') as any },
        });
      }).toThrow(TypeError);

      expect(() => {
        serializeHydrationData({
          ...validBasePayload,
          params: { big: BigInt(999999999) as any },
        });
      }).toThrow(TypeError);

      // Cyclic structure
      const cyclicObj: any = { id: 'cyclic' };
      cyclicObj.self = cyclicObj;
      expect(() => {
        serializeHydrationData({
          ...validBasePayload,
          params: cyclicObj,
        });
      }).toThrow(TypeError);
    });
  });
});

describe('Adversarial Challenge: @ranu/config Runtime Schema Validation Fuzzing', () => {
  describe('Root Configuration Fuzzing', () => {
    it('handles null, undefined, and non-object inputs defensively', () => {
      expect(validateUserConfig(null).success).toBe(true);
      expect(validateUserConfig(undefined).success).toBe(true);

      const invalidPrimitives = [
        123,
        'string-config',
        true,
        false,
      ];

      for (const prim of invalidPrimitives) {
        const res = validateUserConfig(prim);
        expect(res.success).toBe(false);
        expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);

        // resolveConfig also catches invalid primitives via validateUserConfig
        const { diagnostics } = resolveConfig(prim, process.cwd(), 'production');
        expect(diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);

        // Note: defineConfig(prim) passes through because of typeof config === 'object' guard
        expect(defineConfig(prim as any)).toBe(prim);
      }

      // Arrays are objects, so defineConfig validates and throws
      expect(() => defineConfig([1, 2, 3] as any)).toThrow();
    });

    it('rejects prototype pollution attempts at top level', () => {
      const poisoned = JSON.parse('{"__proto__": {"isAdmin": true}, "build": {"minify": true}}');
      const res = validateUserConfig(poisoned);
      expect(({} as any).isAdmin).toBeUndefined();
      expect(res.diagnostics.every((d) => d.code !== 'CRASH')).toBe(true);
    });

    it('rejects unknown top-level configuration keys with descriptive diagnostics', () => {
      const res = validateUserConfig({
        build: { minify: true },
        bogusNamespace: { foo: 'bar' },
        anotherBadKey: 123,
      });

      expect(res.success).toBe(false);
      expect(res.diagnostics).toHaveLength(2);
      expect(res.diagnostics[0]?.code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
      expect(res.diagnostics[1]?.code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
    });
  });

  describe('Database Connection Pooling Validation Boundaries', () => {
    describe('database.maxConnections', () => {
      it('strictly accepts valid positive integers >= 1', () => {
        const validValues = [1, 2, 5, 10, 100, 10000, Number.MAX_SAFE_INTEGER];
        for (const maxConnections of validValues) {
          const res = validateUserConfig({ database: { maxConnections } });
          expect(res.success).toBe(true);
          expect(res.diagnostics).toHaveLength(0);

          const { config } = resolveConfig({ database: { maxConnections } }, process.cwd(), 'production');
          expect(config.database?.maxConnections).toBe(maxConnections);
        }
      });

      it('strictly rejects zero (0)', () => {
        const res = validateUserConfig({ database: { maxConnections: 0 } });
        expect(res.success).toBe(false);
        expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        expect(res.diagnostics[0]?.message).toContain('positive integer (>= 1)');
      });

      it('strictly rejects negative integers', () => {
        const negativeValues = [-1, -2, -100, -999999];
        for (const val of negativeValues) {
          const res = validateUserConfig({ database: { maxConnections: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        }
      });

      it('strictly rejects floating-point numbers', () => {
        const floatValues = [0.1, 0.5, 1.1, 1.5, 3.14159, 10.99];
        for (const val of floatValues) {
          const res = validateUserConfig({ database: { maxConnections: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        }
      });

      it('strictly rejects non-numeric and special numeric values', () => {
        const invalidTypes = [
          NaN,
          Infinity,
          -Infinity,
          '10' as any,
          '1' as any,
          true as any,
          false as any,
          null as any,
          [] as any,
          {} as any,
          (() => 10) as any,
        ];

        for (const val of invalidTypes) {
          const res = validateUserConfig({ database: { maxConnections: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        }
      });
    });

    describe('database.poolTimeout', () => {
      it('strictly accepts zero (0) as non-negative finite number', () => {
        const res = validateUserConfig({ database: { poolTimeout: 0 } });
        expect(res.success).toBe(true);
        expect(res.diagnostics).toHaveLength(0);

        const { config } = resolveConfig({ database: { poolTimeout: 0 } }, process.cwd(), 'production');
        expect(config.database?.poolTimeout).toBe(0);
      });

      it('strictly accepts positive numbers and floats >= 0', () => {
        const validValues = [0.001, 0.5, 1, 1000, 5000, 30000, 99999.99, Number.MAX_SAFE_INTEGER];
        for (const poolTimeout of validValues) {
          const res = validateUserConfig({ database: { poolTimeout } });
          expect(res.success).toBe(true);
          expect(res.diagnostics).toHaveLength(0);

          const { config } = resolveConfig({ database: { poolTimeout } }, process.cwd(), 'production');
          expect(config.database?.poolTimeout).toBe(poolTimeout);
        }
      });

      it('strictly rejects negative numbers', () => {
        const negativeValues = [-0.001, -0.5, -1, -5000, -999999];
        for (const val of negativeValues) {
          const res = validateUserConfig({ database: { poolTimeout: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
          expect(res.diagnostics[0]?.message).toContain('non-negative finite number (>= 0)');
        }
      });

      it('strictly rejects Infinity, -Infinity, NaN', () => {
        const nonFinite = [Infinity, -Infinity, NaN];
        for (const val of nonFinite) {
          const res = validateUserConfig({ database: { poolTimeout: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        }
      });

      it('strictly rejects non-numeric types', () => {
        const invalidTypes = [
          '5000' as any,
          '0' as any,
          true as any,
          false as any,
          null as any,
          [] as any,
          {} as any,
          (() => 5000) as any,
        ];

        for (const val of invalidTypes) {
          const res = validateUserConfig({ database: { poolTimeout: val } });
          expect(res.success).toBe(false);
          expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
        }
      });
    });

    describe('database namespace structural validation', () => {
      it('rejects non-object, null, or array database namespace', () => {
        const invalidNamespaces = [null, [], [1, 2], 'database', 123, true, false];
        for (const val of invalidNamespaces) {
          const res = validateUserConfig({ database: val as any });
          expect(res.success).toBe(false);
          expect(res.diagnostics[0]?.code).toBe('RANU_CONFIG_INVALID');
        }
      });

      it('rejects unknown fields under database namespace', () => {
        const res = validateUserConfig({
          database: {
            maxConnections: 10,
            poolTimeout: 5000,
            idleTimeout: 3000,
            ssl: true,
          } as any,
        });

        expect(res.success).toBe(false);
        expect(res.diagnostics).toHaveLength(2);
        expect(res.diagnostics[0]?.code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
        expect(res.diagnostics[0]?.message).toContain('Unknown configuration field under "database": "idleTimeout"');
        expect(res.diagnostics[1]?.code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
        expect(res.diagnostics[1]?.message).toContain('Unknown configuration field under "database": "ssl"');
      });
    });
  });

  describe('Server, Build, and Routing Boundary Fuzzing', () => {
    it('strictly enforces port boundaries (1 <= port <= 65535, integer)', () => {
      const validPorts = [1, 80, 443, 3000, 8080, 65535];
      for (const port of validPorts) {
        expect(validateUserConfig({ server: { port } }).success).toBe(true);
      }

      const invalidPorts = [0, -1, 65536, 100000, 3000.5, NaN, Infinity, -Infinity, '3000' as any];
      for (const port of invalidPorts) {
        const res = validateUserConfig({ server: { port } });
        expect(res.success).toBe(false);
        expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
      }
    });

    it('strictly validates server.host, server.trustProxy, and rejects unknown fields', () => {
      expect(validateUserConfig({ server: { host: 123 as any } }).success).toBe(false);
      expect(validateUserConfig({ server: { trustProxy: 'yes' as any } }).success).toBe(false);
      expect(validateUserConfig({ server: { unknownProp: true } as any }).success).toBe(false);
    });

    it('strictly validates build namespace fields and rejects unknown properties', () => {
      expect(validateUserConfig({ build: { sourceMaps: 'true' as any } }).success).toBe(false);
      expect(validateUserConfig({ build: { minify: 1 as any } }).success).toBe(false);
      expect(validateUserConfig({ build: { target: 'esnext' } as any }).success).toBe(false);
    });

    it('strictly validates routing trailingSlash enum and basePath type', () => {
      expect(validateUserConfig({ routing: { trailingSlash: 'always' } }).success).toBe(true);
      expect(validateUserConfig({ routing: { trailingSlash: 'never' } }).success).toBe(true);
      expect(validateUserConfig({ routing: { trailingSlash: 'ignore' } }).success).toBe(true);

      const invalidTrailingSlash = ['sometimes', 'ALWAYS', 123, true, null];
      for (const val of invalidTrailingSlash) {
        expect(validateUserConfig({ routing: { trailingSlash: val as any } }).success).toBe(false);
      }

      expect(validateUserConfig({ routing: { basePath: 123 as any } }).success).toBe(false);
    });

    it('strictly validates rendering.defaultMode enum', () => {
      expect(validateUserConfig({ rendering: { defaultMode: 'server' } }).success).toBe(true);
      expect(validateUserConfig({ rendering: { defaultMode: 'static' } }).success).toBe(true);
      expect(validateUserConfig({ rendering: { defaultMode: 'client' } }).success).toBe(true);

      const invalidModes = ['ssr', 'edge', 'SERVER', 123, null];
      for (const val of invalidModes) {
        expect(validateUserConfig({ rendering: { defaultMode: val as any } }).success).toBe(false);
      }
    });
  });

  describe('resolveConfig Immutability & Deep Freeze', () => {
    it('produces completely frozen and tamper-proof config hierarchy', () => {
      const userConfig = {
        server: { port: 8080 },
        database: { maxConnections: 10, poolTimeout: 5000 },
      };

      const { config } = resolveConfig(userConfig, process.cwd(), 'production');

      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.server)).toBe(true);
      expect(Object.isFrozen(config.build)).toBe(true);
      expect(Object.isFrozen(config.routing)).toBe(true);
      expect(Object.isFrozen(config.rendering)).toBe(true);
      expect(Object.isFrozen(config.database)).toBe(true);

      // Attempting mutation throws TypeError
      expect(() => {
        // @ts-expect-error mutating frozen object
        config.server.port = 9000;
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error mutating frozen object
        config.database!.maxConnections = 50;
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error adding property to frozen object
        (config as any).newField = 'hack';
      }).toThrow(TypeError);
    });
  });
});
