import { describe, it, expect } from 'vitest';
import {
  validateClientSourceEnv,
  buildPublicEnvDefines,
} from '../src/env/env-validator.js';

describe('env-validator', () => {
  it('bails out fast if file contains neither process nor import.meta', () => {
    const code = `
export function PureComponent() {
  const message = 'Hello World';
  return <div>{message}</div>;
}
`;
    const diags = validateClientSourceEnv('app/PureComponent.tsx', code);
    expect(diags).toHaveLength(0);
  });

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

  it('rejects destructuring private environment variables from process.env', () => {
    const code = `
      "use client";
      export function UserProfile() {
        const { STRIPE_SECRET_KEY, RANU_PUBLIC_TOKEN, NODE_ENV } = process.env;
        return <div>{RANU_PUBLIC_TOKEN}</div>;
      }
    `;
    const diags = validateClientSourceEnv('app/UserProfile.tsx', code);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(diags[0]?.message).toContain('process.env.STRIPE_SECRET_KEY');
  });

  it('rejects destructuring with aliases, string literals, and rest patterns', () => {
    const code = `
      "use client";
      export function Leaky() {
        const { 'DATABASE_URL': db, SECRET: secretAlias, ...rest } = process.env;
        return null;
      }
    `;
    const diags = validateClientSourceEnv('app/Leaky.tsx', code);
    expect(diags).toHaveLength(3);
    expect(diags.every(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
  });

  it('rejects direct references and spreading of process.env', () => {
    const code = `
      "use client";
      export function LeakyComp() {
        console.log(process.env);
        const allEnv = { ...process.env };
        return <div>leaked</div>;
      }
    `;
    const diags = validateClientSourceEnv('app/LeakyComp.tsx', code);
    expect(diags).toHaveLength(2);
    expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    expect(diags[1]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
  });

  // --- Bracket notation tests on process['env'] ---
  describe('bracket notation process["env"]', () => {
    it('rejects bracket notation process["env"]["SECRET"]', () => {
      const code = `
export function BracketComp() {
  const secret1 = process["env"]["SECRET"];
  const secret2 = process['env']['DB_PASSWORD'];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/BracketComp.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
      expect(diags[1]?.message).toContain('DB_PASSWORD');
    });

    it('rejects bracket notation process["env"].SECRET', () => {
      const code = `
export function BracketDotComp() {
  const secret = process["env"].DATABASE_URL;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/BracketDotComp.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('DATABASE_URL');
    });

    it('rejects template literal bracket notation process[`env`][`SECRET`]', () => {
      const code = `
export function TemplateBracketComp() {
  const secret = process[\`env\`][\`SECRET_KEY\`];
  const secret2 = process[\`env\`].AUTH_SECRET;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/TemplateBracketComp.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET_KEY');
      expect(diags[1]?.message).toContain('AUTH_SECRET');
    });

    it('allows bracket notation process["env"]["RANU_PUBLIC_VAR"] and process["env"].RANU_PUBLIC_VAR', () => {
      const code = `
export function SafeBracket() {
  const pub1 = process["env"]["RANU_PUBLIC_API"];
  const pub2 = process['env'].RANU_PUBLIC_SITE_NAME;
  const envMode1 = process["env"]["NODE_ENV"];
  const envMode2 = process['env'].NODE_ENV;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/SafeBracket.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });

  // --- import.meta.env access tests ---
  describe('import.meta.env accesses', () => {
    it('rejects import.meta.env.PRIVATE_SECRET', () => {
      const code = `
export function MetaSecret() {
  const key = import.meta.env.STRIPE_SECRET;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaSecret.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('import.meta.env.STRIPE_SECRET');
    });

    it('rejects import.meta.env["PRIVATE_SECRET"]', () => {
      const code = `
export function MetaIndexed() {
  const secret = import.meta.env['AWS_SECRET_KEY'];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaIndexed.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('AWS_SECRET_KEY');
    });

    it('rejects import.meta["env"]["PRIVATE_SECRET"] and import.meta["env"].PRIVATE_SECRET', () => {
      const code = `
export function DoubleBracketMeta() {
  const sec1 = import.meta["env"]["DATABASE_TOKEN"];
  const sec2 = import.meta['env'].REDIS_PASSWORD;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DoubleBracketMeta.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('DATABASE_TOKEN');
      expect(diags[1]?.message).toContain('REDIS_PASSWORD');
    });

    it('allows import.meta.env.RANU_PUBLIC_SITE_NAME and NODE_ENV', () => {
      const code = `
export function SafeMeta() {
  const title = import.meta.env.RANU_PUBLIC_SITE_NAME;
  const api = import.meta['env']['RANU_PUBLIC_API_URL'];
  const mode1 = import.meta.env.NODE_ENV;
  const mode2 = import.meta['env']['NODE_ENV'];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/SafeMeta.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });

  // --- Destructuring variations ---
  describe('destructuring variations', () => {
    it('rejects destructuring from process["env"]', () => {
      const code = `
export function DestructBracket() {
  const { DB_PASS, RANU_PUBLIC_URL } = process["env"];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DestructBracket.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('DB_PASS');
    });

    it('rejects destructuring from import.meta.env', () => {
      const code = `
export function DestructMeta() {
  const { SECRET, RANU_PUBLIC_THEME } = import.meta.env;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DestructMeta.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
    });

    it('rejects destructuring from import.meta["env"]', () => {
      const code = `
export function DestructMetaBracket() {
  const { API_KEY } = import.meta['env'];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DestructMetaBracket.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('API_KEY');
    });

    it('rejects destructured assignment ({ SECRET } = process.env)', () => {
      const code = `
export function DestructAssign() {
  let SECRET: string;
  let RANU_PUBLIC_VAR: string;
  ({ SECRET, RANU_PUBLIC_VAR } = process.env);
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DestructAssign.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
    });

    it('rejects nested destructuring const { env: { SECRET } } = process', () => {
      const code = `
export function NestedDestruct() {
  const { env: { SECRET, RANU_PUBLIC_OK } } = process;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/NestedDestruct.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
    });

    it('rejects computed property destructuring const { [KEY]: secret } = process.env', () => {
      const code = `
const KEY = 'DATABASE_URL';
export function ComputedDestruct() {
  const { [KEY]: secret } = process.env;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/ComputedDestruct.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('Computed property destructuring');
    });
  });

  // --- Aliased variable pointers ---
  describe('aliased variable pointers', () => {
    it('rejects access via aliased env pointer: const myEnv = process.env; myEnv.SECRET', () => {
      const code = `
export function AliasedEnv() {
  const myEnv = process.env;
  const secret = myEnv.DATABASE_PASSWORD;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/AliasedEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('DATABASE_PASSWORD'))).toBe(true);
      expect(diags.every(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('rejects access via aliased process pointer: const p = process; p.env.SECRET', () => {
      const code = `
export function AliasedProcess() {
  const p = process;
  const secret = p.env.PRIVATE_API_TOKEN;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/AliasedProcess.tsx', code);
      expect(diags.length).toBe(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('PRIVATE_API_TOKEN');
    });

    it('rejects access via destructured env alias: const { env } = process; env.SECRET', () => {
      const code = `
export function DestructuredAlias() {
  const { env } = process;
  const secret = env.SECRET_KEY;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DestructuredAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET_KEY'))).toBe(true);
      expect(diags.every(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('rejects globalThis and window process alias access', () => {
      const code = `
export function GlobalProcess() {
  const s1 = globalThis.process.env.SECRET_1;
  const s2 = window.process.env.SECRET_2;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/GlobalProcess.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.message).toContain('SECRET_1');
      expect(diags[1]?.message).toContain('SECRET_2');
    });
  });

  // --- Full object access and spread ---
  describe('full object references and spread', () => {
    it('rejects full import.meta.env object access and spread', () => {
      const code = `
export function MetaFull() {
  console.log(import.meta.env);
  const copy = { ...import.meta.env };
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaFull.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('import.meta.env');
      expect(diags[1]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    });

    it('rejects full process["env"] object access and spread', () => {
      const code = `
export function BracketFull() {
  console.log(process['env']);
  const copy = { ...process['env'] };
  return null;
}
`;
      const diags = validateClientSourceEnv('app/BracketFull.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[1]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
    });
  });

  // --- Dynamic bracket access ---
  describe('dynamic bracket accesses', () => {
    it('rejects dynamic bracket access process.env[dynamicKey]', () => {
      const code = `
export function DynamicKey(props: { keyName: string }) {
  const val = process.env[props.keyName];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DynamicKey.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('Dynamic bracket-notation access');
    });

    it('rejects dynamic bracket access import.meta.env[dynamicKey]', () => {
      const code = `
export function DynamicMetaKey(props: { keyName: string }) {
  const val = import.meta.env[props.keyName];
  return null;
}
`;
      const diags = validateClientSourceEnv('app/DynamicMetaKey.tsx', code);
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('Dynamic bracket-notation access');
    });
  });

  // --- Computed property destructuring on process and import.meta ---
  describe('computed property destructuring on process and import.meta', () => {
    it('rejects nested computed destructuring const { [\'env\']: { SECRET } } = process', () => {
      const code = `
export function Comp() {
  const { ['env']: { SECRET } } = process;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/Comp.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
    });

    it('rejects computed alias destructuring const { [\'env\']: myEnv } = process; myEnv.SECRET', () => {
      const code = `
export function CompAlias() {
  const { ['env']: myEnv } = process;
  const s = myEnv.DATABASE_PASSWORD;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/CompAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('DATABASE_PASSWORD'))).toBe(true);
    });

    it('rejects computed destructuring assignment ({ [\'env\']: { SECRET } } = process)', () => {
      const code = `
export function CompAssign() {
  let SECRET: string;
  ({ ['env']: { SECRET } } = process as any);
  return null;
}
`;
      const diags = validateClientSourceEnv('app/CompAssign.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('SECRET');
    });

    it('allows computed destructuring of whitelisted variables from process', () => {
      const code = `
export function SafeComp() {
  const { ['env']: { RANU_PUBLIC_API, NODE_ENV } } = process;
  const { ['env']: myEnv } = process;
  const pub = myEnv.RANU_PUBLIC_SITE;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/SafeComp.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('rejects computed destructuring from import.meta', () => {
      const code = `
export function MetaComp() {
  const { ['env']: { STRIPE_KEY } } = import.meta;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaComp.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('STRIPE_KEY');
    });
  });

  // --- Parameter default initializers and array destructuring aliases ---
  describe('parameter default initializers and array destructuring aliases', () => {
    it('rejects function parameter default process alias: function f(p = process) { return p.env.SECRET; }', () => {
      const code = `
export function getDb(p = process) {
  return p.env.DB_CREDENTIALS;
}
`;
      const diags = validateClientSourceEnv('app/ParamProcess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('DB_CREDENTIALS'))).toBe(true);
    });

    it('rejects arrow function parameter default process alias: (p = process) => p.env.SECRET', () => {
      const code = `
export const getSecret = (p = process) => p.env.AWS_SECRET;
`;
      const diags = validateClientSourceEnv('app/ArrowParam.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('AWS_SECRET'))).toBe(true);
    });

    it('rejects array destructuring process alias: const [p] = [process]; p.env.SECRET', () => {
      const code = `
export function ArrayProcess() {
  const [p] = [process];
  return p.env.PRIVATE_KEY;
}
`;
      const diags = validateClientSourceEnv('app/ArrayProcess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('PRIVATE_KEY'))).toBe(true);
    });

    it('allows parameter default and array destructuring accessing whitelisted variables', () => {
      const code = `
export function safeParam(p = process) {
  return p.env.RANU_PUBLIC_API;
}
export function safeArray() {
  const [p] = [process];
  return p.env.NODE_ENV;
}
`;
      const diags = validateClientSourceEnv('app/SafeParam.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });

  // --- import.meta destructuring and aliasing ---
  describe('import.meta destructuring and aliasing', () => {
    it('rejects const { env } = import.meta; env.SECRET', () => {
      const code = `
export function MetaDestruct() {
  const { env } = import.meta;
  const s = env.SECRET_HASH;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET_HASH') || d.message.includes('env'))).toBe(true);
    });

    it('rejects const { env: { SECRET } } = import.meta', () => {
      const code = `
export function MetaNested() {
  const { env: { API_SECRET } } = import.meta;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaNested.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('API_SECRET');
    });

    it('rejects aliased import.meta pointer: const m = import.meta; m.env.SECRET', () => {
      const code = `
export function MetaAlias() {
  const m = import.meta;
  const s = m.env.INTERNAL_TOKEN;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/MetaAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_PRIVATE_ENV_CLIENT');
      expect(diags[0]?.message).toContain('INTERNAL_TOKEN');
    });

    it('allows safe import.meta destructuring and aliasing for whitelisted variables', () => {
      const code = `
export function SafeMetaDestruct() {
  const { env } = import.meta;
  const url = env.RANU_PUBLIC_API_URL;
  const m = import.meta;
  const mode = m.env.NODE_ENV;
  return null;
}
`;
      const diags = validateClientSourceEnv('app/SafeMetaDestruct.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });
});
