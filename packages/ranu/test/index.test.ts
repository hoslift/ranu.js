import { describe, it, expect } from 'vitest';
import { RANU_VERSION, defineConfig as rootDefineConfig } from '../src/index.js';
import { defineConfig as configDefineConfig } from '../src/config.js';
import { Link, useRouter, usePathname, useSearchParams } from '../src/react.js';
import {
  cookies,
  headers,
  redirect,
  notFound,
  next,
  rewrite,
  getRequestContext,
} from '../src/server.js';
import { definePlugin } from '../src/plugin.js';

describe('Ranu.js package public entry points', () => {
  describe('root entry ("ranu")', () => {
    it('exports RANU_VERSION', () => {
      expect(RANU_VERSION).toBe('0.0.0');
    });

    it('exports defineConfig convenience helper matching ranu/config', () => {
      expect(rootDefineConfig).toBeTypeOf('function');
      expect(rootDefineConfig).toBe(configDefineConfig);

      const config = rootDefineConfig({
        server: { port: 3000 },
      });
      expect(config).toEqual({
        server: { port: 3000 },
      });
    });
  });

  describe('configuration entry ("ranu/config")', () => {
    it('exports canonical defineConfig function', () => {
      expect(configDefineConfig).toBeTypeOf('function');
      const config = configDefineConfig((ctx) => ({
        mode: ctx.mode,
      }));
      expect(typeof config).toBe('function');
    });
  });

  describe('react entry ("ranu/react")', () => {
    it('exports client navigation components and hooks', () => {
      expect(Link).toBeDefined();
      expect(useRouter).toBeTypeOf('function');
      expect(usePathname).toBeTypeOf('function');
      expect(useSearchParams).toBeTypeOf('function');
    });
  });

  describe('server entry ("ranu/server")', () => {
    it('exports server helpers and context accessors', () => {
      expect(cookies).toBeTypeOf('function');
      expect(headers).toBeTypeOf('function');
      expect(redirect).toBeTypeOf('function');
      expect(notFound).toBeTypeOf('function');
      expect(next).toBeTypeOf('function');
      expect(rewrite).toBeTypeOf('function');
      expect(getRequestContext).toBeTypeOf('function');
    });
  });

  describe('plugin entry ("ranu/plugin")', () => {
    it('exports definePlugin helper', () => {
      expect(definePlugin).toBeTypeOf('function');
      const plugin = definePlugin({
        name: 'test-plugin',
        apiVersion: 1,
        version: '1.0.0',
        setup: () => {},
      });
      expect(plugin.name).toBe('test-plugin');
    });
  });

  describe('server-only entry ("ranu/server-only")', () => {
    it('can be imported as a marker module without throwing', async () => {
      const mod = await import('../src/server-only.js');
      expect(mod).toBeDefined();
    });
  });
});
