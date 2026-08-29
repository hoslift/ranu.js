import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextStore, RanuRequestContext } from '@ranu/runtime';

/**
 * Node.js implementation of RequestContextStore using AsyncLocalStorage.
 * Guarantees request context isolation across asynchronous execution boundaries.
 */
export class NodeRequestContextStore implements RequestContextStore {
  private readonly storage = new AsyncLocalStorage<RanuRequestContext>();

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(context, callback);
  }

  get(): RanuRequestContext | undefined {
    return this.storage.getStore();
  }
}
