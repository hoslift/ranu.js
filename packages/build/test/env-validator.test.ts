import { describe, it, expect } from 'vitest';
import {
  validateClientSourceEnv,
  buildPublicEnvDefines,
} from '../src/env/env-validator.js';

describe('env-validator', () => {
  it('allows access to RANU_PUBLIC_ prefixed environment variables', () => {
    const code = `
export function Widget() {
  const url = process.env.RANU_PUBLIC_API_URL;
  const site = import.meta.env.RANU_PUBLIC_SITE_NAME;
  const mode = process.env.NODE_ENV;
  return null;
}
`;
    const diags = validateClientSourceEnv('app/Widget.tsx', code);
    expect(diags).toHaveLength(0);
  });

  it('rejects access to private environment variables in client code', () => {
    const code = `
export function BadComponent() {
  const secret = process.env.DATABASE_URL;
  const key = process.env.API_SECRET_KEY;
  return null;
}
`;
    const diags = validateClientSourceEnv('app/Bad.tsx', code);
    expect(diags.length).toBe(2);
    expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(diags[0]?.message).toContain('process.env.DATABASE_URL');
    expect(diags[1]?.message).toContain('process.env.API_SECRET_KEY');
  });

  it('rejects element access to private environment variables in client code', () => {
    const code = `
export function DynamicEnv() {
  const secret = process.env['SECRET_TOKEN'];
  return null;
}
`;
    const diags = validateClientSourceEnv('app/Dynamic.tsx', code);
    expect(diags.length).toBe(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(diags[0]?.message).toContain('SECRET_TOKEN');
  });

  it('builds valid esbuild define mappings for RANU_PUBLIC_* variables', () => {
    const publicEnv = {
      RANU_PUBLIC_API_URL: 'https://api.ranu.dev',
      RANU_PUBLIC_APP_NAME: 'My Ranu App',
    };

    const defines = buildPublicEnvDefines(publicEnv);
    expect(defines['process.env.RANU_PUBLIC_API_URL']).toBe(JSON.stringify('https://api.ranu.dev'));
    expect(defines['import.meta.env.RANU_PUBLIC_API_URL']).toBe(JSON.stringify('https://api.ranu.dev'));
    expect(defines['process.env.RANU_PUBLIC_APP_NAME']).toBe(JSON.stringify('My Ranu App'));
    expect(defines['process.env.NODE_ENV']).toBe(JSON.stringify('production'));
  });
});
