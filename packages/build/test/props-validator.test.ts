import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildModuleGraph } from '../src/graph/module-classifier.js';
import {
  validateNonSerializableProps,
  validateSourceNonSerializableProps,
} from '../src/compiler/props-validator.js';

describe('props-validator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-props-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('allows serializable props (primitive values, objects, arrays) passed to client components', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter count={42} title="Active" items={['a', 'b']} config={{ theme: 'dark' }} />;
      }
    `;

    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(0);
  });

  it('rejects inline arrow functions passed to client components across boundary', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter onClick={() => console.log('clicked')} />;
      }
    `;

    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(1);
    const diag = diags[0]!;
    expect(diag.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diag.severity).toBe('error');
    expect(diag.message).toContain('Cannot pass non-serializable function prop "onClick" to Client Component <Counter>');
    expect(diag.hint).toContain('Move event handlers and stateful logic inside the Client Component');
    expect(diag.location?.file).toBe('/project/app/page.tsx');
  });

  it('rejects function expressions passed to client components', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter onAction={function() { return 1; }} />;
      }
    `;

    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('onAction');
  });

  it('rejects local server function references passed as props', () => {
    const code = `
      import { Counter } from './Counter.js';
      function handleServerAction() {
        return 'server';
      }
      export default function Page() {
        return <Counter onSelect={handleServerAction} />;
      }
    `;

    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('onSelect');
  });

  it('rejects class instances (new expressions) passed as props', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter cache={new Map()} />;
      }
    `;

    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('cache');
  });

  it('does not flag handlers on native HTML elements or server components', () => {
    const code = `
      import { ServerWidget } from './ServerWidget.js';
      export default function Page() {
        return (
          <div>
            <button onClick={() => {}}>Click</button>
            <ServerWidget action={() => {}} />
          </div>
        );
      }
    `;

    // Only 'Counter' is client, neither 'button' nor 'ServerWidget' is client
    const diags = validateSourceNonSerializableProps(
      '/project/app/page.tsx',
      code,
      new Set(['Counter'])
    );

    expect(diags).toHaveLength(0);
  });

  it('validates graph-level non-serializable props with buildModuleGraph', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(
      pageFile,
      `import { ClientButton } from './button.js';
       export default function Page() {
         return <ClientButton onClick={() => {}} />;
       }`
    );

    const buttonFile = path.join(appDir, 'button.tsx');
    fs.writeFileSync(
      buttonFile,
      `"use client";
       export function ClientButton({ onClick }: { onClick: () => void }) {
         return <button onClick={onClick}>Click</button>;
       }`
    );

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateNonSerializableProps(graph);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(result.diagnostics[0]?.hint).toContain('Move event handlers');
  });

  it('rejects Symbol props passed across boundary (Symbol call and Symbol.for)', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter sym={Symbol('id')} token={Symbol.for('token')} iter={Symbol.iterator} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(3);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('symbol prop "sym"');
    expect(diags[1]?.message).toContain('symbol prop "token"');
    expect(diags[2]?.message).toContain('symbol prop "iter"');
  });

  it('rejects component-scoped inner functions passed across boundary', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        const handleInnerArrow = () => console.log('inner');
        function handleInnerDecl() { return 1; }
        return <Counter onClick={handleInnerArrow} onSelect={handleInnerDecl} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(2);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('onClick');
    expect(diags[1]?.message).toContain('onSelect');
  });

  it('correctly handles variable shadowing without false positives', () => {
    const code = `
      import { Counter } from './Counter.js';
      function count() { return 1; }
      export default function Page() {
        const count = 42;
        return <Counter count={count} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(0);
  });

  it('rejects nested functions inside object literals passed to client components', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter config={{ theme: 'dark', onDone: () => console.log('done') }} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('config.onDone');
    expect(diags[0]?.message).toContain('Client Component <Counter>');
  });

  it('rejects nested class instances inside array literals passed to client components', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter items={[new Date(), new Map()]} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('items[0]');
    expect(diags[0]?.message).toContain('class instance');
  });

  it('rejects deeply nested non-serializable objects within arrays', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter options={[{ meta: { callback: () => {} } }]} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('options[0].meta.callback');
  });

  it('rejects JSX element children expressions containing functions', () => {
    const code = `
      import { ClientContainer } from './ClientContainer.js';
      export default function Page() {
        return <ClientContainer>{() => <span>render prop</span>}</ClientContainer>;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientContainer']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('prop "children" to Client Component <ClientContainer>');
  });

  it('allows valid JSX children elements or primitives', () => {
    const code = `
      import { ClientContainer } from './ClientContainer.js';
      export default function Page() {
        return (
          <ClientContainer>
            <span>Static Child</span>
            <p>Second Child</p>
          </ClientContainer>
        );
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientContainer']));
    expect(diags).toHaveLength(0);
  });

  it('rejects namespaced client component invocations with non-serializable props', () => {
    const code = `
      import * as ClientMod from './button.js';
      export default function Page() {
        return <ClientMod.Button onClick={() => alert('hi')} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['ClientMod']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('prop "onClick" to Client Component <ClientMod.Button>');
  });

  it('tracks local class instances initialized with new Expression in scope passed via identifier', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        const today = new Date();
        const registry = new Map();
        return <Counter date={today} map={registry} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(2);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('date');
    expect(diags[0]?.message).toContain('class instance');
    expect(diags[1]?.message).toContain('map');
  });

  it('rejects non-serializable props passed via JSX spread attributes', () => {
    const code = `
      import { Counter } from './Counter.js';
      export default function Page() {
        return <Counter {...{ onClick: () => {}, active: true }} />;
      }
    `;
    const diags = validateSourceNonSerializableProps('/app/page.tsx', code, new Set(['Counter']));
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(diags[0]?.message).toContain('onClick');
  });

  it('validates graph-level namespaced client component imports', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const pageFile = path.join(appDir, 'page.tsx');
    fs.writeFileSync(
      pageFile,
      `import * as UI from './ui.js';
       export default function Page() {
         return <UI.Button onClick={() => {}} />;
       }`
    );

    const uiFile = path.join(appDir, 'ui.tsx');
    fs.writeFileSync(
      uiFile,
      `"use client";
       export function Button({ onClick }: { onClick: () => void }) {
         return <button onClick={onClick}>Click</button>;
       }`
    );

    const graph = buildModuleGraph([pageFile], tempDir);
    const result = validateNonSerializableProps(graph);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('RANU_BUILD_NON_SERIALIZABLE_PROP');
    expect(result.diagnostics[0]?.message).toContain('<UI.Button>');
  });
});
