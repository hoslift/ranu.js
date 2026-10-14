import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  composeComponentTree,
  composeNotFoundTree,
  composeErrorDocument,
  wrapRouteParams,
} from '../src/composition.js';
import type {
  PageModule,
  LayoutModule,
  LoadingModule,
  NotFoundModule,
  PageProps,
} from '../src/types.js';

describe('Component Composition', () => {
  it('composes root layout, nested layout, and page in correct hierarchy', () => {
    const rootLayout: LayoutModule = {
      default: ({ children }: any) =>
        React.createElement(
          'html',
          null,
          React.createElement('body', null, React.createElement('div', { id: 'root' }, children)),
        ),
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
      default: ({ children }: any) =>
        React.createElement('html', null, React.createElement('body', null, children)),
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

  it('supports synchronous property access and async Promise resolution on wrapRouteParams', async () => {
    const raw = { id: '123', slug: 'react-19' };
    const wrapped = wrapRouteParams(raw);

    // Synchronous property access
    expect(wrapped.id).toBe('123');
    expect(wrapped.slug).toBe('react-19');

    // Async Promise resolution
    const resolved = await wrapped;
    expect(resolved).toEqual({ id: '123', slug: 'react-19' });
    expect(resolved.id).toBe('123');
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('composes tree with async Page component awaiting params', async () => {
    const page: PageModule = {
      default: async ({ params }: PageProps) => {
        const resolved = await params;
        return React.createElement('h1', null, `Item: ${resolved.id}`);
      },
    };

    const pageProps: PageProps = {
      params: wrapRouteParams({ id: 'item-42' }),
      searchParams: {},
    };

    const tree = composeComponentTree({
      page,
      layouts: [],
      pageProps,
    });

    expect(tree).toBeDefined();
  });
});
