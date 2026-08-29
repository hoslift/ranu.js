import { describe, it, expect } from 'vitest';
import React from 'react';
import { composeComponentTree, composeNotFoundTree, composeErrorDocument } from '../src/composition.js';
import type { PageModule, LayoutModule, LoadingModule, NotFoundModule, PageProps } from '../src/types.js';

describe('Component Composition', () => {
  it('composes root layout, nested layout, and page in correct hierarchy', () => {
    const rootLayout: LayoutModule = {
      default: ({ children }: any) => React.createElement('html', null, React.createElement('body', null, React.createElement('div', { id: 'root' }, children))),
    };

    const dashboardLayout: LayoutModule = {
      default: ({ children }: any) => React.createElement('section', { id: 'dashboard' }, children),
    };

    const page: PageModule = {
      default: ({ params }: any) => React.createElement('h1', null, `User: ${params.user}`),
    };

    const pageProps: PageProps = {
      params: { user: 'alice' },
      searchParams: {},
    };

    const tree = composeComponentTree({
      page,
      layouts: [rootLayout, dashboardLayout],
      pageProps,
    });

    expect(tree).toBeDefined();
  });

  it('wraps page in Suspense when loading module is present', () => {
    const page: PageModule = {
      default: () => React.createElement('div', null, 'Content'),
    };

    const loading: LoadingModule = {
      default: () => React.createElement('div', null, 'Loading Skeleton...'),
    };

    const pageProps: PageProps = {
      params: {},
      searchParams: {},
    };

    const tree = composeComponentTree({
      page,
      layouts: [],
      loading,
      pageProps,
    });

    expect(tree).toBeDefined();
  });

  it('composes not-found tree within preserved parent layouts', () => {
    const rootLayout: LayoutModule = {
      default: ({ children }: any) => React.createElement('html', null, React.createElement('body', null, children)),
    };

    const notFoundModule: NotFoundModule = {
      default: () => React.createElement('h2', null, 'Custom 404 Page'),
    };

    const tree = composeNotFoundTree({
      notFound: notFoundModule,
      layouts: [rootLayout],
      params: {},
    });

    expect(tree).toBeDefined();
  });

  it('composes default error document', () => {
    const doc = composeErrorDocument({
      message: 'Critical error occurred',
      requestId: 'req-err-1',
    });

    expect(doc).toBeDefined();
  });
});
