import { describe, expect, it, vi } from 'vitest';
import {
  createProductionRuntimeWithLoader,
  generateProductionEntrySource,
} from '../src/output/production-entry.js';

describe('production entry generation', () => {
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
