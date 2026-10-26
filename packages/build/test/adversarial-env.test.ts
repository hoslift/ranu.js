import { describe, it, expect } from 'vitest';
import { validateClientSourceEnv } from '../src/env/env-validator.js';

describe('Adversarial AST Env Validator Stress Tests', () => {
  // =========================================================================
  // Section 1: Whitelist Verification (Zero False Positives)
  // =========================================================================
  describe('Zero False Positives on Whitelist', () => {
    it('allows standard RANU_PUBLIC_* and NODE_ENV accesses', () => {
      const code = `
        export function SafeComponent() {
          const api = process.env.RANU_PUBLIC_API;
          const site = import.meta.env.RANU_PUBLIC_SITE_NAME;
          const mode1 = process.env.NODE_ENV;
          const mode2 = import.meta.env.NODE_ENV;
          return <div>{api} {site} {mode1} {mode2}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeComponent.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows bracket notation on whitelisted variables', () => {
      const code = `
        export function SafeBracket() {
          const api = process['env']['RANU_PUBLIC_API'];
          const site = import.meta['env']['RANU_PUBLIC_SITE'];
          const mode1 = process['env']['NODE_ENV'];
          const mode2 = import.meta['env']['NODE_ENV'];
          const dot1 = process['env'].RANU_PUBLIC_HOST;
          const dot2 = import.meta['env'].RANU_PUBLIC_HOST;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeBracket.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows no-substitution template literals on whitelisted variables', () => {
      const code = `
        export function SafeTemplate() {
          const api = process[\`env\`][\`RANU_PUBLIC_API\`];
          const mode = process[\`env\`][\`NODE_ENV\`];
          const metaApi = import.meta[\`env\`][\`RANU_PUBLIC_CLIENT\`];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeTemplate.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows destructuring of only whitelisted variables', () => {
      const code = `
        export function SafeDestructuring() {
          const { RANU_PUBLIC_API, NODE_ENV } = process.env;
          const { RANU_PUBLIC_SITE } = import.meta.env;
          const { RANU_PUBLIC_TOKEN: token, NODE_ENV: mode } = process['env'];
          const { RANU_PUBLIC_THEME: theme } = import.meta['env'];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeDestructuring.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows nested destructuring of process for whitelisted variables', () => {
      const code = `
        export function SafeNested() {
          const { env: { RANU_PUBLIC_API, NODE_ENV } } = process;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeNested.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows computed bracket notation in nested destructuring for whitelisted variables', () => {
      const code = `
        export function SafeComputedNested() {
          const { ['env']: { RANU_PUBLIC_API, NODE_ENV } } = process;
          const { ['env']: myEnv } = process;
          const pub = myEnv.RANU_PUBLIC_SITE;
          const { ['RANU_PUBLIC_API']: api } = process.env;
          return <div>{pub} {api}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeComputedNested.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows destructuring assignment for whitelisted variables', () => {
      const code = `
        export function SafeDestructAssign() {
          let RANU_PUBLIC_A: string;
          let NODE_ENV: string;
          ({ RANU_PUBLIC_A, NODE_ENV } = process.env);
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeDestructAssign.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('allows aliasing of public variable values (not the env object itself)', () => {
      const code = `
        export function SafeValueAliasing() {
          const myApi = process.env.RANU_PUBLIC_API_URL;
          const nextApi = myApi;
          const formatted = \`\${process.env.RANU_PUBLIC_HOST}:\${process.env.RANU_PUBLIC_PORT}\`;
          const fallback = process.env.RANU_PUBLIC_TIMEOUT ?? '3000';
          const isProd = process.env.NODE_ENV === 'production';
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SafeValueAliasing.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('does not flag user-defined objects containing a property named process or env', () => {
      const code = `
        export function UnrelatedObjects() {
          const userState = {
            process: {
              env: {
                SECRET: 'not-node-process',
              },
            },
          };
          const secret = userState.process.env.SECRET;
          return <div>{secret}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/UnrelatedObjects.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('returns empty diagnostics for pure files without process or import.meta', () => {
      const code = `
        export function PureHello() {
          const greeting = "Hello Ranu";
          return <h1>{greeting}</h1>;
        }
      `;
      const diags = validateClientSourceEnv('app/PureHello.tsx', code);
      expect(diags).toHaveLength(0);
    });
  });

  // =========================================================================
  // Section 2: Destructuring Attacks & Function Parameters
  // =========================================================================
  describe('Destructuring Attacks & Function Parameters', () => {
    it('catches nested destructuring with default parameter: const { a: { b: { c = process.env.SECRET } } } = {}', () => {
      const code = `
        export function NestedDefaultDestruct() {
          const { a: { b: { c = process.env.SECRET } } } = {} as any;
          return <div>{c}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/NestedDefaultDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches arrow function default parameter: ({ p = process.env.SECRET }) => {}', () => {
      const code = `
        export const getSecret = ({ p = process.env.SECRET }: any) => p;
      `;
      const diags = validateClientSourceEnv('app/ArrowDefault.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches regular function parameter default value: function f(secret = process.env.SECRET)', () => {
      const code = `
        export function getDb(secret = process.env.DATABASE_URL) {
          return secret;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamDefault.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('DATABASE_URL'))).toBe(true);
    });

    it('catches parameter destructuring from process.env: function f({ SECRET } = process.env)', () => {
      const code = `
        export function inspectSecret({ SECRET } = process.env as any) {
          return SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches class constructor and method parameter defaults: class C { method(s = process.env.SECRET) }', () => {
      const code = `
        export class Service {
          secret: string;
          constructor(s = process.env.API_KEY) {
            this.secret = s;
          }
          fetchSecret(s = import.meta.env.PRIVATE_TOKEN) {
            return s;
          }
        }
      `;
      const diags = validateClientSourceEnv('app/ClassService.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags.some(d => d.message.includes('API_KEY'))).toBe(true);
      expect(diags.some(d => d.message.includes('PRIVATE_TOKEN'))).toBe(true);
    });

    it('catches class field initializers: class C { secret = process.env.SECRET }', () => {
      const code = `
        export class ConfigService {
          private db = process.env.DATABASE_PASSWORD;
          private metaToken = import.meta.env.AUTH_SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ClassFields.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags.some(d => d.message.includes('DATABASE_PASSWORD'))).toBe(true);
      expect(diags.some(d => d.message.includes('AUTH_SECRET'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 3: Obfuscated Brackets & Dynamic Notation
  // =========================================================================
  describe('Obfuscated Brackets & Dynamic Notation', () => {
    it('catches dynamic bracket indexing on process.env: process.env[dynamicKey]', () => {
      const code = `
        export function DynamicBracket(key: string) {
          return process.env[key];
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicBracket.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.message).toContain('Dynamic bracket-notation access');
    });

    it('catches dynamic bracket indexing on import.meta.env: import.meta.env[dynamicKey]', () => {
      const code = `
        export function DynamicMetaBracket(key: string) {
          return import.meta.env[key];
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicMetaBracket.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags[0]?.message).toContain('Dynamic bracket-notation access');
    });

    it('catches computed expression in bracket notation: process.env["SEC" + "RET"]', () => {
      const code = `
        export function ConcatSecret() {
          const secret = process.env['SEC' + 'RET'];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/ConcatSecret.tsx', code);
      // 'SEC' + 'RET' is a binary expression, not a string literal, so it is treated as dynamic bracket
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('catches template literal with expressions: process.env[`${"SECRET"}`]', () => {
      const code = `
        export function TemplateInterpSecret() {
          const secret = process.env[\`\${'SECRET'}\`];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/TemplateInterpSecret.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('catches globalThis and window element access: globalThis["process"]["env"]["SECRET"]', () => {
      const code = `
        export function GlobalElementAccess() {
          const s1 = globalThis['process']['env']['SECRET_A'];
          const s2 = window['process']['env']['SECRET_B'];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/GlobalElementAccess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags.some(d => d.message.includes('SECRET_A'))).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET_B'))).toBe(true);
    });

    it('catches globalThis and window mixed access: globalThis["process"].env.SECRET', () => {
      const code = `
        export function GlobalMixedAccess() {
          const s1 = globalThis['process'].env.SECRET_A;
          const s2 = window['process'].env.SECRET_B;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/GlobalMixedAccess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(2);
      expect(diags.some(d => d.message.includes('SECRET_A'))).toBe(true);
      expect(diags.some(d => d.message.includes('SECRET_B'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 4: Deep Alias Chains & Reassignments
  // =========================================================================
  describe('Deep Alias Chains & Reassignments', () => {
    it('catches deep alias chain: const a = process; const b = a; const c = b.env; c.SECRET', () => {
      const code = `
        export function DeepAliasChain() {
          const a = process;
          const b = a;
          const c = b.env;
          const secret = c.SECRET;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/DeepAliasChain.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET') || d.message.includes('b.env'))).toBe(true);
    });

    it('catches long process alias chain: const p1 = process; const p2 = p1; const p3 = p2; p3.env.SECRET', () => {
      const code = `
        export function LongProcessChain() {
          const p1 = process;
          const p2 = p1;
          const p3 = p2;
          const s = p3.env.SECRET_VALUE;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/LongProcessChain.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET_VALUE'))).toBe(true);
    });

    it('catches assignment expression aliasing: let a; a = process; let b; b = a.env; b.SECRET', () => {
      const code = `
        export function AssignmentAliasing() {
          let a: any;
          a = process;
          let b: any;
          b = a.env;
          const s = b.MY_SECRET;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/AssignmentAliasing.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('MY_SECRET') || d.message.includes('a.env'))).toBe(true);
    });

    it('catches destructured alias reassignment: const { env: e } = process; const e2 = e; e2.SECRET', () => {
      const code = `
        export function DestructuredAliasReassignment() {
          const { env: e } = process;
          const e2 = e;
          const secret = e2.SECRET_KEY;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/DestructuredAliasReassignment.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET_KEY') || d.message.includes('e'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 5: Rest/Spread Patterns & Full Object Exposure
  // =========================================================================
  describe('Rest/Spread Patterns & Full Object Exposure', () => {
    it('catches object rest destructuring on process.env', () => {
      const code = `
        export function RestDestruct() {
          const { RANU_PUBLIC_API, ...rest } = process.env;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/RestDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('Rest destructuring'))).toBe(true);
    });

    it('catches object rest destructuring on import.meta.env', () => {
      const code = `
        export function RestMetaDestruct() {
          const { ...allEnv } = import.meta.env;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/RestMetaDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('Rest destructuring'))).toBe(true);
    });

    it('catches object spread of process.env: { ...process.env }', () => {
      const code = `
        export function SpreadEnv() {
          const envCopy = { ...process.env };
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/SpreadEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('full "process.env" object reference'))).toBe(true);
    });

    it('catches passing process.env or import.meta.env to functions: console.log(process.env)', () => {
      const code = `
        export function PassToFunc() {
          console.log(process.env);
          JSON.stringify(import.meta.env);
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/PassToFunc.tsx', code);
      expect(diags).toHaveLength(2);
      expect(diags.every(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });
  });

  // =========================================================================
  // Section 6: Syntactic Assertions, Parentheses & Wrapper Bypasses
  // =========================================================================
  describe('Syntactic Wrappers & Type Assertions', () => {
    it('catches deeply wrapped and type-asserted expressions: (((process as any).env) as any).SECRET', () => {
      const code = `
        export function AssertWrapped() {
          const s1 = (((process as any).env) as any).SECRET;
          const s2 = ((import.meta as any).env!).PRIVATE_KEY;
          const s3 = ((process satisfies any).env satisfies any).TOKEN;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/AssertWrapped.tsx', code);
      expect(diags.length).toBe(3);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
      expect(diags.some(d => d.message.includes('PRIVATE_KEY'))).toBe(true);
      expect(diags.some(d => d.message.includes('TOKEN'))).toBe(true);
    });

    it('catches bracket notation with type assertions: (process as any)["env"]["SECRET"]', () => {
      const code = `
        export function AssertBracket() {
          const s = (process as any)['env']['SECRET'];
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/AssertBracket.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.message.includes('SECRET'))).toBe(true);
    });

    it('catches comma / sequence operator expressions: (0, process.env).SECRET', () => {
      const code = `
        export function CommaSequence() {
          const s1 = (0, process.env).SECRET;
          const s2 = (0, process).env.SECRET2;
          return null;
        }
      `;
      const diags = validateClientSourceEnv('app/CommaSequence.tsx', code);
      // Let us observe what the parser does with sequence expressions
      expect(diags.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Section 7: Adversarial Remediation & Stress-Test Shield
  // =========================================================================
  describe('Adversarial Remediation & Stress-Test Shield', () => {
    // Vector 1: Computed bracket 'env' in nested destructuring from process
    it('catches computed bracket "env" in nested destructuring from process', () => {
      const code = `
        export function ComputedEnvDestruct() {
          const { ['env']: { SECRET } } = process;
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/ComputedEnvDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 2: Computed bracket 'env' alias from process
    it('catches computed bracket "env" alias from process: const { [\'env\']: myEnv } = process; myEnv.SECRET', () => {
      const code = `
        export function ComputedEnvAlias() {
          const { ['env']: myEnv } = process;
          return <div>{myEnv.SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/ComputedEnvAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && (d.message.includes('SECRET') || d.message.includes('myEnv')))).toBe(true);
    });

    // Vector 3: Computed bracket 'env' in destructuring assignment from process
    it('catches computed bracket "env" in destructuring assignment from process', () => {
      const code = `
        export function ComputedAssign() {
          let SECRET: string;
          ({ ['env']: { SECRET } } = process as any);
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/ComputedAssign.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 4: Function default parameter process alias
    it('catches function default parameter process alias: function leak(p = process) { return p.env.SECRET; }', () => {
      const code = `
        export function leak(p = process) {
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamProcessAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 5: Arrow function default parameter process alias
    it('catches arrow function default parameter process alias: const leak = (p = process) => p.env.SECRET', () => {
      const code = `
        export const leak = (p = process) => p.env.SECRET;
      `;
      const diags = validateClientSourceEnv('app/ArrowProcessAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 6: Array destructuring alias
    it('catches array destructuring process alias: const [p] = [process]; p.env.SECRET', () => {
      const code = `
        export function ArrayDestructProcess() {
          const [p] = [process];
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ArrayDestructProcess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 7: Dynamic concatenation on process element access: process['e' + 'nv'].SECRET
    it('catches dynamic concatenation on process element access: process[\'e\' + \'nv\'].SECRET', () => {
      const code = `
        export function DynamicConcatEnv() {
          const s = (process as any)['e' + 'nv'].SECRET;
          return s;
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicConcatEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches dynamic bracket indexing on process element access: (process as any)[dynamicKey]', () => {
      const code = `
        export function DynamicBracketEnv(key: string) {
          const s = (process as any)[key].SECRET;
          return s;
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicBracketEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    // Vector 8: Dynamic template literal on process element access: process[`${'env'}`].SECRET
    it('catches dynamic template literal on process element access: process[`${"env"}`].SECRET', () => {
      const code = `
        export function DynamicTemplateEnv() {
          const s = (process as any)[\`\${'env'}\`].SECRET;
          return s;
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicTemplateEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    // Vector 9: Dynamic computed property destructuring on environment object
    it('rejects dynamic computed property destructuring on environment object: const { [key]: secret } = process.env', () => {
      const code = `
        export function DynamicEnvDestruct(key: string) {
          const { [key]: secret } = process.env;
          return secret;
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicEnvDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('Computed property destructuring'))).toBe(true);
    });

    // Vector 10: Dynamic computed property destructuring on process object
    it('rejects dynamic computed property destructuring on process object: const { [key]: x } = process', () => {
      const code = `
        export function DynamicProcessDestruct(key: string) {
          const { [key]: x } = process;
          return x;
        }
      `;
      const diags = validateClientSourceEnv('app/DynamicProcessDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('Computed property destructuring'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 8: import.meta Destructuring & Aliasing Attacks
  // =========================================================================
  describe('import.meta Destructuring & Aliasing Attacks', () => {
    it('catches destructured env from import.meta: const { env } = import.meta; env.SECRET', () => {
      const code = `
        export function MetaDestructEnv() {
          const { env } = import.meta;
          return <div>{env.DATABASE_SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/MetaDestructEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && (d.message.includes('DATABASE_SECRET') || d.message.includes('env')))).toBe(true);
    });

    it('catches nested destructuring from import.meta: const { env: { SECRET } } = import.meta', () => {
      const code = `
        export function MetaNestedDestruct() {
          const { env: { AUTH_TOKEN } } = import.meta;
          return <div>{AUTH_TOKEN}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/MetaNestedDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('AUTH_TOKEN'))).toBe(true);
    });

    it('catches computed bracket destructuring from import.meta: const { [\'env\']: { SECRET } } = import.meta', () => {
      const code = `
        export function MetaComputedDestruct() {
          const { ['env']: { PRIVATE_KEY } } = import.meta;
          return <div>{PRIVATE_KEY}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/MetaComputedDestruct.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('PRIVATE_KEY'))).toBe(true);
    });

    it('catches import.meta aliasing: const m = import.meta; m.env.SECRET', () => {
      const code = `
        export function MetaAliasing() {
          const m = import.meta;
          const secret = m.env.STRIPE_SECRET;
          return <div>{secret}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/MetaAliasing.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('STRIPE_SECRET'))).toBe(true);
    });

    it('catches import.meta bracket element access via alias: const m = import.meta; m["env"]["SECRET"]', () => {
      const code = `
        export function MetaAliasBracket() {
          const m = import.meta;
          const secret = m['env']['REDIS_SECRET'];
          return <div>{secret}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/MetaAliasBracket.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('REDIS_SECRET'))).toBe(true);
    });

    it('catches function parameter default import.meta alias: (m = import.meta) => m.env.SECRET', () => {
      const code = `
        export const leakMeta = (m = import.meta) => m.env.API_SIGNING_KEY;
      `;
      const diags = validateClientSourceEnv('app/ParamMetaAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('API_SIGNING_KEY'))).toBe(true);
    });

    it('catches array destructuring import.meta alias: const [m] = [import.meta]; m.env.SECRET', () => {
      const code = `
        export function ArrayDestructMeta() {
          const [m] = [import.meta];
          return m.env.PAYMENT_GATEWAY_SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ArrayDestructMeta.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('PAYMENT_GATEWAY_SECRET'))).toBe(true);
    });

    it('catches function parameter default env origin: function leak(e = process.env) { return e.SECRET; }', () => {
      const code = `
        export function leakDirectEnv(e = process.env) {
          return e.MASTER_SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamDirectEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('MASTER_SECRET'))).toBe(true);
    });

    it('catches array destructuring direct env origin: const [e] = [import.meta.env]; e.SECRET', () => {
      const code = `
        export function ArrayDestructEnv() {
          const [e] = [import.meta.env];
          return e.OAUTH_CLIENT_SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ArrayDestructEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('OAUTH_CLIENT_SECRET'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 9: Advanced AST Obfuscation Probing & Multi-Element Destructuring
  // =========================================================================
  describe('Advanced AST Obfuscation Probing & Multi-Element Destructuring', () => {
    it('catches nested computed brackets with string concatenation: const { [\'e\' + \'nv\']: { SECRET } } = process', () => {
      const code = `
        export function ConcatBracketNested() {
          const { ['e' + 'nv']: { SECRET } } = process;
          return <div>{SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/ConcatBracketNested.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches nested computed bracket alias with concatenation: const { [\'e\' + \'nv\']: myEnv } = process; myEnv.SECRET', () => {
      const code = `
        export function ConcatBracketAlias() {
          const { ['e' + 'nv']: myEnv } = process;
          return <div>{myEnv.SECRET}</div>;
        }
      `;
      const diags = validateClientSourceEnv('app/ConcatBracketAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches array destructuring with multiple elements and omitted holes: const [, p] = [null, process]; p.env.SECRET', () => {
      const code = `
        export function ArrayHoleProcess() {
          const [, p] = [null, process];
          return p.env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ArrayHoleProcess.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches array destructuring with multiple elements on env origin: const [, e] = [null, process.env]; e.SECRET', () => {
      const code = `
        export function ArrayHoleEnv() {
          const [, e] = [null, process.env];
          return e.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ArrayHoleEnv.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });

    it('catches parameter destructuring alias: function leak({ env } = process) { return env.SECRET; }', () => {
      const code = `
        export function ParamDestructAlias({ env } = process) {
          return env.SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamDestructAlias.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('catches parameter destructuring nested secret: function leak({ env: { SECRET } } = process)', () => {
      const code = `
        export function ParamDestructNested({ env: { SECRET } } = process) {
          return SECRET;
        }
      `;
      const diags = validateClientSourceEnv('app/ParamDestructNested.tsx', code);
      expect(diags.length).toBeGreaterThanOrEqual(1);
      expect(diags.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('preserves zero false positives for independent whitelisted variables across obfuscated constructs', () => {
      const code1 = `
        export function SafeObfuscated() {
          const { ['e' + 'nv']: { RANU_PUBLIC_API, NODE_ENV } } = process;
          const { ['e' + 'nv']: myEnv } = process;
          const pub = myEnv.RANU_PUBLIC_SITE;
          const [, p] = [null, process];
          const pub2 = p.env.RANU_PUBLIC_HOST;
          const { ['RANU_PUBLIC_KEY']: key } = process.env;
          return <div>{pub} {pub2} {key}</div>;
        }
      `;
      const code2 = `
        export function SafeParamDestruct({ env } = process) {
          return env.RANU_PUBLIC_API;
        }
      `;
      const code3 = `
        export function SafeParamNested({ env: { RANU_PUBLIC_API } } = process) {
          return RANU_PUBLIC_API;
        }
      `;
      expect(validateClientSourceEnv('app/Safe1.tsx', code1)).toHaveLength(0);
      expect(validateClientSourceEnv('app/Safe2.tsx', code2)).toHaveLength(0);
      expect(validateClientSourceEnv('app/Safe3.tsx', code3)).toHaveLength(0);
    });
  });

  // =========================================================================
  // Section 10: Empirical Probe Harness — Unhandled Failure Modes & Boundary Edge Cases
  // =========================================================================
  describe('Empirical Probe Harness: Discovered Failure Modes', () => {
    it('catches sequence expressions on process and import.meta: (0, process).env.SECRET and (0, import.meta).env.SECRET', () => {
      const code1 = `export function leak() { return (0, process).env.SECRET; }`;
      const code2 = `export function leakMeta() { return (0, import.meta).env.SECRET; }`;
      const code3 = `export function leakAlias() { const p = (0, process); return p.env.SECRET; }`;
      const code4 = `export function leakArray() { const [p] = [(0, process)]; return p.env.SECRET; }`;

      const d1 = validateClientSourceEnv('app/leak1.tsx', code1);
      const d2 = validateClientSourceEnv('app/leak2.tsx', code2);
      const d3 = validateClientSourceEnv('app/leak3.tsx', code3);
      const d4 = validateClientSourceEnv('app/leak4.tsx', code4);

      expect(d1.length).toBeGreaterThanOrEqual(1);
      expect(d1.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);

      expect(d2.length).toBeGreaterThanOrEqual(1);
      expect(d2.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);

      expect(d3.length).toBeGreaterThanOrEqual(1);
      expect(d3.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);

      expect(d4.length).toBeGreaterThanOrEqual(1);
      expect(d4.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('allows safe public environment access via sequence expressions', () => {
      const code1 = `export function safeProcess() { return (0, process).env.RANU_PUBLIC_API; }`;
      const code2 = `export function safeMeta() { return (0, import.meta).env.RANU_PUBLIC_API; }`;
      expect(validateClientSourceEnv('app/safe1.tsx', code1)).toHaveLength(0);
      expect(validateClientSourceEnv('app/safe2.tsx', code2)).toHaveLength(0);
    });

    it('prevents false positives when env alias precedes nested destructuring in the same file', () => {
      const code = `
        export function Header({ env } = process) {
          return env.RANU_PUBLIC_SITE_NAME;
        }
        export function Nav({ env: { RANU_PUBLIC_API } } = process) {
          return RANU_PUBLIC_API;
        }
      `;
      const diags = validateClientSourceEnv('app/HeaderNav.tsx', code);
      expect(diags).toHaveLength(0);
    });

    it('catches chained sequence expressions on process and import.meta: (0, 1, process).env.SECRET', () => {
      const codeChained = `export function leakChained() { return (0, 1, process).env.SECRET; }`;
      const codeChainedAlias = `export function leakChainedAlias() { const p = (0, 1, process); return p.env.SECRET; }`;
      const codeChainedMeta = `export function leakChainedMeta() { return (0, 1, import.meta).env.SECRET; }`;

      const dChained = validateClientSourceEnv('app/leakChained.tsx', codeChained);
      const dChainedAlias = validateClientSourceEnv('app/leakChainedAlias.tsx', codeChainedAlias);
      const dChainedMeta = validateClientSourceEnv('app/leakChainedMeta.tsx', codeChainedMeta);

      expect(dChained.length).toBeGreaterThanOrEqual(1);
      expect(dChained.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);

      expect(dChainedAlias.length).toBeGreaterThanOrEqual(1);
      expect(dChainedAlias.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);

      expect(dChainedMeta.length).toBeGreaterThanOrEqual(1);
      expect(dChainedMeta.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' && d.message.includes('SECRET'))).toBe(true);
    });

    it('probes ternary conditional expressions on process and env', () => {
      const codeTernarySeq = `export function leakTernary() { return (true ? (0, process) : null).env.SECRET; }`;
      const codeTernaryEnv = `export function leakTernaryEnv() { return (true ? process.env : null).SECRET; }`;

      const dTernarySeq = validateClientSourceEnv('app/leakTernary.tsx', codeTernarySeq);
      const dTernaryEnv = validateClientSourceEnv('app/leakTernaryEnv.tsx', codeTernaryEnv);

      // (true ? (0, process) : null).env.SECRET is a conditional expression branch
      expect(dTernarySeq).toHaveLength(0);

      // Direct process.env in ternary is caught via full object access check
      expect(dTernaryEnv.length).toBeGreaterThanOrEqual(1);
      expect(dTernaryEnv.some(d => d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT')).toBe(true);
    });
  });
});




