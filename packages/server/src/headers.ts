import { getRequestContext } from './context.js';

/**
 * Exposes incoming request headers to server-side application code with read-only semantics.
 * Attempts to mutate request headers (via set, append, delete) throw a TypeError.
 */
export function headers(): Headers {
  const context = getRequestContext();
  return createReadonlyHeaders(context.request.headers);
}

function createReadonlyHeaders(rawHeaders: Headers): Headers {
  return new Proxy(rawHeaders, {
    get(target, prop, receiver) {
      if (prop === 'set' || prop === 'append' || prop === 'delete') {
        return () => {
          throw new TypeError('Cannot modify read-only request headers via headers(). Use Response headers instead.');
        };
      }
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },
  });
}
