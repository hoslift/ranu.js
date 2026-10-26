import type { ReactNode } from 'react';

export const FLIGHT_SERIALIZATION_ERROR_CODE = 'RANU_REACT_STREAM_SERIALIZATION_ERROR';

/**
 * Well-known Flight allowed symbols.
 */
const ALLOWED_FLIGHT_SYMBOLS = new Set<symbol>([
  Symbol.for('react.element'),
  Symbol.for('react.transitional.element'),
  Symbol.for('react.fragment'),
  Symbol.for('react.server.reference'),
  Symbol.for('react.suspense'),
]);

/**
 * Forbidden prototype pollution keys.
 */
const FORBIDDEN_PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class FlightSerializationError extends TypeError {
  readonly componentName: string;
  readonly propPath: string;
  readonly valueType: string;
  readonly code: string = FLIGHT_SERIALIZATION_ERROR_CODE;
  readonly hint: string;

  constructor(options: {
    componentName: string;
    propPath: string;
    valueType: string;
    message: string;
    hint?: string;
  }) {
    super(options.message);
    this.name = 'FlightSerializationError';
    this.componentName = options.componentName;
    this.propPath = options.propPath;
    this.valueType = options.valueType;
    this.hint =
      options.hint ??
      'Move event handlers and stateful logic inside the Client Component ("use client"), or pass plain JSON-serializable data.';
  }
}

/**
 * Checks if a value is a plain object with null or Object.prototype.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks if a function is a registered React Server Action.
 */
export function isServerAction(value: unknown): boolean {
  if (typeof value !== 'function') {
    return false;
  }
  const candidate = value as any;
  return (
    Boolean(candidate.$$ACTION_ID) ||
    candidate.$$typeof === Symbol.for('react.server.reference') ||
    candidate[Symbol.for('react.server.reference')] === true
  );
}

/**
 * Checks if a value is a React Element.
 */
export function isReactElement(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as any;
  return (
    candidate.$$typeof === Symbol.for('react.element') ||
    candidate.$$typeof === Symbol.for('react.transitional.element')
  );
}

/**
 * Checks if a component type represents a Client Component boundary.
 */
export function isClientComponentType(type: unknown): boolean {
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) {
    return false;
  }
  const candidate = type as any;
  if (
    candidate.$$typeof === Symbol.for('react.client.reference') ||
    candidate.__ranu_client__ === true ||
    candidate.renderMode === 'client' ||
    candidate.render === 'client' ||
    candidate.isClient === true
  ) {
    return true;
  }
  if (candidate.$$typeof === Symbol.for('react.forward_ref') && candidate.render) {
    return isClientComponentType(candidate.render);
  }
  if (candidate.$$typeof === Symbol.for('react.memo') && candidate.type) {
    return isClientComponentType(candidate.type);
  }
  return false;
}

/**
 * Asserts that a value satisfies React 19 Flight serialization rules.
 * Throws FlightSerializationError on any non-serializable property crossing the boundary.
 */
export function assertFlightSerializable(
  value: unknown,
  path: string = 'props',
  componentName: string = 'ClientComponent',
  seen: WeakSet<object> = new WeakSet<object>()
): void {
  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;

  // Primitives are always serializable
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return;
  }

  if (type === 'bigint') {
    throw new FlightSerializationError({
      componentName,
      propPath: path,
      valueType: 'bigint',
      message: `Cannot pass non-serializable bigint prop "${path}" to Client Component <${componentName}> across the streaming boundary.`,
      hint: 'Convert BigInt values to string or number before passing to Client Components.',
    });
  }

  if (type === 'function') {
    if (isServerAction(value)) {
      return;
    }
    throw new FlightSerializationError({
      componentName,
      propPath: path,
      valueType: 'function',
      message: `Cannot pass non-serializable function prop "${path}" to Client Component <${componentName}> across the streaming boundary.`,
      hint: 'Move event handlers and stateful logic inside the Client Component ("use client"), or pass plain JSON-serializable data.',
    });
  }

  if (type === 'symbol') {
    if (ALLOWED_FLIGHT_SYMBOLS.has(value as symbol)) {
      return;
    }
    throw new FlightSerializationError({
      componentName,
      propPath: path,
      valueType: 'symbol',
      message: `Cannot pass non-serializable symbol prop "${path}" to Client Component <${componentName}> across the streaming boundary.`,
      hint: 'Symbols cannot be serialized across the server/client streaming boundary. Use string identifiers instead.',
    });
  }

  if (type === 'object') {
    const obj = value as object;

    // Reject cyclic references
    if (seen.has(obj)) {
      throw new FlightSerializationError({
        componentName,
        propPath: path,
        valueType: 'cyclic structure',
        message: `Cannot pass cyclic object prop "${path}" to Client Component <${componentName}> across the streaming boundary.`,
        hint: 'Eliminate cyclic object references before passing props to Client Components.',
      });
    }
    seen.add(obj);

    // Promises are explicitly allowed in React 19 async streaming props
    if (typeof (value as any).then === 'function') {
      // Validate synchronous enumerable properties attached to promise (e.g. wrapped route params)
      const keys = Object.keys(value);
      if (keys.length > 0) {
        for (const key of keys) {
          if (key === 'then' || key === 'catch' || key === 'finally') {
            continue;
          }
          assertFlightSerializable(
            (value as Record<string, unknown>)[key],
            `${path}.${key}`,
            componentName,
            seen
          );
        }
      }
      return;
    }

    // React elements are serializable in Flight
    if (isReactElement(value)) {
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        assertFlightSerializable(value[i], `${path}[${i}]`, componentName, seen);
      }
      return;
    }

    // Non-plain objects / class instances
    if (!isPlainObject(value)) {
      const className = (value as any).constructor?.name ?? 'Unknown';
      throw new FlightSerializationError({
        componentName,
        propPath: path,
        valueType: `class instance (${className})`,
        message: `Cannot pass non-serializable class instance "${className}" prop "${path}" to Client Component <${componentName}> across the streaming boundary.`,
        hint: 'Pass plain JSON-serializable objects or convert the class instance to primitive values or a plain object.',
      });
    }

    // Prototype pollution keys check
    for (const key of Object.getOwnPropertyNames(value)) {
      if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
        throw new FlightSerializationError({
          componentName,
          propPath: `${path}.${key}`,
          valueType: 'prototype pollution',
          message: `Forbidden prototype pollution key "${key}" detected in prop "${path}".`,
          hint: 'Remove dangerous prototype manipulation keys from objects passed to Client Components.',
        });
      }
    }

    for (const key of Object.keys(value)) {
      assertFlightSerializable(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        componentName,
        seen
      );
    }
  }
}

export interface FlightValidationResult {
  valid: boolean;
  error?: {
    componentName: string;
    propName: string;
    valueType: string;
    message: string;
    hint: string;
  };
}

export function validateFlightSerializable(
  value: unknown,
  path: string = 'props',
  componentName: string = 'ClientComponent'
): FlightValidationResult {
  try {
    assertFlightSerializable(value, path, componentName);
    return { valid: true };
  } catch (err: unknown) {
    if (err instanceof FlightSerializationError) {
      return {
        valid: false,
        error: {
          componentName: err.componentName,
          propName: err.propPath,
          valueType: err.valueType,
          message: err.message,
          hint: err.hint,
        },
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: {
        componentName,
        propName: path,
        valueType: 'unknown',
        message: msg,
        hint: 'Ensure props passed across client boundaries are JSON-serializable.',
      },
    };
  }
}

/**
 * Recursively validates a React node tree for Client Component boundaries and their props.
 * Handles both synchronous and asynchronous component subtrees.
 */
export function assertTreeFlightSerializable(
  node: ReactNode,
  seenElements = new Set<unknown>()
): void | Promise<void> {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (seenElements.has(node)) {
    return;
  }
  seenElements.add(node);

  if (Array.isArray(node)) {
    const promises: Promise<void>[] = [];
    for (const child of node) {
      const res = assertTreeFlightSerializable(child, seenElements);
      if (res && typeof res.then === 'function') {
        promises.push(res);
      }
    }
    if (promises.length > 0) {
      return Promise.all(promises).then(() => {});
    }
    return;
  }

  if (isReactElement(node)) {
    const element = node as any;
    const type = element.type;

    if (isClientComponentType(type)) {
      const compName =
        typeof type === 'function'
          ? type.displayName || type.name || 'ClientComponent'
          : (type as any)?.displayName || (type as any)?.name || 'ClientComponent';

      if (element.props) {
        assertFlightSerializable(element.props, 'props', compName);
      }
      return;
    }

    let asyncPromise: Promise<void> | undefined;

    // If it is a function component (Server Component), execute it to inspect the rendered subtree
    if (typeof type === 'function') {
      try {
        const rendered = type(element.props);
        if (rendered && typeof rendered.then === 'function') {
          asyncPromise = rendered.then((resolved: any) =>
            assertTreeFlightSerializable(resolved, seenElements)
          );
        } else if (rendered) {
          const res = assertTreeFlightSerializable(rendered, seenElements);
          if (res && typeof res.then === 'function') {
            asyncPromise = res;
          }
        }
      } catch (err: unknown) {
        if (err instanceof FlightSerializationError) {
          throw err;
        }
        // Fall through to children inspection if component throws runtime hook error
      }
    }

    if (element.props?.children) {
      const res = assertTreeFlightSerializable(element.props.children, seenElements);
      if (res && typeof res.then === 'function') {
        if (asyncPromise) {
          return Promise.all([asyncPromise, res]).then(() => {});
        }
        return res;
      }
    }

    return asyncPromise;
  }
}
