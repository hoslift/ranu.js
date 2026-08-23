import { describe, it, expect } from 'vitest';
import {
  transformCssModule,
  generateScopedClassName,
} from '../src/assets/css-modules.js';

describe('CSS Modules Scoping and Transformation', () => {
  const projectRoot = '/test/project';

  it('generates deterministic scoped class names with [name]_[local]__[hash:base64:5]', () => {
    const filePath = '/test/project/app/components/Button.module.css';
    const content = '.primary { color: red; }';

    const scoped1 = generateScopedClassName(filePath, 'primary', content, projectRoot);
    const scoped2 = generateScopedClassName(filePath, 'primary', content, projectRoot);

    expect(scoped1).toBe(scoped2);
    expect(scoped1).toMatch(/^Button_primary__[a-zA-Z0-9_-]{5}$/);
    expect(scoped1.length).toBe('Button_primary__'.length + 5);
  });

  it('produces different hashes for different files or content', () => {
    const fileA = '/test/project/app/components/Button.module.css';
    const fileB = '/test/project/app/components/Card.module.css';
    const content = '.primary { color: blue; }';

    const scopedA = generateScopedClassName(fileA, 'primary', content, projectRoot);
    const scopedB = generateScopedClassName(fileB, 'primary', content, projectRoot);

    expect(scopedA).not.toBe(scopedB);
    expect(scopedA).toContain('Button_primary__');
    expect(scopedB).toContain('Card_primary__');
  });

  it('transforms class selectors and produces valid mapping', () => {
    const filePath = '/test/project/app/Button.module.css';
    const content = `
      .root {
        display: flex;
      }
      .primary:hover {
        background-color: blue;
      }
      .btn-large {
        font-size: 20px;
      }
    `;

    const result = transformCssModule(filePath, content, projectRoot);

    expect(result.mapping.root).toBeDefined();
    expect(result.mapping.primary).toBeDefined();
    expect(result.mapping['btn-large']).toBeDefined();

    expect(result.code).toContain(`.${result.mapping.root}`);
    expect(result.code).toContain(`.${result.mapping.primary}:hover`);
    expect(result.code).toContain(`.${result.mapping['btn-large']}`);
  });

  it('preserves :global(...) selectors un-scoped', () => {
    const filePath = '/test/project/app/Card.module.css';
    const content = `
      .card :global(.title) {
        font-weight: bold;
      }
      :global(.global-btn) {
        padding: 8px;
      }
    `;

    const result = transformCssModule(filePath, content, projectRoot);

    expect(result.mapping.card).toBeDefined();
    expect(result.mapping.title).toBeUndefined();
    expect(result.mapping['global-btn']).toBeUndefined();

    expect(result.code).toContain(`.${result.mapping.card} .title`);
    expect(result.code).toContain('.global-btn');
  });

  it('scopes @keyframes and updates animation properties', () => {
    const filePath = '/test/project/app/Spinner.module.css';
    const content = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinner {
        animation: spin 1s linear infinite;
      }
    `;

    const result = transformCssModule(filePath, content, projectRoot);

    expect(result.mapping.spinner).toBeDefined();
    expect(result.code).toMatch(/@keyframes Spinner_spin__[a-zA-Z0-9_-]{5}/);
    expect(result.code).toMatch(/animation:\s*Spinner_spin__[a-zA-Z0-9_-]{5}\s+1s/);
  });
});
