import { getRequestContext } from './context.js';
import type { ReadonlyHeaders } from './types.js';

export type { ReadonlyHeaders };

const IMMUTABLE_HEADER_ERROR =
  'Cannot modify read-only request headers via headers(). Use Response headers instead.';

const customInspectSymbol = Symbol.for('nodejs.util.inspect.custom');

/**
 * Exposes incoming request headers to server-side application code with read-only semantics.
 * Attempts to mutate request headers (via set, append, delete, assignment, deletion, or definition) throw a TypeError.
 */
export function headers(): ReadonlyHeaders {
  const context = getRequestContext();
  return createReadonlyHeaders(context.request.headers);
}

function createReadonlyHeaders(rawHeaders: Headers): ReadonlyHeaders {
  // Attach Node.js custom inspect hook to the underlying Headers instance as a non-enumerable
  // own property. This prevents Node's util.inspect / console.log from walking up to
  // Headers.prototype[customInspectSymbol] and failing with:
  // "TypeError: Cannot read private member #headersList from an object whose class did not declare it"
  function customInspect(
    depth: number,
    options: { stylize?: (text: string, styleType: string) => string } & Record<string, unknown>,
    inspect?: (val: unknown, opts?: unknown) => string
  ): string {
    if (depth < 0) {
      return options?.stylize ? options.stylize('[ReadonlyHeaders]', 'special') : '[ReadonlyHeaders]';
    }
    const entries = Object.fromEntries(rawHeaders.entries());
    const formatted = inspect ? inspect(entries, options) : JSON.stringify(entries);
    return `ReadonlyHeaders ${formatted}`;
  }

  if (!Object.prototype.hasOwnProperty.call(rawHeaders, customInspectSymbol)) {
    Object.defineProperty(rawHeaders, customInspectSymbol, {
      value: customInspect,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  }

  return new Proxy(rawHeaders, {
    get(target, prop, receiver) {
      // Intercept mutating methods
      if (prop === 'set' || prop === 'append' || prop === 'delete') {
        return () => {
          throw new TypeError(IMMUTABLE_HEADER_ERROR);
        };
      }

      // Intercept forEach to guarantee the 3rd parameter 'parent' is the ReadonlyHeaders proxy (receiver),
      // rather than the raw mutable WHATWG Headers instance (target).
      if (prop === 'forEach') {
        return (
          callbackfn: (value: string, key: string, parent: ReadonlyHeaders) => void,
          thisArg?: unknown
        ) => {
          target.forEach((value, key) => {
            callbackfn.call(thisArg, value, key, receiver);
          });
        };
      }

      // Return the custom inspect hook if accessed directly on the proxy
      if (prop === customInspectSymbol) {
        return customInspect;
      }

      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },

    set() {
      throw new TypeError(IMMUTABLE_HEADER_ERROR);
    },

    deleteProperty() {
      throw new TypeError(IMMUTABLE_HEADER_ERROR);
    },

    defineProperty() {
      throw new TypeError(IMMUTABLE_HEADER_ERROR);
    },

    setPrototypeOf() {
      throw new TypeError(IMMUTABLE_HEADER_ERROR);
    },

    preventExtensions() {
      throw new TypeError(IMMUTABLE_HEADER_ERROR);
    },

    isExtensible(target) {
      return Reflect.isExtensible(target);
    },

    ownKeys(target) {
      return Reflect.ownKeys(target);
    },

    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  }) as unknown as ReadonlyHeaders;
}
