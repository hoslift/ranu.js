import { describe, it, expect } from 'vitest';
import { validateSourceNonSerializableProps } from '../src/compiler/props-validator.js';

describe('Adversarial Tier 1 Static Props Guard Stress Harness', () => {
  // =========================================================================
  // Dimension 1: Deeply Nested Objects with Functions, Classes, and Symbols
  // =========================================================================
  describe('Dimension 1: Deeply Nested Objects', () => {
    it('detects arrow functions nested 3 levels deep in object literals', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              config={{
                level1: {
                  level2: {
                    level3Callback: () => console.log('deep call'),
                  },
                },
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('config.level1.level2.level3Callback');
      expect(diags[0]?.message).toContain('Client Component <ClientWidget>');
    });

    it('detects function expressions nested 4 levels deep in object literals', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              settings={{
                a: {
                  b: {
                    c: {
                      handler: function () {
                        return true;
                      },
                    },
                  },
                },
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('settings.a.b.c.handler');
    });

    it('detects class instances nested 3 levels deep in object literals', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              state={{
                cache: {
                  store: new Map(),
                },
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('state.cache.store');
      expect(diags[0]?.message).toContain('class instance');
    });

    it('detects Symbol calls nested in object literals', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              meta={{
                identity: {
                  uid: Symbol('unique-id'),
                },
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('meta.identity.uid');
      expect(diags[0]?.message).toContain('symbol');
    });

    it('detects Symbol.for and Symbol.iterator nested in object literals', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              protocol={{
                globalKey: Symbol.for('app.protocol'),
                iter: Symbol.iterator,
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('protocol.globalKey');
    });

    it('detects shorthand properties inside objects resolving to scoped functions or instances', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          const onTrigger = () => {};
          const localMap = new Map();
          return <ClientWidget options={{ onTrigger, localMap }} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.message).toContain('options.onTrigger');
    });

    it('detects object spread expressions containing non-serializable props', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              bundle={{
                id: 100,
                ...{ leakedFn: () => {} },
              }}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.message).toContain('bundle');
    });
  });

  // =========================================================================
  // Dimension 2: Array of Arrays (Multidimensional Arrays)
  // =========================================================================
  describe('Dimension 2: Multidimensional Arrays', () => {
    it('detects class instance in 2D array [[new Map()]]', () => {
      const code = `
        import { ClientGrid } from './grid.js';
        export default function Page() {
          return <ClientGrid matrix={[[new Map()]]} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientGrid']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('matrix[0][0]');
      expect(diags[0]?.message).toContain('class instance');
    });

    it('detects closure in 3D array [[[ () => {} ]]]', () => {
      const code = `
        import { ClientCube } from './cube.js';
        export default function Page() {
          return <ClientCube tensor={[[[() => {}]]]} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientCube']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('tensor[0][0][0]');
      expect(diags[0]?.message).toContain('function');
    });

    it('detects Symbol in deeply nested array [[["safe", Symbol("nested")]]]', () => {
      const code = `
        import { ClientTable } from './table.js';
        export default function Page() {
          return <ClientTable rows={[[['safe', Symbol('nested')]]]} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientTable']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('rows[0][0][1]');
      expect(diags[0]?.message).toContain('symbol');
    });

    it('detects nested objects containing arrays of class instances', () => {
      const code = `
        import { ClientBoard } from './board.js';
        export default function Page() {
          return <ClientBoard spec={{ grids: [[new Date()]] }} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientBoard']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('spec.grids[0][0]');
    });
  });

  // =========================================================================
  // Dimension 3: JSX Children Function Expressions & Closures
  // =========================================================================
  describe('Dimension 3: JSX Children Expressions', () => {
    it('detects JSX children arrow function expressions: <ClientList>{(item) => <li>{item}</li>}</ClientList>', () => {
      const code = `
        import { ClientList } from './list.js';
        export default function Page() {
          return (
            <ClientList>
              {(item) => <li>{item}</li>}
            </ClientList>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientList']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "children" to Client Component <ClientList>');
    });

    it('detects JSX children regular function expression: <ClientList>{function(item) { return <li>{item}</li>; }}</ClientList>', () => {
      const code = `
        import { ClientList } from './list.js';
        export default function Page() {
          return (
            <ClientList>
              {function (item) {
                return <li>{item}</li>;
              }}
            </ClientList>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientList']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "children" to Client Component <ClientList>');
    });

    it('detects class instance passed as child expression: <ClientContainer>{new Date()}</ClientContainer>', () => {
      const code = `
        import { ClientContainer } from './container.js';
        export default function Page() {
          return <ClientContainer>{new Date()}</ClientContainer>;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientContainer']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('class instance prop "children"');
    });

    it('detects scoped function passed as child expression: <ClientContainer>{renderChild}</ClientContainer>', () => {
      const code = `
        import { ClientContainer } from './container.js';
        export default function Page() {
          const renderChild = () => <span>content</span>;
          return <ClientContainer>{renderChild}</ClientContainer>;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientContainer']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('children');
    });

    it('detects scoped class instance passed as child expression: <ClientContainer>{myMap}</ClientContainer>', () => {
      const code = `
        import { ClientContainer } from './container.js';
        export default function Page() {
          const myMap = new Map();
          return <ClientContainer>{myMap}</ClientContainer>;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientContainer']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('children');
    });
  });

  // =========================================================================
  // Dimension 4: Namespaced Component References
  // =========================================================================
  describe('Dimension 4: Complex Namespaced Component References', () => {
    it('detects non-serializable props on <Vendor.UI.SpecialButton onAction={() => {}} /> when Vendor is client root', () => {
      const code = `
        import * as Vendor from './vendor.js';
        export default function Page() {
          return <Vendor.UI.SpecialButton onAction={() => {}} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Vendor']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "onAction" to Client Component <Vendor.UI.SpecialButton>');
    });

    it('detects non-serializable props on <Vendor.UI.SpecialButton onAction={() => {}} /> when full path is client name', () => {
      const code = `
        export default function Page() {
          return <Vendor.UI.SpecialButton onAction={() => {}} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Vendor.UI.SpecialButton']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('<Vendor.UI.SpecialButton>');
    });

    it('detects non-serializable children on namespaced client component <Vendor.Modal>{() => {}}</Vendor.Modal>', () => {
      const code = `
        import * as Vendor from './vendor.js';
        export default function Page() {
          return <Vendor.Modal>{() => <div>Modal Content</div>}</Vendor.Modal>;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Vendor']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "children" to Client Component <Vendor.Modal>');
    });

    it('does not flag non-client namespaced components <ServerVendor.Button onClick={() => {}} />', () => {
      const code = `
        import * as ServerVendor from './server-vendor.js';
        export default function Page() {
          return <ServerVendor.Button onClick={() => {}} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['OtherClient']));
      expect(diags).toHaveLength(0);
    });
  });

  // =========================================================================
  // Dimension 5: Scope Tracking & Scope-Aliased Class Instances
  // =========================================================================
  describe('Dimension 5: Scope Tracking & Aliased Instances', () => {
    it('detects scope-aliased class instance: const date = new Date(); <ClientComp timestamp={date} />', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          const date = new Date();
          return <ClientComp timestamp={date} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('class instance prop "timestamp"');
    });

    it('detects class instance inside inner block scope: { const inst = new MyClass(); <ClientComp s={inst} /> }', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          {
            const inst = new Map();
            return <ClientComp s={inst} />;
          }
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('class instance prop "s"');
    });

    it('correctly handles lexical shadowing: inner scope shadows class instance with safe primitive', () => {
      const code = `
        import { ClientComp } from './comp.js';
        const date = new Date(); // outer class instance
        export default function Page() {
          const date = 1729200000; // inner primitive shadows outer
          return <ClientComp timestamp={date} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('correctly handles lexical shadowing: inner scope shadows function with safe object', () => {
      const code = `
        import { ClientComp } from './comp.js';
        function callback() { return 'outer'; }
        export default function Page() {
          const callback = { status: 'ok' };
          return <ClientComp data={callback} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('handles reverse lexical shadowing: outer safe variable shadowed by inner closure', () => {
      const code = `
        import { ClientComp } from './comp.js';
        const handler = 'safe-string';
        export default function Page() {
          const handler = () => 'inner closure';
          return <ClientComp onAction={handler} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('onAction');
    });

    it('unwraps type assertions on new expressions in scope: const d = (new Date()) as any', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          const d = ((new Date()) as unknown) as Date;
          return <ClientComp date={d} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('class instance');
    });

    it('ignores uninitialized variables (let uninit: any; <ClientComp val={uninit} />)', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          let uninit: any;
          return <ClientComp val={uninit} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });
  });

  // =========================================================================
  // Dimension 6: False Positive Validation (Zero Diagnostics on Safe Constructs)
  // =========================================================================
  describe('Dimension 6: False Positive Validation (Zero Diagnostics)', () => {
    it('allows React elements passed as props: <ClientComp header={<div>hello</div>} />', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return <ClientComp header={<div>hello</div>} footer={<span>bye</span>} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows nested React elements inside object props: <ClientComp layout={{ slot: <h1>Title</h1> }} />', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return <ClientComp layout={{ slot: <h1>Title</h1>, count: 5 }} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows static JSX elements as direct children: <ClientComp><div>hello</div><p>world</p></ClientComp>', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return (
            <ClientComp>
              <div>hello</div>
              <p>world</p>
            </ClientComp>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows JSX expression children containing JSX elements: <ClientComp>{<div>hello</div>}</ClientComp>', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return <ClientComp>{<div>hello</div>}</ClientComp>;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows all primitive types: string, number, boolean, null, undefined, bigint', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return (
            <ClientComp
              str="hello"
              num={42}
              negNum={-3.14}
              boolTrue={true}
              boolFalse={false}
              valNull={null}
              valUndef={undefined}
              big={100000000000000n}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows plain JSON objects with arbitrary nesting and primitive arrays', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          const payload = {
            user: {
              name: 'Alice',
              roles: ['admin', 'viewer'],
              settings: {
                darkMode: true,
                attempts: 3,
                score: null,
              },
            },
          };
          return <ClientComp data={payload} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows arrays of primitives and arrays of plain JSON objects', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return (
            <ClientComp
              primitiveList={[1, 'two', true, null, undefined]}
              objectList={[
                { id: 1, title: 'Item 1' },
                { id: 2, title: 'Item 2', meta: { active: false } },
              ]}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows Server Action references and objects with $$ACTION_ID', () => {
      const code = `
        import { ClientComp } from './comp.js';
        import { myServerAction } from './actions.js';
        export default function Page() {
          const actionObj = { $$ACTION_ID: 'secure_hash_abc_123', meta: 'action' };
          return (
            <ClientComp
              action={myServerAction}
              actionDescriptor={actionObj}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows event handlers on native HTML elements and server components', () => {
      const code = `
        import { ServerCard } from './card.js';
        export default function Page() {
          return (
            <div>
              <button onClick={() => console.log('click')}>Click</button>
              <form onSubmit={() => console.log('submit')}>
                <input onChange={() => {}} />
              </form>
              <ServerCard
                onServerEvent={() => {}}
                store={new Map()}
              />
            </div>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('allows spread of safe plain objects into Client Components', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          const safeSpread = { title: 'Heading', count: 10 };
          return <ClientComp {...safeSpread} {...{ active: true }} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });
  });

  // =========================================================================
  // Dimension 7: Extreme Edge Cases & Interleaved Complex Topologies
  // =========================================================================
  describe('Dimension 7: Extreme Edge Cases & Interleaved Topologies', () => {
    it('detects class instance deeply nested inside interleaved arrays and objects', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              complex={[
                {
                  matrix: [
                    {
                      inner: [new Set()],
                    },
                  ],
                },
              ]}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('complex[0].matrix[0].inner[0]');
      expect(diags[0]?.message).toContain('class instance');
    });

    it('detects non-serializable instance inside JSX children array: <ClientComp>{[<span>Safe</span>, new Map()]}</ClientComp>', () => {
      const code = `
        import { ClientComp } from './comp.js';
        export default function Page() {
          return (
            <ClientComp>
              {[<span key="1">Safe</span>, new Map()]}
            </ClientComp>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('children[1]');
      expect(diags[0]?.message).toContain('class instance');
    });

    it('detects violations in client components nested inside expressions like array.map()', () => {
      const code = `
        import { ClientItem } from './item.js';
        export default function Page() {
          const items = [1, 2, 3];
          return (
            <div>
              {items.map((id) => (
                <ClientItem key={id} onSelect={() => console.log(id)} />
              ))}
            </div>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientItem']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "onSelect" to Client Component <ClientItem>');
    });

    it('detects violations in client components rendered inside ternary expressions', () => {
      const code = `
        import { ClientLogin } from './login.js';
        export default function Page() {
          const isGuest = true;
          return (
            <div>
              {isGuest ? (
                <ClientLogin onLogin={function() {}} />
              ) : (
                <span>Welcome back</span>
              )}
            </div>
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientLogin']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "onLogin" to Client Component <ClientLogin>');
    });

    it('detects deeply nested type assertions wrapping non-serializable closure', () => {
      const code = `
        import { ClientWidget } from './widget.js';
        export default function Page() {
          return (
            <ClientWidget
              handler={((((() => 42) as any) as unknown) as () => void)}
            />
          );
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientWidget']));
      expect(diags).toHaveLength(1);
      expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
      expect(diags[0]?.message).toContain('prop "handler"');
      expect(diags[0]?.message).toContain('function');
    });

    it('returns empty array when source code does not contain any JSX opening angle bracket', () => {
      const code = `
        export const serverConstant = 42;
        export function computeHash(val: string) {
          return val.length;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/utils.ts', code, new Set(['ClientComp']));
      expect(diags).toHaveLength(0);
    });

    it('returns empty array when clientComponentNames set is empty', () => {
      const code = `
        import { Widget } from './widget.js';
        export default function Page() {
          return <Widget onClick={() => {}} />;
        }
      `;
      const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set());
      expect(diags).toHaveLength(0);
    });
  });
});
