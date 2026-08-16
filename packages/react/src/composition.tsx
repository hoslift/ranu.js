import React, { Suspense, type ReactNode } from 'react';
import type {
  PageModule,
  LayoutModule,
  LoadingModule,
  NotFoundModule,
  PageProps,
  LayoutProps,
  ResolvedMetadata,
} from './types.js';
import { MetadataHeadElements } from './metadata.js';
import { DefaultDocumentShell } from './document.js';

export interface ComposeTreeOptions {
  readonly page: PageModule;
  readonly layouts: readonly LayoutModule[];
  readonly loading?: LoadingModule;
  readonly notFound?: NotFoundModule;
  readonly metadata?: ResolvedMetadata;
  readonly pageProps: PageProps;
}

/**
 * Composes the React component tree following the authoritative layout hierarchy (04_RENDERING_MODEL.md §12):
 * Root Layout -> Nested Layouts -> Loading / Suspense -> Page.
 */
export function composeComponentTree(options: ComposeTreeOptions): ReactNode {
  const { page, layouts, loading, metadata, pageProps } = options;

  const PageComponent = page.default;
  let currentChild: ReactNode = (
    <>
      <MetadataHeadElements metadata={metadata} />
      <PageComponent params={pageProps.params} searchParams={pageProps.searchParams} />
    </>
  );

  // Wrap page in Suspense if loading component is available for this segment
  if (loading) {
    const LoadingComponent = loading.default;
    currentChild = <Suspense fallback={<LoadingComponent />}>{currentChild}</Suspense>;
  }

  // Compose layouts from leaf to root (reverse iteration)
  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i];
    const LayoutComponent = layout.default;
    const layoutProps: LayoutProps = {
      children: currentChild,
      params: pageProps.params,
    };
    currentChild = <LayoutComponent {...layoutProps} />;
  }

  return currentChild;
}

/**
 * Composes a not-found UI tree within the preserved parent layout chain (04_RENDERING_MODEL.md §66–68).
 */
export function composeNotFoundTree({
  notFound,
  layouts,
  metadata,
  params,
}: {
  readonly notFound?: NotFoundModule;
  readonly layouts: readonly LayoutModule[];
  readonly metadata?: ResolvedMetadata;
  readonly params: Readonly<Record<string, string | string[]>>;
}): ReactNode {
  let content: ReactNode;

  if (notFound) {
    const NotFoundComp = notFound.default;
    content = (
      <>
        <MetadataHeadElements metadata={metadata} />
        <NotFoundComp />
      </>
    );
  } else {
    // Default 404 content
    content = (
      <div style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '4rem 1rem' }}>
        <MetadataHeadElements metadata={metadata ?? { title: '404 - Page Not Found' }} />
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>404 - Page Not Found</h1>
        <p style={{ color: '#666' }}>This page could not be found.</p>
      </div>
    );
  }

  // If no layouts exist, wrap in default document shell
  if (layouts.length === 0) {
    return <DefaultDocumentShell title="404 - Not Found">{content}</DefaultDocumentShell>;
  }

  // Wrap in preserved parent layouts from leaf to root
  let currentChild = content;
  for (let i = layouts.length - 1; i >= 0; i--) {
    const layout = layouts[i];
    const LayoutComponent = layout.default;
    const layoutProps: LayoutProps = {
      children: currentChild,
      params,
    };
    currentChild = <LayoutComponent {...layoutProps} />;
  }

  return currentChild;
}

/**
 * Composes a default root 500 error document when unrecoverable server errors occur pre-stream.
 */
export function composeErrorDocument({
  message,
  requestId,
  stack,
}: {
  readonly message: string;
  readonly requestId?: string;
  readonly stack?: string;
}): ReactNode {
  return (
    <DefaultDocumentShell title="500 - Internal Server Error">
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', color: '#e11d48', marginBottom: '1rem' }}>500 — Server Error</h1>
        <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>{message}</p>
        {requestId ? (
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
            Request ID: <code>{requestId}</code>
          </p>
        ) : null}
        {stack ? (
          <pre
            style={{
              background: '#f1f5f9',
              padding: '1rem',
              borderRadius: '6px',
              overflowX: 'auto',
              fontSize: '0.85rem',
              color: '#334155',
            }}
          >
            {stack}
          </pre>
        ) : null}
      </div>
    </DefaultDocumentShell>
  );
}
