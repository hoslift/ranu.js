import type { RanuRequestContext } from './types.js';

export interface RequestContextStore {
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T>;
  get(): RanuRequestContext | undefined;
}

const registeredStores = new Set<RequestContextStore>();

/**
 * Registers an active provider-neutral RequestContextStore.
 * Multiple independent RanuServerRuntime instances can register their respective stores concurrently.
 * Returns an unregister cleanup function to prevent stale references after runtime disposal.
 */
export function registerRequestContextStore(store: RequestContextStore): () => void {
  registeredStores.add(store);
  return () => {
    registeredStores.delete(store);
  };
}

/**
 * Sets or replaces the active RequestContextStore (convenience/testing helper).
 * When passed a store, adds it to the registry. When passed undefined, clears the registry.
 */
export function setRequestContextStore(store: RequestContextStore | undefined): void {
  if (store) {
    registeredStores.add(store);
  } else {
    registeredStores.clear();
  }
}

/**
 * Returns the current number of registered RequestContextStores.
 * Useful for verifying lifecycle cleanup and detecting stale references.
 */
export function getRegisteredStoresCount(): number {
  return registeredStores.size;
}

/**
 * Returns the currently active RanuRequestContext across all registered stores.
 * When multiple runtimes or nested stores are active simultaneously, resolves the innermost
 * (highest monotonic nesting depth) context deterministically without depending on registry order.
 * Returns undefined if called outside an active request execution flow.
 */
export function getActiveRequestContext(): RanuRequestContext | undefined {
  let innermost: RanuRequestContext | undefined;
  for (const store of registeredStores) {
    const ctx = store.get();
    if (ctx !== undefined) {
      if (!innermost || (ctx.depth ?? 0) >= (innermost.depth ?? 0)) {
        innermost = ctx;
      }
    }
  }
  return innermost;
}
