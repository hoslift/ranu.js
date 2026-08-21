import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderStaticRoute, renderStaticRoutesInBatch } from '../src/index.js';
import type { ComponentModuleLoader, PageProps, ResolvedMetadata } from '@ranu/react';
import { notFound, redirect, cookies, headers, getRequestContext } from '@ranu/server';

describe('Phase 15 Stage 15B: Static HTML Document Renderer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-static-render-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockLoader(modules: {
    page: any;
    layout?: any;
    notFound?: any;
  }): ComponentModuleLoader {
    return {
      async loadPage() {
        return modules.page;
      },
      async loadLayout() {
        return modules.layout ?? {
          default: ({ children }: { children: React.ReactNode }) =>
            React.createElement('html', null, React.createElement('body', null, children)),
        };
      },
      async loadNotFound() {
        return modules.notFound ?? {
          default: () => React.createElement('div', { id: 'default-not-found' }, 'Page Not Found'),
        };
      },
      async loadLoading() {
        return undefined;
      },
      async loadError() {
        return undefined;
      },
    };
  }

  it('renders simple static page into standalone HTML artifact with status 200', async () => {
    const loader = createMockLoader({
      page: {
        default: () => React.createElement('h1', null, 'Hello Static World'),
        metadata: { title: 'Static Home' },
      },
      layout: {
        default: ({ children }: { children: React.ReactNode }) =>
          React.createElement('html', { lang: 'en' }, React.createElement('body', null, children)),
      },
    });

    const artifact = await renderStaticRoute({
      routeId: 'page:/',
      pathname: '/',
      params: {},
      target: {
        routeId: 'page:/',
        layouts: ['app/layout.tsx'],
      },
      loader,
      buildId: 'test-build-id',
      outputDir: tempDir,
    });

    expect(artifact.pathname).toBe('/');
    expect(artifact.status).toBe(200);
    expect(artifact.file).toBe('./static/pages/index.html');

    const filePath = path.join(tempDir, 'static', 'pages', 'index.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const html = fs.readFileSync(filePath, 'utf8');
    expect(html).toContain('Hello Static World');
    expect(html).toContain('<title>Static Home</title>');
  });

  it('passes dynamic params and empty searchParams to page component', async () => {
    let receivedProps: PageProps | undefined;

    const loader = createMockLoader({
      page: {
        default: (props: PageProps) => {
          receivedProps = props;
          return React.createElement('h1', null, `Blog: ${String(props.params.slug)}`);
        },
      },
    });

    const artifact = await renderStaticRoute({
      routeId: 'page:/blog/[slug]',
      pathname: '/blog/first-post',
      params: { slug: 'first-post' },
      target: {
        routeId: 'page:/blog/[slug]',
        layouts: ['app/layout.tsx'],
      },
      loader,
      buildId: 'test-build-id',
      outputDir: tempDir,
    });

    expect(artifact.status).toBe(200);
    expect(artifact.file).toBe('./static/pages/blog/first-post.html');
    expect(receivedProps?.params).toEqual({ slug: 'first-post' });
    expect(receivedProps?.searchParams).toEqual({});

    const filePath = path.join(tempDir, 'static', 'pages', 'blog', 'first-post.html');
    const html = fs.readFileSync(filePath, 'utf8');
    expect(html).toContain('Blog: first-post');
  });

  it('renders nearest not-found.tsx and produces status 404 artifact when notFound() is called', async () => {
    const loader = createMockLoader({
      page: {
        default: () => {
          notFound();
        },
      },
      notFound: {
        default: () => React.createElement('div', { id: 'custom-404' }, 'Custom 404 Not Found Page'),
      },
    });

    const artifact = await renderStaticRoute({
      routeId: 'page:/products/[id]',
      pathname: '/products/missing-item',
      params: { id: 'missing-item' },
      target: {
        routeId: 'page:/products/[id]',
        layouts: ['app/layout.tsx'],
        notFound: ['app/products/not-found.tsx'],
      },
      loader,
      buildId: 'test-build-id',
      outputDir: tempDir,
    });

    expect(artifact.status).toBe(404);
    expect(artifact.pathname).toBe('/products/missing-item');
    expect(artifact.file).toBe('./static/pages/products/missing-item.html');

    const filePath = path.join(tempDir, 'static', 'pages', 'products', 'missing-item.html');
    expect(fs.existsSync(filePath)).toBe(true);
    const html = fs.readFileSync(filePath, 'utf8');
    expect(html).toContain('Custom 404 Not Found Page');
  });

  it('fails with RANU_SSG_REDIRECT_UNSUPPORTED when static route triggers redirect()', async () => {
    const loader = createMockLoader({
      page: {
        default: () => {
          redirect('/destination');
        },
      },
    });

    await expect(
      renderStaticRoute({
        routeId: 'page:/old-path',
        pathname: '/old-path',
        params: {},
        target: {
          routeId: 'page:/old-path',
          layouts: ['app/layout.tsx'],
        },
        loader,
        buildId: 'test-build-id',
        outputDir: tempDir,
      })
    ).rejects.toMatchObject({
      code: 'RANU_SSG_REDIRECT_UNSUPPORTED',
      message: expect.stringContaining('Dynamic redirects are unsupported during static site generation'),
    });
  });

  it('rejects cookies(), headers(), and getRequestContext() during SSG with RANU_SSG_DYNAMIC_ACCESS', async () => {
    // 1. cookies()
    const cookiesLoader = createMockLoader({
      page: {
        default: () => {
          cookies().get('session');
          return React.createElement('div', null, 'Forbidden');
        },
      },
    });

    await expect(
      renderStaticRoute({
        routeId: 'page:/cookies',
        pathname: '/cookies',
        params: {},
        target: { routeId: 'page:/cookies', layouts: ['app/layout.tsx'] },
        loader: cookiesLoader,
        buildId: 'test-build-id',
        outputDir: tempDir,
      })
    ).rejects.toMatchObject({
      code: 'RANU_SSG_DYNAMIC_ACCESS',
    });

    // 2. headers()
    const headersLoader = createMockLoader({
      page: {
        default: () => {
          headers().get('user-agent');
          return React.createElement('div', null, 'Forbidden');
        },
      },
    });

    await expect(
      renderStaticRoute({
        routeId: 'page:/headers',
        pathname: '/headers',
        params: {},
        target: { routeId: 'page:/headers', layouts: ['app/layout.tsx'] },
        loader: headersLoader,
        buildId: 'test-build-id',
        outputDir: tempDir,
      })
    ).rejects.toMatchObject({
      code: 'RANU_SSG_DYNAMIC_ACCESS',
    });

    // 3. getRequestContext()
    const contextLoader = createMockLoader({
      page: {
        default: () => {
          getRequestContext();
          return React.createElement('div', null, 'Forbidden');
        },
      },
    });

    await expect(
      renderStaticRoute({
        routeId: 'page:/context',
        pathname: '/context',
        params: {},
        target: { routeId: 'page:/context', layouts: ['app/layout.tsx'] },
        loader: contextLoader,
        buildId: 'test-build-id',
        outputDir: tempDir,
      })
    ).rejects.toMatchObject({
      code: 'RANU_SSG_DYNAMIC_ACCESS',
    });
  });

  it('renders multiple routes in batch with bounded concurrency and context isolation', async () => {
    const routeItems = [
      { id: '1', title: 'Post 1' },
      { id: '2', title: 'Post 2' },
      { id: '3', title: 'Post 3' },
      { id: '4', title: 'Post 4' },
      { id: '5', title: 'Post 5' },
    ];

    const loader: ComponentModuleLoader = {
      async loadPage() {
        return {
          default: (props: PageProps) => {
            return React.createElement('div', null, `Item ID: ${String(props.params.id)}`);
          },
        };
      },
      async loadLayout() {
        return {
          default: ({ children }: { children: React.ReactNode }) =>
            React.createElement('html', null, React.createElement('body', null, children)),
        };
      },
      async loadNotFound() {
        return undefined;
      },
      async loadLoading() {
        return undefined;
      },
      async loadError() {
        return undefined;
      },
    };

    const routeConfigs = routeItems.map(item => ({
      routeId: 'page:/items/[id]',
      pathname: `/items/${item.id}`,
      params: { id: item.id },
      target: {
        routeId: 'page:/items/[id]',
        layouts: ['app/layout.tsx'],
      },
      loader,
      buildId: 'test-build-id',
      outputDir: tempDir,
    }));

    const artifacts = await renderStaticRoutesInBatch(routeConfigs, 3);
    expect(artifacts).toHaveLength(5);
    expect(artifacts.map(a => a.pathname)).toEqual([
      '/items/1',
      '/items/2',
      '/items/3',
      '/items/4',
      '/items/5',
    ]);

    for (const a of artifacts) {
      expect(a.status).toBe(200);
      const filePath = path.join(tempDir, a.file.replace(/^\.\//, ''));
      expect(fs.existsSync(filePath)).toBe(true);
      const html = fs.readFileSync(filePath, 'utf8');
      expect(html).toContain(`Item ID: ${String(a.params.id)}`);
    }
  });
});
