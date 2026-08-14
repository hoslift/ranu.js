import { describe, it, expect } from 'vitest';
import { RANU_VERSION, DEFAULT_OUT_DIR } from '../src/index.js';
import type { RanuMode, RanuCommand, RouteKind, RenderMode, FrameworkCapabilities } from '../src/index.js';

describe('@ranu/core', () => {
  it('exports RANU_VERSION and DEFAULT_OUT_DIR', () => {
    expect(RANU_VERSION).toBe('0.0.0');
    expect(DEFAULT_OUT_DIR).toBe('.ranu');
  });

  it('declares type contracts properly', () => {
    const mode: RanuMode = 'production';
    const command: RanuCommand = 'build';
    const routeKind: RouteKind = 'page';
    const renderMode: RenderMode = 'static';

    const capabilities: FrameworkCapabilities = {
      streaming: true,
      middleware: false,
      nodejsBuiltins: true,
    };

    expect(mode).toBe('production');
    expect(command).toBe('build');
    expect(routeKind).toBe('page');
    expect(renderMode).toBe('static');
    expect(capabilities.streaming).toBe(true);
  });
});
