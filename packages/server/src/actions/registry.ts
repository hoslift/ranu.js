import type { ServerActionMetadata } from '@ranu/core';

export interface ServerActionRegistration {
  readonly actionId: string;
  readonly handler: (...args: any[]) => any;
  readonly metadata?: ServerActionMetadata | undefined;
  readonly schema?: any;
}

/**
 * Server Action Registry with N-1 Deployment Grace Table support.
 * Allows seamless rolling updates across pods where older clients invoke
 * actions from the previous build.
 */
export class ServerActionRegistry {
  private readonly currentActions = new Map<string, ServerActionRegistration>();
  private readonly graceActions = new Map<string, ServerActionRegistration>();

  /**
   * Registers a server action for the current build.
   */
  register(
    actionId: string,
    handler: (...args: any[]) => any,
    metadata?: ServerActionMetadata,
    schema?: any,
  ): void {
    this.currentActions.set(actionId, {
      actionId,
      handler,
      ...(metadata !== undefined ? { metadata } : {}),
      ...(schema !== undefined ? { schema } : {}),
    });
  }

  /**
   * Registers a server action in the N-1 grace table (previous build compatibility).
   */
  registerGrace(
    actionId: string,
    handler: (...args: any[]) => any,
    metadata?: ServerActionMetadata,
    schema?: any,
  ): void {
    this.graceActions.set(actionId, {
      actionId,
      handler,
      ...(metadata !== undefined ? { metadata } : {}),
      ...(schema !== undefined ? { schema } : {}),
    });
  }

  /**
   * Resolves an action by ID, searching current build actions first, then falling back to grace table.
   */
  get(actionId: string): ServerActionRegistration | undefined {
    return this.currentActions.get(actionId) ?? this.graceActions.get(actionId);
  }

  /**
   * Checks whether an action exists in current or grace actions.
   */
  has(actionId: string): boolean {
    return this.currentActions.has(actionId) || this.graceActions.has(actionId);
  }

  /**
   * Returns all registered actions for the current build.
   */
  getAll(): Map<string, ServerActionRegistration> {
    return new Map(this.currentActions);
  }

  /**
   * Returns all registered actions in the N-1 grace table.
   */
  getGraceActions(): Map<string, ServerActionRegistration> {
    return new Map(this.graceActions);
  }

  /**
   * Clears all registered actions.
   */
  clear(): void {
    this.currentActions.clear();
    this.graceActions.clear();
  }
}

/**
 * Default framework-wide ServerActionRegistry instance.
 */
export const defaultActionRegistry = new ServerActionRegistry();
