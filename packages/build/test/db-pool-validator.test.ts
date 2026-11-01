import { describe, it, expect } from 'vitest';
import {
  isServerlessTarget,
  validateSourceDbPool,
  validateGraphDbPools,
} from '../src/compiler/db-pool-validator.js';
import type { RanuDeploymentAdapter } from '@ranu/core';
import type { ModuleGraph, ModuleRecord } from '../src/graph/graph-types.js';

describe('Serverless Database Connection Pool Validator (@ranu/build)', () => {
  describe('isServerlessTarget', () => {
    it('detects serverless from adapter name', () => {
      const vercelAdapter: RanuDeploymentAdapter = {
        name: '@ranujs/adapter-vercel',
        apiVersion: 1,
        capabilities: {
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'temporary',
          longLivedProcess: false,
        },
        adapt: async () => ({ success: true, target: 'vercel', outputDirectory: '.vercel' }),
      };

      const cfAdapter: RanuDeploymentAdapter = {
        name: '@ranujs/adapter-cloudflare',
        apiVersion: 1,
        capabilities: {
          runtime: 'workerd',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'none',
          longLivedProcess: false,
        },
        adapt: async () => ({ success: true, target: 'cloudflare', outputDirectory: '.ranu/client' }),
      };

      const netlifyAdapter: RanuDeploymentAdapter = {
        name: 'netlify',
        apiVersion: 1,
        capabilities: {
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'temporary',
          longLivedProcess: false,
        },
        adapt: async () => ({ success: true, target: 'netlify', outputDirectory: '.netlify' }),
      };

      expect(isServerlessTarget(vercelAdapter)).toBe(true);
      expect(isServerlessTarget(cfAdapter)).toBe(true);
      expect(isServerlessTarget(netlifyAdapter)).toBe(true);
    });

    it('returns false for long-lived containerized Node adapter', () => {
      const nodeAdapter: RanuDeploymentAdapter = {
        name: '@ranujs/adapter-node',
        apiVersion: 1,
        capabilities: {
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'persistent',
          longLivedProcess: true,
          maxDatabaseConnections: 20,
        },
        adapt: async () => ({ success: true, target: 'node', outputDirectory: 'dist' }),
      };

      expect(isServerlessTarget(nodeAdapter)).toBe(false);
      expect(isServerlessTarget(undefined)).toBe(false);
    });
  });

  describe('validateSourceDbPool', () => {
    it('warns when pg.Pool or Pool is created with max > 1', () => {
      const code = `
        import { Pool } from 'pg';
        export const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
        });
      `;

      const diags = validateSourceDbPool('/app/db.ts', code, 'vercel');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_SERVERLESS_DB_POOL');
      expect(diags[0]?.severity).toBe('warning');
      expect(diags[0]?.message).toContain('max (10)');
      expect(diags[0]?.hint).toContain('max: 1');
    });

    it('warns when mysql2.createPool is called with connectionLimit > 1', () => {
      const code = `
        import mysql from 'mysql2';
        export const db = mysql.createPool({
          uri: process.env.DATABASE_URL,
          connectionLimit: 15,
        });
      `;

      const diags = validateSourceDbPool('/app/db.ts', code, 'cloudflare');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_SERVERLESS_DB_POOL');
      expect(diags[0]?.message).toContain('max (15)');
    });

    it('warns on knex pool configuration with nested max > 1', () => {
      const code = `
        import knex from 'knex';
        export const db = knex({
          client: 'pg',
          pool: {
            min: 2,
            max: 8,
          },
        });
      `;

      const diags = validateSourceDbPool('/app/knex.ts', code, 'netlify');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_SERVERLESS_DB_POOL');
      expect(diags[0]?.message).toContain('max (8)');
    });

    it('does NOT warn when max is set to 1 in serverless target', () => {
      const code = `
        import { Pool } from 'pg';
        export const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 1,
        });
      `;

      const diags = validateSourceDbPool('/app/db.ts', code, 'vercel');
      expect(diags).toHaveLength(0);
    });

    it('does NOT warn on regular non-pool objects with max property', () => {
      const code = `
        export const paginationConfig = {
          min: 1,
          max: 50,
        };
      `;

      const diags = validateSourceDbPool('/app/config.ts', code, 'vercel');
      expect(diags).toHaveLength(0);
    });
  });

  describe('validateGraphDbPools', () => {
    it('skips validation when target is not serverless', () => {
      const nodeAdapter: RanuDeploymentAdapter = {
        name: 'node',
        apiVersion: 1,
        capabilities: {
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'persistent',
          longLivedProcess: true,
        },
        adapt: async () => ({ success: true, target: 'node', outputDirectory: 'dist' }),
      };

      const moduleGraph: ModuleGraph = {
        nodes: new Map(),
        serverRoots: [],
        clientEntries: [],
      };
      const result = validateGraphDbPools(moduleGraph, nodeAdapter);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('emits warning when serverless target has DB pool with max > 1', () => {
      const vercelAdapter: RanuDeploymentAdapter = {
        name: 'vercel',
        apiVersion: 1,
        capabilities: {
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'temporary',
          longLivedProcess: false,
        },
        adapt: async () => ({ success: true, target: 'vercel', outputDirectory: '.vercel' }),
      };

      const code = `
        import { Pool } from 'pg';
        export const pool = new Pool({ max: 10 });
      `;

      // Mock fs.existsSync and fs.readFileSync
      const moduleGraph: ModuleGraph = {
        nodes: new Map([
          [
            'app/server/db.ts',
            {
              id: 'app/server/db.ts',
              filePath: 'app/server/db.ts',
              classification: 'server-only',
              isClientEntry: false,
              isServerOnly: true,
              imports: [],
              importedBy: [],
            },
          ],
        ]),
        serverRoots: ['app/server/db.ts'],
        clientEntries: [],
      };

      const diags = validateSourceDbPool('app/server/db.ts', code, 'vercel');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_SERVERLESS_DB_POOL');
    });
  });
});
