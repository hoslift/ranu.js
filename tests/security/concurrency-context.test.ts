import { describe, it, expect } from 'vitest';
import { NodeRequestContextStore } from '@ranu/runtime-node';
import type { RanuRequestContext } from '@ranu/runtime';

describe('Suite 10: Request Context Isolation & Concurrency Safety (request-context-isolation)', () => {
  it('AsyncLocalStorage Context Store: ensures zero state leakage across 50 concurrent requests', async () => {
    const contextStore = new NodeRequestContextStore();
    const concurrentCount = 50;

    const runSimulatedRequest = async (id: number): Promise<boolean> => {
      const uniqueRequestId = `req-uuid-${id}-${Math.random().toString(36).slice(2)}`;
      const uniqueUserToken = `token-user-${id}-${Date.now()}`;

      const mockContext: RanuRequestContext = {
        requestId: uniqueRequestId,
        url: new URL(`http://localhost/user/${id}`),
        method: 'GET',
        headers: new Headers({ 'Authorization': `Bearer ${uniqueUserToken}` }),
        params: { id: String(id) },
        searchParams: new URLSearchParams(),
        locals: { userId: id, secretToken: uniqueUserToken },
      };

      return contextStore.run(mockContext, async () => {
        // Step 1: Immediate read
        const ctx1 = contextStore.get();
        if (!ctx1 || ctx1.requestId !== uniqueRequestId) return false;
        if (ctx1.locals['secretToken'] !== uniqueUserToken) return false;

        // Step 2: Random asynchronous delay simulating database I/O, crypto hashing, or fetch
        const delayMs = Math.floor(Math.random() * 25) + 5;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Step 3: Post-await read - must still strictly match this specific request
        const ctx2 = contextStore.get();
        if (!ctx2 || ctx2.requestId !== uniqueRequestId) return false;
        if (ctx2.locals['secretToken'] !== uniqueUserToken) return false;
        if (ctx2.headers.get('Authorization') !== `Bearer ${uniqueUserToken}`) return false;

        return true;
      });
    };

    // Execute all 50 concurrent requests simultaneously
    const tasks = Array.from({ length: concurrentCount }, (_, i) => runSimulatedRequest(i));
    const results = await Promise.all(tasks);

    // Every single concurrent request must maintain 100% isolated context
    expect(results).toHaveLength(concurrentCount);
    expect(results.every((res) => res === true)).toBe(true);

    // Outside of any active request context, get() must return undefined
    expect(contextStore.get()).toBeUndefined();
  });
});
