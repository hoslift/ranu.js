import React, { type ReactNode } from 'react';
import { hydrateRoot, createRoot, type RootOptions } from 'react-dom/client';
import {
  deserializeHydrationData,
  HYDRATION_DATA_SCRIPT_ID,
  HYDRATION_DATA_SCRIPT_TYPE,
} from './serialization.js';
import type {
  RanuHydrationPayload,
  ClientBootstrapOptions,
  ClientBootstrapResult,
  PageProps,
} from '../types.js';

/**
 * Locates and reads the inert JSON hydration payload from the specified document.
 */
export function getHydrationPayloadFromDocument(
  doc?: Document | null
): RanuHydrationPayload {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  if (!targetDoc) {
    throw new Error('Hydration bootstrap requires a valid Document context.');
  }

  const scriptEl = targetDoc.getElementById(HYDRATION_DATA_SCRIPT_ID);
  if (!scriptEl) {
    throw new Error(
      `Hydration script element with ID "${HYDRATION_DATA_SCRIPT_ID}" was not found in document.`
    );
  }

  if (scriptEl.tagName.toLowerCase() !== 'script') {
    throw new TypeError(`Hydration element "${HYDRATION_DATA_SCRIPT_ID}" is not a <script> element.`);
  }

  const scriptType = scriptEl.getAttribute('type');
  if (scriptType !== HYDRATION_DATA_SCRIPT_TYPE) {
    throw new TypeError(
      `Hydration script element must have type "${HYDRATION_DATA_SCRIPT_TYPE}", received "${scriptType ?? 'null'}".`
    );
  }

  const rawJson = scriptEl.textContent ?? '';
  return deserializeHydrationData(rawJson);
}

/**
 * Bootstraps client-side hydration for Ranu.js full-document SSR/SSG markup or initial mounting for client routes.
 */
export async function bootstrapClientHydration(
  options: ClientBootstrapOptions = {}
): Promise<ClientBootstrapResult> {
  const container =
    options.container ?? (typeof document !== 'undefined' ? document : null);
  if (!container) {
    throw new Error('Cannot bootstrap client hydration: document is not available.');
  }

  const doc =
    typeof Document !== 'undefined' && container instanceof Document
      ? container
      : 'ownerDocument' in container && container.ownerDocument
        ? (container.ownerDocument as Document)
        : (container as unknown as Document);
  if (!doc) {
    throw new Error('Cannot locate Document for hydration container.');
  }

  // 1. Read and validate hydration payload from inert document script
  const payload = getHydrationPayloadFromDocument(doc);

  // 2. Validate build ID against client build runtime if expected buildId is provided
  if (options.buildId && options.buildId !== payload.buildId) {
    const error = new Error(
      `Build ID mismatch during hydration: server build "${payload.buildId}" vs client build "${options.buildId}".`
    );
    options.onHydrationError?.(error);
    throw error;
  }

  // 3. Resolve hydratable / mountable component tree
  let appElement: ReactNode = null;
  try {
    if (options.renderApp) {
      appElement = options.renderApp(payload);
    } else if (options.componentLoader) {
      const loaded = await options.componentLoader(payload.routeId);
      const Component =
        typeof loaded === 'function' ? loaded : (loaded as { default?: React.ComponentType<PageProps> })?.default;
      if (Component) {
        const pageProps: PageProps = {
          params: payload.params as Record<string, string | string[]>,
          searchParams: payload.searchParams as Record<string, string | string[] | undefined>,
        };
        appElement = <Component {...pageProps} />;
      }
    }
  } catch (err: unknown) {
    options.onHydrationError?.(err);
    throw err;
  }

  if (!appElement) {
    const error = new Error(`Failed to resolve hydratable component tree for route "${payload.routeId}".`);
    options.onHydrationError?.(error);
    throw error;
  }

  // 4. Mount or Hydrate depending on renderMode
  try {
    const rootOptions: RootOptions = {
      onRecoverableError: (error) => {
        options.onHydrationError?.(error);
      },
    };

    if (payload.renderMode === 'client') {
      // Client Rendering Mode: Mount initial React component using createRoot
      const clientMountEl =
        typeof doc.getElementById === 'function'
          ? doc.getElementById('ranu-client-root')
          : null;
      const targetMount = clientMountEl ?? container;

      const root = createRoot(targetMount as Element | DocumentFragment, rootOptions);
      root.render(appElement);

      options.onHydrated?.();
      return {
        success: true,
        payload,
        root,
      };
    }

    // Server / Static Rendering Mode: Hydrate existing server-rendered HTML
    const root = hydrateRoot(container, appElement, rootOptions);

    options.onHydrated?.();
    return {
      success: true,
      payload,
      root,
    };
  } catch (err: unknown) {
    options.onHydrationError?.(err);
    throw err;
  }
}
