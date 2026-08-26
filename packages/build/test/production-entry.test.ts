import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createProductionRuntimeWithLoader,
  generateProductionEntrySource,
  loadCompiledMiddleware,
} from '../src/output/production-entry.js';

describe('production entry generation', () => {
  it('loads a compiled middleware module when the artifact exists', async () => {
    const buildDir = path.resolve('virtual-build');
    const middlewarePath = path.resolve(buildDir, 'server/middleware.mjs');
    const middlewareModule = { default: vi.fn() };
    const fileExists = vi.fn(() => true);
    const importModule = vi.fn(async () => middlewareModule);

    await expect(loadCompiledMiddleware(buildDir, fileExists, importModule)).resolves.toBe(
      middlewareModule,
    );
    expect(fileExists).toHaveBeenCalledWith(middlewarePath);
    expect(importModule).toHaveBeenCalledWith(pathToFileURL(middlewarePath).href);
  });

  it('skips middleware import when no compiled artifact exists', async () => {
    const importModule = vi.fn();

    await expect(
      loadCompiledMiddleware(path.resolve('missing-build'), () => false, importModule),
    ).resolves.toBeUndefined();
    expect(importModule).not.toHaveBeenCalled();
  });

  it('creates middleware from the compiled module before constructing the runtime', async () => {
    const middlewareModule = { default: vi.fn() };
    const middleware = { run: vi.fn() };
    const createMiddleware = vi.fn(() => middleware);
    const createRuntime = vi.fn((options) => options);

    const result = await createProductionRuntimeWithLoader(
      {
        createRuntime,
        createMiddleware,
        runtimeOptions: { mode: 'production' },
      },
      async () => middlewareModule,
    );

    expect(createMiddleware).toHaveBeenCalledWith(middlewareModule);
    expect(createRuntime).toHaveBeenCalledWith({ mode: 'production', middleware });
    expect(result).toEqual({ mode: 'production', middleware });
  });

  it('preserves configured middleware when no compiled module exists', async () => {
    const configuredMiddleware = { run: vi.fn() };
    const createMiddleware = vi.fn();
    const createRuntime = vi.fn((options) => options);

    await createProductionRuntimeWithLoader(
      {
        createRuntime,
        createMiddleware,
        runtimeOptions: { middleware: configuredMiddleware },
      },
      async () => undefined,
    );

    expect(createMiddleware).not.toHaveBeenCalled();
    expect(createRuntime).toHaveBeenCalledWith({ middleware: configuredMiddleware });
  });

  it('rejects invalid runtime factories', async () => {
    await expect(
      createProductionRuntimeWithLoader(
        {
          createRuntime: undefined as never,
          createMiddleware: undefined as never,
          runtimeOptions: {},
        },
        async () => undefined,
      ),
    ).rejects.toThrow('Production runtime factories must be functions.');
  });

  it('embeds a self-contained runtime factory in the generated entry', () => {
    const source = generateProductionEntrySource('build-123');

    expect(source).toContain('Build ID: build-123');
    expect(source).toContain('export const createProductionRuntime =');
    expect(source).toContain('moduleLoader.loadMiddleware()');
    expect(source).not.toContain('ProductionRuntimeFactoryOptions');
  });
});
