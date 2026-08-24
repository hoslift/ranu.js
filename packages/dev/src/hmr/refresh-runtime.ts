/**
 * React Fast Refresh runtime implementation for Ranu.js.
 * Manages component registration, hook signatures, boundary validation, and state-preserving updates.
 */

export interface ComponentSignature {
  key: string;
  customHooks: Array<() => unknown>;
  getCustomHooks?: () => Array<() => unknown>;
}

export class ReactRefreshRuntime {
  private static registeredComponents = new Map<string, unknown>();
  private static componentSignatures = new Map<unknown, ComponentSignature>();
  private static refreshListeners = new Set<() => void>();

  /**
   * Registers a React component type under an identifier.
   */
  static register(type: unknown, id: string): void {
    if (type === null || type === undefined) return;
    if (typeof type !== 'function' && typeof type !== 'object') return;
    this.registeredComponents.set(id, type);
  }

  /**
   * Sets the hook signature for a component.
   */
  static setSignature(type: unknown, key: string, customHooks: Array<() => unknown> = []): void {
    if (!type || (typeof type !== 'function' && typeof type !== 'object')) return;
    this.componentSignatures.set(type, { key, customHooks });
  }

  /**
   * Hook signature generator helper ($RefreshSig$).
   */
  static createSignatureFunctionForTransform(): (
    type: unknown,
    key: string,
    customHooks?: Array<() => unknown>,
  ) => unknown {
    let savedType: unknown = null;

    return function (type: unknown, key: string, customHooks: Array<() => unknown> = []) {
      if (typeof key === 'string') {
        savedType = type;
        ReactRefreshRuntime.setSignature(type, key, customHooks);
        return type;
      }
      return savedType;
    };
  }

  /**
   * Determines if a value is likely a React component type.
   */
  static isLikelyComponentType(type: unknown): boolean {
    if (typeof type === 'function') {
      const name = type.name || (type as { displayName?: string }).displayName;
      if (typeof name === 'string' && name.length > 0) {
        // Component function names must start with uppercase letter
        return /^[A-Z]/.test(name);
      }
      return false;
    }
    if (typeof type === 'object' && type !== null) {
      const $$typeof = (type as { $$typeof?: symbol }).$$typeof;
      if (typeof $$typeof === 'symbol') {
        const desc = $$typeof.description || '';
        return desc.includes('react.memo') || desc.includes('react.forward_ref');
      }
    }
    return false;
  }

  /**
   * Validates if a module export object forms a safe Fast Refresh boundary.
   * Returns true only if every export is a valid React component.
   */
  static isRefreshBoundary(moduleExports: unknown): boolean {
    if (moduleExports === null || moduleExports === undefined) {
      return false;
    }

    if (this.isLikelyComponentType(moduleExports)) {
      return true;
    }

    if (typeof moduleExports !== 'object') {
      return false;
    }

    let hasExports = false;
    for (const key of Object.keys(moduleExports as Record<string, unknown>)) {
      if (key === '__esModule' || key === '$$typeof') {
        continue;
      }
      hasExports = true;
      const exportVal = (moduleExports as Record<string, unknown>)[key];
      if (!this.isLikelyComponentType(exportVal)) {
        return false;
      }
    }

    return hasExports;
  }

  /**
   * Checks whether two versions of a component have compatible hook signatures.
   */
  static areSignaturesCompatible(prevType: unknown, nextType: unknown): boolean {
    const prevSig = this.componentSignatures.get(prevType);
    const nextSig = this.componentSignatures.get(nextType);

    if (!prevSig && !nextSig) return true;
    if (!prevSig || !nextSig) return false;
    return prevSig.key === nextSig.key;
  }

  /**
   * Registers a listener to be notified when performReactRefresh is called.
   */
  static onRefresh(listener: () => void): () => void {
    this.refreshListeners.add(listener);
    return () => {
      this.refreshListeners.delete(listener);
    };
  }

  /**
   * Executes the React Fast Refresh cycle.
   */
  static performReactRefresh(): void {
    for (const listener of this.refreshListeners) {
      try {
        listener();
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Resets runtime registrations (useful in tests and dev client resets).
   */
  static reset(): void {
    this.registeredComponents.clear();
    this.componentSignatures.clear();
    this.refreshListeners.clear();
  }
}
