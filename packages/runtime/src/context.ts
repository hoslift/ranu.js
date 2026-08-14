import type { RanuRequestContext } from './types.js';

export interface RequestContextStore {
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T>;
  get(): RanuRequestContext | undefined;
}
