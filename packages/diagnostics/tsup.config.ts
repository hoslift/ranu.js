import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    overlay: 'src/overlay.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.build.json',
});
