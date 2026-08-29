import { describe, it, expect } from 'vitest';
import * as ReactPkg from '../src/index.js';

describe('@ranu/react Package Exports', () => {
  it('exports ReactRenderer and createReactRenderer', () => {
    expect(ReactPkg.ReactRenderer).toBeDefined();
    expect(typeof ReactPkg.createReactRenderer).toBe('function');
  });

  it('exports module loader and validator functions', () => {
    expect(typeof ReactPkg.createDefaultModuleLoader).toBe('function');
    expect(typeof ReactPkg.isPageModule).toBe('function');
    expect(typeof ReactPkg.isLayoutModule).toBe('function');
    expect(typeof ReactPkg.isLoadingModule).toBe('function');
    expect(typeof ReactPkg.isErrorModule).toBe('function');
    expect(typeof ReactPkg.isNotFoundModule).toBe('function');
  });

  it('exports metadata resolution and sanitization utilities', () => {
    expect(typeof ReactPkg.mergeMetadata).toBe('function');
    expect(typeof ReactPkg.resolveHierarchyMetadata).toBe('function');
    expect(typeof ReactPkg.escapeHtml).toBe('function');
    expect(typeof ReactPkg.sanitizeRenderError).toBe('function');
  });

  it('exports composition and streaming helpers', () => {
    expect(typeof ReactPkg.composeComponentTree).toBe('function');
    expect(typeof ReactPkg.composeNotFoundTree).toBe('function');
    expect(typeof ReactPkg.composeErrorDocument).toBe('function');
    expect(typeof ReactPkg.renderReactToStream).toBe('function');
  });
});
