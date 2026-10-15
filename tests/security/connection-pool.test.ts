import { describe, it, expect, vi } from 'vitest';
import { validateUserConfig, resolveConfig, defineConfig } from '@ranu/config';
import {
  ConnectionPool,
  ConnectionPoolTimeoutError,
  type DeploymentCapabilities,
  type ConnectionPoolOptions,
} from '@ranu/core';

describe('Suite 14: Database Connection Pooling & Concurrency Storm Safety', () => {
  describe('Configuration Schema Validation', () => {
    it('accepts valid database connection pool configurations', () => {
      const userConfig = defineConfig({
        database: {
          maxConnections: 10,
          poolTimeout: 5000,
        },
      });

      const validation = validateUserConfig(userConfig);
      expect(validation.success).toBe(true);
      expect(validation.diagnostics).toHaveLength(0);

      const { config, diagnostics } = resolveConfig(userConfig, '/test/root', 'production');
      expect(diagnostics).toHaveLength(0);
      expect(config.database?.maxConnections).toBe(10);
      expect(config.database?.poolTimeout).toBe(5000);
    });

    it('rejects invalid maxConnections and poolTimeout types', () => {
      const invalidConfig1 = {
        database: {
          maxConnections: -5,
          poolTimeout: 'fast',
        },
      };

      const res1 = validateUserConfig(invalidConfig1);
      expect(res1.success).toBe(false);
      expect(res1.diagnostics.some((d) => d.message.includes('maxConnections'))).toBe(true);
      expect(res1.diagnostics.some((d) => d.message.includes('poolTimeout'))).toBe(true);
    });

    it('rejects unknown fields under database namespace', () => {
      const invalidConfig2 = {
        database: {
          maxConnections: 5,
          unknownOption: true,
        },
      };

      const res2 = validateUserConfig(invalidConfig2);
      expect(res2.success).toBe(false);
      expect(res2.diagnostics.some((d) => d.code === 'RANU_CONFIG_UNKNOWN_FIELD')).toBe(true);
      expect(res2.diagnostics.some((d) => d.message.includes('unknownOption'))).toBe(true);
    });

    it('rejects non-object database configuration', () => {
      const res = validateUserConfig({ database: 'postgres://localhost' });
      expect(res.success).toBe(false);
      expect(res.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
    });
  });

  describe('Deployment Capabilities & Adapter Limits', () => {
    it('declares maxDatabaseConnections capability in adapter contracts', () => {
      const serverlessCapabilities: DeploymentCapabilities = {
        runtime: 'node',
        ssr: true,
        apiRoutes: true,
        middleware: true,
        streaming: true,
        staticFiles: false,
        runtimeEnvironment: true,
        writableFilesystem: 'temporary',
        longLivedProcess: false,
        supportsWaitUntil: true,
        maxDatabaseConnections: 15,
      };

      expect(serverlessCapabilities.maxDatabaseConnections).toBe(15);
      expect(serverlessCapabilities.supportsWaitUntil).toBe(true);
    });
  });

  describe('Connection Pool Storm Guard & Concurrency Clamping', () => {
    it('clamps active database connections at maxConnections during high concurrency surge (75 requests)', async () => {
      const maxConnections = 8;
      const stormRequests = 75;

      let connectionCounter = 0;
      const pool = new ConnectionPool<{ id: number }>({
        maxConnections,
        poolTimeout: 5000,
      }, () => ({ id: ++connectionCounter }));

      // Run 75 concurrent requests with staggered simulated database latency
      const tasks = Array.from({ length: stormRequests }, async (_, i) => {
        return pool.withConnection(async (conn) => {
          expect(pool.activeConnections).toBeLessThanOrEqual(maxConnections);

          // Simulate database query I/O latency
          const latencyMs = Math.floor(Math.random() * 20) + 10;
          await new Promise((resolve) => setTimeout(resolve, latencyMs));

          expect(pool.activeConnections).toBeLessThanOrEqual(maxConnections);
          return { reqIndex: i, connId: conn.id };
        });
      });

      const results = await Promise.all(tasks);
      expect(results).toHaveLength(stormRequests);

      // Verify strict concurrency clamping
      expect(pool.peakConnections).toBeLessThanOrEqual(maxConnections);
      expect(pool.peakConnections).toBe(maxConnections);
      // All connections safely released back
      expect(pool.activeConnections).toBe(0);
      expect(pool.totalAcquired).toBe(stormRequests);
      expect(pool.totalReleased).toBe(stormRequests);
    });
  });

  describe('Queueing, Graceful Degradation & Timeout Behavior', () => {
    it('queues requests when capacity is saturated and fulfills them in order', async () => {
      const pool = new ConnectionPool({ maxConnections: 1, poolTimeout: 1000 });

      const order: number[] = [];
      const lease1 = await pool.acquire();

      const p2 = pool.withConnection(async () => {
        order.push(2);
      });
      const p3 = pool.withConnection(async () => {
        order.push(3);
      });

      // Both p2 and p3 should be queued because maxConnections is 1
      expect(pool.waitingCount).toBe(2);

      order.push(1);
      lease1.release();

      await Promise.all([p2, p3]);
      expect(order).toEqual([1, 2, 3]);
      expect(pool.waitingCount).toBe(0);
    });

    it('gracefully throws ConnectionPoolTimeoutError (503) when waiting time exceeds poolTimeout', async () => {
      const pool = new ConnectionPool({ maxConnections: 1, poolTimeout: 50 });

      // Acquire connection and hold it longer than poolTimeout
      const slowHolder = pool.acquire();
      const { release } = await slowHolder;

      // Second request arrives and should time out after 50ms
      const timedOutRequest = pool.acquire();

      await expect(timedOutRequest).rejects.toThrow(ConnectionPoolTimeoutError);
      await expect(timedOutRequest).rejects.toMatchObject({
        code: 'CONNECTION_POOL_TIMEOUT',
        status: 503,
      });

      // Cleanup initial connection
      release();
      expect(pool.activeConnections).toBe(0);
    });
  });

  describe('Leak-Free Lifecycle Across Error Paths', () => {
    it('safely releases connection when borrower operation throws an unhandled error', async () => {
      const pool = new ConnectionPool({ maxConnections: 3, poolTimeout: 1000 });

      await expect(
        pool.withConnection(async () => {
          throw new Error('Database transaction deadlocked');
        })
      ).rejects.toThrow('Database transaction deadlocked');

      // Active count must return to 0 even though exception occurred
      expect(pool.activeConnections).toBe(0);
      expect(pool.totalAcquired).toBe(1);
      expect(pool.totalReleased).toBe(1);

      // Subsequent acquisitions succeed normally
      const nextResult = await pool.withConnection(async (conn) => 'success');
      expect(nextResult).toBe('success');
      expect(pool.activeConnections).toBe(0);
    });

    it('safely handles double release calls without corrupting active count', async () => {
      const pool = new ConnectionPool({ maxConnections: 2, poolTimeout: 1000 });

      const lease = await pool.acquire();
      expect(pool.activeConnections).toBe(1);

      lease.release();
      expect(pool.activeConnections).toBe(0);

      // Calling release a second time should be a harmless no-op
      lease.release();
      expect(pool.activeConnections).toBe(0);
      expect(pool.totalReleased).toBe(1);
    });
  });
});
