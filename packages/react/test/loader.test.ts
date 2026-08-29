import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  isPageModule,
  isLayoutModule,
  isLoadingModule,
  isErrorModule,
  isNotFoundModule,
  createDefaultModuleLoader,
} from '../src/loader.js';
import type { RawModuleLoader } from '../src/types.js';

describe('Module Loader & Type Guards', () => {
  describe('isPageModule', () => {
    it('validates a correct page module with function default export', () => {
      const validModule = {
        default: () => React.createElement('h1', null, 'Hello'),
        metadata: { title: 'Test Page' },
      };
      expect(isPageModule(validModule)).toBe(true);
    });

    it('validates a page module with generateMetadata function', () => {
      const validModule = {
        default: async () => React.createElement('div', null, 'Async Page'),
        generateMetadata: async () => ({ title: 'Dynamic Title' }),
      };
      expect(isPageModule(validModule)).toBe(true);
    });

    it('rejects a module without default export', () => {
      expect(isPageModule({})).toBe(false);
      expect(isPageModule({ metadata: { title: 'No Default' } })).toBe(false);
    });

    it('rejects a module with non-component default export', () => {
      expect(isPageModule({ default: 'not a component' })).toBe(false);
      expect(isPageModule({ default: 123 })).toBe(false);
      expect(isPageModule({ default: null })).toBe(false);
    });

    it('rejects a module with invalid metadata shape', () => {
      expect(isPageModule({ default: () => null, metadata: 'invalid' })).toBe(false);
    });

    it('rejects a module with invalid generateMetadata shape', () => {
      expect(isPageModule({ default: () => null, generateMetadata: 'not a function' })).toBe(false);
    });

    it('rejects a module with invalid render mode', () => {
      expect(isPageModule({ default: () => null, render: 'invalid-mode' })).toBe(false);
    });
  });

  describe('isLayoutModule', () => {
    it('validates a correct layout module', () => {
      const valid = {
        default: ({ children }: any) => React.createElement('div', null, children),
        metadata: { description: 'Root Layout' },
      };
      expect(isLayoutModule(valid)).toBe(true);
    });

    it('rejects an invalid layout module', () => {
      expect(isLayoutModule({ default: null })).toBe(false);
      expect(isLayoutModule({ default: 42 })).toBe(false);
    });
  });

  describe('isLoadingModule, isErrorModule, isNotFoundModule', () => {
    it('validates loading module', () => {
      expect(isLoadingModule({ default: () => React.createElement('div', null, 'Loading...') })).toBe(true);
      expect(isLoadingModule({})).toBe(false);
    });

    it('validates error module', () => {
      expect(isErrorModule({ default: ({ error }: any) => React.createElement('div', null, error.message) })).toBe(true);
      expect(isErrorModule({ default: 'err' })).toBe(false);
    });

    it('validates notFound module', () => {
      expect(isNotFoundModule({ default: () => React.createElement('div', null, 'Not Found') })).toBe(true);
      expect(isNotFoundModule({ default: null })).toBe(false);
    });
  });

  describe('createDefaultModuleLoader', () => {
    it('loads and validates a valid page module from raw loader', async () => {
      const mockRawLoader: RawModuleLoader = {
        async loadRaw(path: string) {
          if (path === 'app/page.tsx') {
            return {
              default: () => React.createElement('h1', null, 'Home'),
              metadata: { title: 'Home' },
            };
          }
          throw new Error('Not found');
        },
      };

      const loader = createDefaultModuleLoader(mockRawLoader);
      const page = await loader.loadPage('app/page.tsx');
      expect(page).toBeDefined();
      expect(typeof page.default).toBe('function');
      expect(page.metadata?.title).toBe('Home');
    });

    it('throws structured error when loading an invalid page module', async () => {
      const mockRawLoader: RawModuleLoader = {
        async loadRaw() {
          return { default: 'invalid string' };
        },
      };

      const loader = createDefaultModuleLoader(mockRawLoader);
      await expect(loader.loadPage('app/invalid.tsx')).rejects.toThrow(
        'Invalid page module at "app/invalid.tsx"',
      );
    });

    it('returns undefined when optional boundary module fails to load or is invalid', async () => {
      const mockRawLoader: RawModuleLoader = {
        async loadRaw(path: string) {
          if (path === 'app/loading.tsx') {
            return { default: 'invalid' };
          }
          throw new Error('File not found');
        },
      };

      const loader = createDefaultModuleLoader(mockRawLoader);
      const loading = await loader.loadLoading('app/loading.tsx');
      expect(loading).toBeUndefined();

      const notFound = await loader.loadNotFound('app/not-found.tsx');
      expect(notFound).toBeUndefined();
    });
  });
});
