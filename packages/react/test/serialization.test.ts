import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  serializeHydrationData,
  deserializeHydrationData,
  validateHydrationPayload,
  HYDRATION_DATA_SCRIPT_ID,
  HYDRATION_DATA_SCRIPT_TYPE,
  escapeScriptJson,
} from '../src/client/serialization.js';
import { composeComponentTree } from '../src/composition.js';
import { renderReactToStream } from '../src/stream.js';
import type { RanuHydrationPayload, PageModule, LayoutModule } from '../src/types.js';

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

describe('Stage 13A: Hydration Serialization & Document Payload', () => {
  const validPayload: RanuHydrationPayload = {
    buildId: 'ranu_build_test_123',
    routeId: 'app-products-id-page',
    pathname: '/products/42',
    params: {
      id: '42',
      tags: ['electronics', 'gadgets'],
    },
    searchParams: {
      tab: 'reviews',
      filter: ['verified', 'recent'],
      empty: undefined,
    },
    publicEnv: {
      RANU_PUBLIC_API_URL: 'https://api.example.com',
      RANU_PUBLIC_APP_NAME: 'Ranu Store',
    },
    assets: {
      js: ['/_ranu/assets/client-bootstrap.js', '/_ranu/assets/products.js'],
      css: ['/_ranu/assets/main.css'],
    },
  };

  describe('Contract and Roundtrip', () => {
    it('serializes and deserializes a complete valid payload correctly', () => {
      const serialized = serializeHydrationData(validPayload);
      expect(typeof serialized).toBe('string');
      expect(serialized).not.toContain('<');
      expect(serialized).not.toContain('>');

      const restored = deserializeHydrationData(serialized);
      expect(restored.buildId).toBe(validPayload.buildId);
      expect(restored.routeId).toBe(validPayload.routeId);
      expect(restored.pathname).toBe(validPayload.pathname);
      expect(restored.params).toEqual(validPayload.params);
      expect(restored.searchParams.tab).toBe('reviews');
      expect(restored.searchParams.filter).toEqual(['verified', 'recent']);
      expect(restored.publicEnv).toEqual(validPayload.publicEnv);
      expect(restored.assets.js).toEqual(validPayload.assets.js);
      expect(restored.assets.css).toEqual(validPayload.assets.css);
    });

    it('exports authoritative script ID and script MIME type constants', () => {
      expect(HYDRATION_DATA_SCRIPT_ID).toBe('__ranu_data__');
      expect(HYDRATION_DATA_SCRIPT_TYPE).toBe('application/json');
    });

    it('freezes returned deserialized payload objects to prevent accidental runtime mutation', () => {
      const serialized = serializeHydrationData(validPayload);
      const restored = deserializeHydrationData(serialized);

      expect(Object.isFrozen(restored.params)).toBe(true);
      expect(Object.isFrozen(restored.searchParams)).toBe(true);
      expect(Object.isFrozen(restored.publicEnv)).toBe(true);
      expect(Object.isFrozen(restored.assets.js)).toBe(true);
      expect(Object.isFrozen(restored.assets.css)).toBe(true);
    });
  });

  describe('XSS and Script Breakout Protection', () => {
    it('escapes closing script tags, opening script tags, and HTML comments', () => {
      const hostilePayload: RanuHydrationPayload = {
        buildId: 'test_build',
        routeId: 'test_route',
        pathname: '/test',
        params: {
          xss1: '</script><script>alert("xss")</script>',
          xss2: '<!-- comment -->',
          xss3: '"><img src=x onerror=alert(1)>',
        },
        searchParams: {
          q: '</script><script src="evil.js"></script>',
        },
        publicEnv: {
          RANU_PUBLIC_INJECTION: '"><script>window.pwned=true</script>',
        },
        assets: {
          js: ['/safe.js'],
          css: ['/safe.css'],
        },
      };

      const serialized = serializeHydrationData(hostilePayload);

      // Verify no raw script-breaking characters exist in serialized string
      expect(serialized).not.toContain('</script>');
      expect(serialized).not.toContain('<script>');
      expect(serialized).not.toContain('<!--');
      expect(serialized).not.toContain('-->');
      expect(serialized).not.toContain('<');
      expect(serialized).not.toContain('>');

      // Verify exact unicode escape sequences are present
      expect(serialized).toContain('\\u003c/script\\u003e');
      expect(serialized).toContain('\\u003cscript\\u003e');

      // Verify roundtrip restores exact unescaped strings
      const restored = deserializeHydrationData(serialized);
      expect(restored.params.xss1).toBe('</script><script>alert("xss")</script>');
      expect(restored.params.xss2).toBe('<!-- comment -->');
      expect(restored.searchParams.q).toBe('</script><script src="evil.js"></script>');
    });

    it('escapes unicode line and paragraph separators (U+2028, U+2029)', () => {
      const separatorString = 'Line\u2028Break\u2029Paragraph';
      const escaped = escapeScriptJson(JSON.stringify({ text: separatorString }));
      expect(escaped).toContain('\\u2028');
      expect(escaped).toContain('\\u2029');
    });
  });

  describe('Invalid Shape and Type Validation', () => {
    it('rejects non-object, null, and empty payloads', () => {
      expect(() => validateHydrationPayload(null)).toThrow(TypeError);
      expect(() => validateHydrationPayload(undefined)).toThrow(TypeError);
      expect(() => validateHydrationPayload('string')).toThrow(TypeError);
      expect(() => validateHydrationPayload(123)).toThrow(TypeError);
      expect(() => validateHydrationPayload([])).toThrow(TypeError);
      expect(() => deserializeHydrationData('')).toThrow(TypeError);
    });

    it('rejects missing or invalid buildId', () => {
      expect(() => validateHydrationPayload({ ...validPayload, buildId: '' })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, buildId: '   ' })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, buildId: 123 as any })).toThrow(TypeError);
    });

    it('rejects missing or invalid routeId', () => {
      expect(() => validateHydrationPayload({ ...validPayload, routeId: '' })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, routeId: null as any })).toThrow(TypeError);
    });

    it('rejects invalid pathname (must be absolute starting with "/")', () => {
      expect(() => validateHydrationPayload({ ...validPayload, pathname: 'products/42' })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, pathname: '' })).toThrow(TypeError);
    });

    it('rejects malformed params and searchParams', () => {
      expect(() => validateHydrationPayload({ ...validPayload, params: null as any })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, params: { id: 123 as any } })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, searchParams: { tab: 456 as any } })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, searchParams: { tab: [true as any] } })).toThrow(TypeError);
    });

    it('rejects malformed publicEnv', () => {
      expect(() => validateHydrationPayload({ ...validPayload, publicEnv: null as any })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, publicEnv: { KEY: 123 as any } })).toThrow(TypeError);
    });

    it('rejects malformed assets', () => {
      expect(() => validateHydrationPayload({ ...validPayload, assets: null as any })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, assets: { js: 'not-array' as any, css: [] } })).toThrow(TypeError);
      expect(() => validateHydrationPayload({ ...validPayload, assets: { js: [], css: [123 as any] } })).toThrow(TypeError);
    });
  });

  describe('Non-Serializable Value Defense', () => {
    it('rejects functions in payload during serialization', () => {
      const payloadWithFn = {
        ...validPayload,
        params: {
          ...validPayload.params,
          fn: (() => 'exploit') as any,
        },
      };
      expect(() => serializeHydrationData(payloadWithFn)).toThrow(TypeError);
    });

    it('rejects symbols in payload during serialization', () => {
      const payloadWithSymbol = {
        ...validPayload,
        params: {
          ...validPayload.params,
          sym: Symbol('test') as any,
        },
      };
      expect(() => serializeHydrationData(payloadWithSymbol)).toThrow(TypeError);
    });

    it('rejects BigInt values in payload during serialization', () => {
      const payloadWithBigInt = {
        ...validPayload,
        params: {
          ...validPayload.params,
          big: BigInt(9007199254740991) as any,
        },
      };
      expect(() => serializeHydrationData(payloadWithBigInt)).toThrow(TypeError);
    });

    it('rejects class instances and non-plain objects in payload', () => {
      class CustomData {}
      const payloadWithClass = {
        ...validPayload,
        params: {
          ...validPayload.params,
          instance: new CustomData() as any,
        },
      };
      expect(() => serializeHydrationData(payloadWithClass)).toThrow(TypeError);
    });

    it('rejects circular structures during serialization', () => {
      const circularParams: Record<string, any> = { id: '1' };
      circularParams.self = circularParams;
      const circularPayload: any = {
        ...validPayload,
        params: circularParams,
      };
      expect(() => serializeHydrationData(circularPayload)).toThrow(TypeError);
    });
  });

  describe('Prototype Pollution Defense', () => {
    it('rejects hostile prototype pollution keys in deserialization and validation', () => {
      const hostileProtoJson = JSON.stringify({
        ...validPayload,
        params: {
          __proto__: { polluted: true },
        },
      });

      expect(() => deserializeHydrationData(hostileProtoJson)).toThrow(TypeError);
      expect((Object.prototype as any).polluted).toBeUndefined();

      const hostileConstructorJson = JSON.stringify({
        ...validPayload,
        params: {
          constructor: { polluted: true },
        },
      });

      expect(() => deserializeHydrationData(hostileConstructorJson)).toThrow(TypeError);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Document Composition Integration', () => {
    it('renders the inert JSON script tag into the SSR stream when hydrationPayload is provided', async () => {
      const pageModule: PageModule = {
        default: ({ params }) => React.createElement('h1', null, `Product ${params.id}`),
      };

      const rootLayoutModule: LayoutModule = {
        default: ({ children }) =>
          React.createElement(
            'html',
            { lang: 'en' },
            React.createElement('head', null, React.createElement('title', null, 'Ranu Store')),
            React.createElement('body', null, children)
          ),
      };

      const tree = composeComponentTree({
        page: pageModule,
        layouts: [rootLayoutModule],
        pageProps: {
          params: { id: '42' },
          searchParams: {},
        },
        hydrationPayload: validPayload,
      });

      const stream = await renderReactToStream(tree);
      const html = await streamToString(stream);

      // Verify inert script element presence and attributes
      expect(html).toContain('<script id="__ranu_data__" type="application/json">');
      expect(html).toContain('ranu_build_test_123');
      expect(html).toContain('app-products-id-page');
      expect(html).toContain('/products/42');
      expect(html).toContain('<h1>Product 42</h1>');

      // Verify no artificial root div wrapper was injected
      expect(html).not.toContain('<div id="root">');
      expect(html).not.toContain('id="root"');
    });

    it('does not render the script tag when hydrationPayload is undefined', async () => {
      const pageModule: PageModule = {
        default: () => React.createElement('h1', null, 'Simple Page'),
      };

      const rootLayoutModule: LayoutModule = {
        default: ({ children }) =>
          React.createElement('html', null, React.createElement('body', null, children)),
      };

      const tree = composeComponentTree({
        page: pageModule,
        layouts: [rootLayoutModule],
        pageProps: {
          params: {},
          searchParams: {},
        },
      });

      const stream = await renderReactToStream(tree);
      const html = await streamToString(stream);

      expect(html).not.toContain('id="__ranu_data__"');
      expect(html).not.toContain('type="application/json"');
      expect(html).toContain('<h1>Simple Page</h1>');
    });
  });
});
