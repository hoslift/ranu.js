import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  defineConfig,
  discoverConfig,
  loadConfig,
  validateUserConfig,
  resolveConfig,
  parseDotenv,
  loadEnv,
  filterPublicEnv
} from '../src/index.js';

describe('@ranu/config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'Ranu.js-config-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('defineConfig helper', () => {
    it('returns user config object as-is', () => {
      const config = { server: { port: 8080 } };
      expect(defineConfig(config)).toBe(config);
    });

    it('returns function config loader as-is', () => {
      const fn = () => ({ server: { port: 8080 } });
      expect(defineConfig(fn)).toBe(fn);
    });

    it('throws descriptive error when given unknown field and attaches diagnostics', () => {
      expect(() => {
        defineConfig({ unknownField: true } as any);
      }).toThrowError(/\[RANU_CONFIG_UNKNOWN_FIELD\].*Unknown top-level configuration namespace/);

      try {
        defineConfig({ invalidTopLevel: 123 } as any);
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(Array.isArray(err.diagnostics)).toBe(true);
        expect(err.diagnostics[0].code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
      }
    });

    it('throws descriptive error when given invalid field type and attaches diagnostics', () => {
      expect(() => {
        defineConfig({ server: { port: 'invalid_port' as any } });
      }).toThrowError(/\[RANU_CONFIG_INVALID\].*Field "server\.port"/);

      try {
        defineConfig({ database: { maxConnections: -10 } });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(Array.isArray(err.diagnostics)).toBe(true);
        expect(err.diagnostics[0].code).toBe('RANU_CONFIG_INVALID');
      }
    });
  });

  describe('config discovery', () => {
    it('discovers config files in canonical order (.ts -> .js -> .mjs -> .cjs)', () => {
      fs.writeFileSync(path.join(tempDir, 'ranu.config.js'), 'export default {}');
      const discovered = discoverConfig(tempDir);
      expect(discovered.configPath).toBe(path.join(tempDir, 'ranu.config.js'));
      expect(discovered.diagnostic).toBeUndefined();
    });

    it('returns RANU_CONFIG_AMBIGUOUS if multiple configs exist', () => {
      fs.writeFileSync(path.join(tempDir, 'ranu.config.ts'), 'export default {}');
      fs.writeFileSync(path.join(tempDir, 'ranu.config.js'), 'export default {}');
      const discovered = discoverConfig(tempDir);
      expect(discovered.configPath).toBeUndefined();
      expect(discovered.diagnostic).toBeDefined();
      expect(discovered.diagnostic?.code).toBe('RANU_CONFIG_AMBIGUOUS');
    });

    it('returns undefined config path if config is missing', () => {
      const discovered = discoverConfig(tempDir);
      expect(discovered.configPath).toBeUndefined();
      expect(discovered.diagnostic).toBeUndefined();
    });

    it('ignores old velox.config.ts file and returns undefined', () => {
      fs.writeFileSync(path.join(tempDir, 'velox.config.ts'), 'export default {}');
      const discovered = discoverConfig(tempDir);
      expect(discovered.configPath).toBeUndefined();
      expect(discovered.diagnostic).toBeUndefined();
    });
  });

  describe('config loading', () => {
    it('loads TypeScript config using transpilation module', async () => {
      const tsContent = `
        import { defineConfig } from './index.js';
        export default {
          server: { port: 4000 }
        };
      `;
      fs.writeFileSync(path.join(tempDir, 'ranu.config.ts'), tsContent);
      const loaded = await loadConfig(path.join(tempDir, 'ranu.config.ts'));
      expect(loaded).toBeDefined();
      expect(loaded.server.port).toBe(4000);
    }, 15_000);

    it('loads ESM config (.mjs) correctly', async () => {
      fs.writeFileSync(path.join(tempDir, 'ranu.config.mjs'), 'export default { server: { port: 5000 } };');
      const loaded = await loadConfig(path.join(tempDir, 'ranu.config.mjs'));
      expect(loaded.server.port).toBe(5000);
    });

    it('loads CommonJS config (.cjs) correctly', async () => {
      fs.writeFileSync(path.join(tempDir, 'ranu.config.cjs'), 'module.exports = { server: { port: 6000 } };');
      const loaded = await loadConfig(path.join(tempDir, 'ranu.config.cjs'));
      expect(loaded.server.port).toBe(6000);
    });

    it('throws RANU_CONFIG_LOAD_FAILED if config has syntax error', async () => {
      fs.writeFileSync(path.join(tempDir, 'ranu.config.js'), 'export default { error syntax }');
      await expect(loadConfig(path.join(tempDir, 'ranu.config.js'))).rejects.toThrow();
    });
  });

  describe('config validation', () => {
    it('passes for a valid config schema', () => {
      const config = {
        server: {
          host: '0.0.0.0',
          port: 4500,
          trustProxy: true
        },
        build: {
          sourceMaps: true,
          minify: false
        },
        routing: {
          trailingSlash: 'never',
          basePath: '/base'
        },
        rendering: {
          defaultMode: 'client'
        },
        env: {
          files: false
        }
      };
      const result = validateUserConfig(config);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('rejects unknown top-level configuration namespaces', () => {
      const config = {
        unknownNamespace: { hello: 'world' }
      };
      const result = validateUserConfig(config);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
      expect(result.diagnostics[0].message).toContain('Unknown top-level configuration namespace');
    });

    it('rejects unknown fields under build or server', () => {
      const config = {
        build: {
          unknownField: true
        }
      };
      const result = validateUserConfig(config);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
      expect(result.diagnostics[0].message).toContain('Unknown configuration field under "build"');
    });

    it('rejects invalid field value types', () => {
      const config = {
        server: {
          port: 'not-a-number' as any
        }
      };
      const result = validateUserConfig(config);
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_CONFIG_INVALID');
    });

    it('passes validation for valid database configuration', () => {
      const config = {
        database: {
          maxConnections: 10,
          poolTimeout: 5000,
        },
      };
      const result = validateUserConfig(config);
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('rejects invalid database.maxConnections (negative, zero, floating point, string)', () => {
      const invalidValues = [-5, 0, 3.14, '10' as any, NaN, Infinity];
      for (const val of invalidValues) {
        const result = validateUserConfig({ database: { maxConnections: val } });
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
      }
    });

    it('rejects invalid database.poolTimeout (negative, non-finite)', () => {
      const invalidValues = [-1, -500, Infinity, -Infinity, NaN, '5000' as any];
      for (const val of invalidValues) {
        const result = validateUserConfig({ database: { poolTimeout: val } });
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.code === 'RANU_CONFIG_INVALID')).toBe(true);
      }
    });

    it('accepts zero as a valid database.poolTimeout', () => {
      const result = validateUserConfig({ database: { poolTimeout: 0 } });
      expect(result.success).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('rejects non-object, null, or array database namespace', () => {
      const invalidNamespaces = [null, 'invalid', 123, [], false];
      for (const val of invalidNamespaces) {
        const result = validateUserConfig({ database: val as any });
        expect(result.success).toBe(false);
        expect(result.diagnostics[0].code).toBe('RANU_CONFIG_INVALID');
      }
    });

    it('rejects unknown fields under database with RANU_CONFIG_UNKNOWN_FIELD', () => {
      const result = validateUserConfig({
        database: {
          maxConnections: 10,
          idleTimeout: 3000,
        } as any,
      });
      expect(result.success).toBe(false);
      expect(result.diagnostics[0].code).toBe('RANU_CONFIG_UNKNOWN_FIELD');
      expect(result.diagnostics[0].message).toContain('Unknown configuration field under "database"');
    });
  });

  describe('config default resolution and precedence', () => {
    it('applies defaults correctly when fields are missing', () => {
      const { config } = resolveConfig({}, tempDir, 'production');
      expect(config.build.sourceMaps).toBe(false);
      expect(config.build.minify).toBe(true);
      expect(config.server.host).toBe('127.0.0.1');
      expect(config.server.port).toBe(3000);
      expect(config.server.trustProxy).toBe(false);
      expect(config.routing.trailingSlash).toBe('ignore');
      expect(config.rendering.defaultMode).toBe('server');
    });

    it('allows CLI overrides to take precedence over config file and defaults', () => {
      const userConfig = {
        server: {
          port: 5000,
          host: '10.0.0.1'
        }
      };
      const { config } = resolveConfig(userConfig, tempDir, 'production', { port: 9000, host: '0.0.0.0' });
      expect(config.server.port).toBe(9000);
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('freezes the resolved config making it immutable', () => {
      const { config } = resolveConfig({}, tempDir, 'production');
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.build)).toBe(true);
      expect(Object.isFrozen(config.server)).toBe(true);
    });

    it('merges database options into ResolvedRanuConfig and freezes it', () => {
      const userConfig = {
        database: {
          maxConnections: 20,
          poolTimeout: 3000,
        },
      };
      const { config, diagnostics } = resolveConfig(userConfig, tempDir, 'production');
      expect(diagnostics).toHaveLength(0);
      expect(config.database).toEqual({
        maxConnections: 20,
        poolTimeout: 3000,
      });
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.database)).toBe(true);
    });

    it('merges partial database options into ResolvedRanuConfig and freezes it', () => {
      const userConfig = {
        database: {
          maxConnections: 5,
        },
      };
      const { config, diagnostics } = resolveConfig(userConfig, tempDir, 'production');
      expect(diagnostics).toHaveLength(0);
      expect(config.database).toEqual({
        maxConnections: 5,
      });
      expect(Object.isFrozen(config.database)).toBe(true);
    });

    it('leaves database undefined in ResolvedRanuConfig when not provided in user config', () => {
      const { config } = resolveConfig({}, tempDir, 'production');
      expect(config.database).toBeUndefined();
    });
  });

  describe('dotenv parsing and environment loading', () => {
    it('parses conventional dotenv file lines with comments and quotes', () => {
      const content = `
        # Database secrets
        DATABASE_URL="postgresql://localhost:5432"
        # API Keys
        API_KEY='secret_key'
        EMPTY_VAR=
      `;
      const env = parseDotenv(content);
      expect(env.DATABASE_URL).toBe('postgresql://localhost:5432');
      expect(env.API_KEY).toBe('secret_key');
      expect(env.EMPTY_VAR).toBe('');
    });

    it('loads environment files in precedence order (.env -> .env.mode -> .env.local -> .env.mode.local)', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'VAL1=dotenv\nVAL2=dotenv\nVAL3=dotenv\nVAL4=dotenv');
      fs.writeFileSync(path.join(tempDir, '.env.development'), 'VAL2=dev\nVAL3=dev\nVAL4=dev');
      fs.writeFileSync(path.join(tempDir, '.env.local'), 'VAL3=local\nVAL4=local');
      fs.writeFileSync(path.join(tempDir, '.env.development.local'), 'VAL4=dev-local');

      const loaded = loadEnv('development', tempDir);
      expect(loaded.VAL1).toBe('dotenv');
      expect(loaded.VAL2).toBe('dev');
      expect(loaded.VAL3).toBe('local');
      expect(loaded.VAL4).toBe('dev-local');
    });

    it('ensures process.env takes final override precedence (existing env wins)', () => {
      process.env.TEST_EXISTING_ENV = 'process-wins';
      fs.writeFileSync(path.join(tempDir, '.env'), 'TEST_EXISTING_ENV=dotenv-value');

      const loaded = loadEnv('development', tempDir);
      expect(loaded.TEST_EXISTING_ENV).toBe('process-wins');
      delete process.env.TEST_EXISTING_ENV;
    });

    it('handles empty and missing environment values cleanly', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'TEST_EMPTY=\nTEST_SPACES=" "');
      const loaded = loadEnv('development', tempDir);
      expect(loaded.TEST_EMPTY).toBe('');
      expect(loaded.TEST_SPACES).toBe(' ');
      expect(loaded.TEST_MISSING).toBeUndefined();
    });

    it('performs strict RANU_PUBLIC_ classification and rejects VELOX_PUBLIC_', () => {
      const env = {
        RANU_PUBLIC_API_URL: 'https://api.ranu.dev',
        VELOX_PUBLIC_API_URL: 'https://api.velox.dev',
        DATABASE_SECRET: 'super-secret',
        PORT: '3000'
      };
      const publicEnv = filterPublicEnv(env);
      expect(publicEnv.RANU_PUBLIC_API_URL).toBe('https://api.ranu.dev');
      expect(publicEnv.VELOX_PUBLIC_API_URL).toBeUndefined();
      expect(publicEnv.DATABASE_SECRET).toBeUndefined();
      expect(publicEnv.PORT).toBeUndefined();
    });

    it('does not perform implicit coercion to numbers or booleans', () => {
      fs.writeFileSync(path.join(tempDir, '.env'), 'PORT=3000\nIS_ENABLED=false');
      const loaded = loadEnv('development', tempDir);
      expect(loaded.PORT).toBe('3000'); // remains string
      expect(loaded.IS_ENABLED).toBe('false'); // remains string
      expect(loaded.PORT).not.toBe(3000);
      expect(loaded.IS_ENABLED).not.toBe(false);
    });
  });
});
