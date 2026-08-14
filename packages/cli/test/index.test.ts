import { describe, it, expect } from 'vitest';
import { CLI_VERSION } from '../src/index.js';

describe('@ranu/cli', () => {
  it('exports CLI_VERSION', () => {
    expect(CLI_VERSION).toBe('0.0.0');
  });
});
