import type {
  PageModule,
  LayoutModule,
  LoadingModule,
  ErrorModule,
  NotFoundModule,
  RawModuleLoader,
  ComponentModuleLoader,
} from './types.js';

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isValidComponent(val: unknown): boolean {
  if (typeof val === 'function') {
    return true;
  }
  if (isObject(val) && '$$typeof' in val) {
    return true;
  }
  return false;
}

/**
 * Validates whether an untrusted value matches the PageModule shape.
 */
export function isPageModule(raw: unknown): raw is PageModule {
  if (!isObject(raw)) {
    return false;
  }

  if (!isValidComponent(raw.default)) {
    return false;
  }

  if ('metadata' in raw && raw.metadata !== undefined) {
    if (!isObject(raw.metadata)) {
      return false;
    }
  }

  if ('generateMetadata' in raw && raw.generateMetadata !== undefined) {
    if (typeof raw.generateMetadata !== 'function') {
      return false;
    }
  }

  if ('render' in raw && raw.render !== undefined) {
    if (raw.render !== 'server' && raw.render !== 'static' && raw.render !== 'client') {
      return false;
    }
  }

  return true;
}

/**
 * Validates whether an untrusted value matches the LayoutModule shape.
 */
export function isLayoutModule(raw: unknown): raw is LayoutModule {
  if (!isObject(raw)) {
    return false;
  }

  if (!isValidComponent(raw.default)) {
    return false;
  }

  if ('metadata' in raw && raw.metadata !== undefined) {
    if (!isObject(raw.metadata)) {
      return false;
    }
  }

  if ('generateMetadata' in raw && raw.generateMetadata !== undefined) {
    if (typeof raw.generateMetadata !== 'function') {
      return false;
    }
  }

  return true;
}

/**
 * Validates whether an untrusted value matches the LoadingModule shape.
 */
export function isLoadingModule(raw: unknown): raw is LoadingModule {
  if (!isObject(raw)) {
    return false;
  }

  return isValidComponent(raw.default);
}

/**
 * Validates whether an untrusted value matches the ErrorModule shape.
 */
export function isErrorModule(raw: unknown): raw is ErrorModule {
  if (!isObject(raw)) {
    return false;
  }

  return isValidComponent(raw.default);
}

/**
 * Validates whether an untrusted value matches the NotFoundModule shape.
 */
export function isNotFoundModule(raw: unknown): raw is NotFoundModule {
  if (!isObject(raw)) {
    return false;
  }

  return isValidComponent(raw.default);
}

/**
 * Creates a strongly-typed ComponentModuleLoader from a raw untrusted loader.
 * Validates every raw imported module at the boundary before exposing it.
 */
export function createDefaultModuleLoader(rawLoader: RawModuleLoader): ComponentModuleLoader {
  return {
    async loadPage(path: string): Promise<PageModule> {
      const raw = await rawLoader.loadRaw(path);
      if (!isPageModule(raw)) {
        throw new Error(
          `Invalid page module at "${path}". A page module must export a valid default React component function or object.`,
        );
      }
      return raw;
    },

    async loadLayout(path: string): Promise<LayoutModule> {
      const raw = await rawLoader.loadRaw(path);
      if (!isLayoutModule(raw)) {
        throw new Error(
          `Invalid layout module at "${path}". A layout module must export a valid default React component function or object.`,
        );
      }
      return raw;
    },

    async loadLoading(path: string): Promise<LoadingModule | undefined> {
      try {
        const raw = await rawLoader.loadRaw(path);
        if (!isLoadingModule(raw)) {
          return undefined;
        }
        return raw;
      } catch {
        return undefined;
      }
    },

    async loadError(path: string): Promise<ErrorModule | undefined> {
      try {
        const raw = await rawLoader.loadRaw(path);
        if (!isErrorModule(raw)) {
          return undefined;
        }
        return raw;
      } catch {
        return undefined;
      }
    },

    async loadNotFound(path: string): Promise<NotFoundModule | undefined> {
      try {
        const raw = await rawLoader.loadRaw(path);
        if (!isNotFoundModule(raw)) {
          return undefined;
        }
        return raw;
      } catch {
        return undefined;
      }
    },
  };
}
