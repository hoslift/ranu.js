import { describe, it, expect } from 'vitest';
import * as DevExports from '../src/index.js';

describe('@ranu/dev public API exports', () => {
  it('exports canonical development server interfaces and factories', () => {
    expect(DevExports.createDevServer).toBeDefined();
    expect(DevExports.startDevServer).toBeDefined();
    expect(DevExports.DevServer).toBeDefined();
    expect(DevExports.ProjectWatcher).toBeDefined();
    expect(DevExports.RebuildCoordinator).toBeDefined();
    expect(DevExports.DevReloadChannel).toBeDefined();
    expect(DevExports.DEV_CLIENT_SCRIPT).toBeDefined();
    expect(DevExports.serveStaticFile).toBeDefined();
    expect(DevExports.getMimeType).toBeDefined();
  });
});
