import { describe, it, expect } from 'vitest';
import {
  serializeHydrationData,
  deserializeHydrationData,
  escapeHtml,
  type RanuHydrationPayload,
} from '@ranu/react';
import { XSS_SCRIPT_BREAKOUT_VECTORS } from './harness.js';

describe('XSS, Hydration Serialization & Script Breakout Defenses (SEC-25, 26, 27, 31)', () => {
  it('Script Breakout Defense: safely escapes </script>, <!--, and HTML tags in hydration data payload', () => {
    for (const vector of XSS_SCRIPT_BREAKOUT_VECTORS) {
      const payload: RanuHydrationPayload = {
        buildId: 'test-build-id',
        routeId: 'route-test',
        pathname: '/test',
        params: { id: vector },
        searchParams: { q: vector },
        publicEnv: { RANU_PUBLIC_XSS: vector },
        assets: { js: ['/client.js'], css: ['/style.css'] },
      };

      const serialized = serializeHydrationData(payload);

      // Crucial assertion: Output must NEVER contain literal unescaped </script> or <script> or raw tags
      expect(serialized).not.toContain('</script>');
      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('<!--');
      if (vector.includes('<')) {
        expect(serialized).toContain('\\u003c'); // encoded <
      }
      if (vector.includes('\u2028')) {
        expect(serialized).toContain('\\u2028');
      }

      // Round-trip deserialization preserves the exact original payload
      const deserialized = deserializeHydrationData(serialized);
      expect(deserialized.params['id']).toBe(vector);
      expect(deserialized.searchParams['q']).toBe(vector);
      expect(deserialized.publicEnv['RANU_PUBLIC_XSS']).toBe(vector);
    }
  });

  it('Prototype Pollution Protection: rejects deserialization of JSON payloads containing forbidden keys', () => {
    const maliciousPayloads = [
      '{"__proto__":{"polluted":true},"buildId":"b1","routeId":"r1","pathname":"/","params":{},"searchParams":{},"publicEnv":{},"assets":{"js":[],"css":[]}}',
      '{"constructor":{"prototype":{"polluted":true}},"buildId":"b1","routeId":"r1","pathname":"/","params":{},"searchParams":{},"publicEnv":{},"assets":{"js":[],"css":[]}}',
      '{"prototype":{"polluted":true},"buildId":"b1","routeId":"r1","pathname":"/","params":{},"searchParams":{},"publicEnv":{},"assets":{"js":[],"css":[]}}',
    ];

    for (const malPayload of maliciousPayloads) {
      expect(() => deserializeHydrationData(malPayload)).toThrow(/Forbidden prototype pollution key/);
    }
  });

  it('Serialization Type Validation: rejects non-serializable and schema-violating types', () => {
    // 1. Function in params
    const funcPayload: any = {
      buildId: 'b1',
      routeId: 'r1',
      pathname: '/',
      params: { fn: () => {} },
      searchParams: {},
      publicEnv: {},
      assets: { js: [], css: [] },
    };
    expect(() => serializeHydrationData(funcPayload)).toThrow(TypeError);

    // 2. Symbol in params
    const symPayload: any = {
      buildId: 'b1',
      routeId: 'r1',
      pathname: '/',
      params: { sym: Symbol('evil') },
      searchParams: {},
      publicEnv: {},
      assets: { js: [], css: [] },
    };
    expect(() => serializeHydrationData(symPayload)).toThrow(TypeError);

    // 3. Invalid non-string in publicEnv
    const numberEnvPayload: any = {
      buildId: 'b1',
      routeId: 'r1',
      pathname: '/',
      params: {},
      searchParams: {},
      publicEnv: { RANU_PUBLIC_PORT: 3000 },
      assets: { js: [], css: [] },
    };
    expect(() => serializeHydrationData(numberEnvPayload)).toThrow(TypeError);
  });

  it('HTML Metadata Escaping: safely encodes HTML special characters to prevent XSS in document head', () => {
    const maliciousMetadata = '<script>alert("xss")</script>&"\'test\'';
    const escaped = escapeHtml(maliciousMetadata);

    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
    expect(escaped).not.toContain('"');
    expect(escaped).not.toContain("'");
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;&#39;test&#39;');
  });
});
