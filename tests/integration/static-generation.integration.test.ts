import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateStaticRoute,
  renderStaticRoute,
  renderStaticRoutesInBatch,
  type EvaluatedStaticPath,
} from '@ranu/build';
import type { ComponentModuleLoader } from '@ranu/react';
import { notFound } from '@ranu/server';

describe('Phase 15: Static Site Generation (SSG) Integration Test', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-ssg-integration-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('executes full SSG pipeline: route evaluation -> static render -> HTML file artifact with hydration payload', async () => {
    // 1. Evaluate dynamic static route params
    const evaluated = await evaluateStaticRoute({
      routeId: 'page:/posts/[slug]',
      pathnameTemplate: '/posts/[slug]',
      pattern: {
        segments: [
          { kind: 'static', value: 'posts' },
          { kind: 'dynamic', param: 'slug' },
        ],
      },
      params: ['slug'],
      renderMode: 'static',
      generatorFn: async () => [
        { slug: 'first-post' },
        { slug: 'second-post' },
        { slug: 'missing-post' },
      ],
    });

    expect(evaluated.isStatic).toBe(true);
    expect(evaluated.diagnostics).toEqual([]);
    expect(evaluated.paths).toHaveLength(3);

    // 2. Setup mock module loader
    const loader: ComponentModuleLoader = {
      async loadPage(routeId: string) {
        return {
          default: ({ params }: { params: { slug: string } }) => {
            if (params.slug === 'missing-post') {
              notFound();
            }
            return React.createElement('main', null, [
              React.createElement('h1', { key: 'title' }, `Post: ${params.slug}`),
              React.createElement('p', { key: 'content' }, 'Static content pre-rendered at build time.'),
            ]);
          },
          metadata: ({ params }: { params: { slug: string } }) => ({
            title: `Blog - ${params.slug}`,
          }),
        };
      },
      async loadLayout() {
        return {
          default: ({ children }: { children: React.ReactNode }) =>
            React.createElement('html', { lang: 'en' }, React.createElement('body', null, children)),
        };
      },
      async loadNotFound() {
        return {
          default: () => React.createElement('div', { id: 'not-found' }, 'Post Not Found (404)'),
        };
      },
      async loadLoading() {
        return undefined;
      },
      async loadError() {
        return undefined;
      },
    };

    // 3. Render all evaluated paths in batch
    const routeConfigs = evaluated.paths.map((p: EvaluatedStaticPath) => ({
      routeId: 'page:/posts/[slug]',
      pathname: p.pathname,
      params: p.params,
      target: {
        routeId: 'page:/posts/[slug]',
        layouts: ['app/layout.tsx'],
        notFound: ['app/not-found.tsx'],
      },
      loader,
      buildId: 'integration-build-123',
      outputDir: tempDir,
    }));

    const artifacts = await renderStaticRoutesInBatch(routeConfigs, 2);

    expect(artifacts).toHaveLength(3);

    // Verify first-post (200 OK)
    const first = artifacts.find(a => a.pathname === '/posts/first-post');
    expect(first).toBeDefined();
    expect(first?.status).toBe(200);
    expect(first?.file).toBe('./static/pages/posts/first-post.html');
    const firstHtml = fs.readFileSync(path.join(tempDir, 'static', 'pages', 'posts', 'first-post.html'), 'utf8');
    expect(firstHtml).toContain('Post: first-post');
    expect(firstHtml).toContain('<title>Blog - first-post</title>');

    // Verify second-post (200 OK)
    const second = artifacts.find(a => a.pathname === '/posts/second-post');
    expect(second).toBeDefined();
    expect(second?.status).toBe(200);
    expect(second?.file).toBe('./static/pages/posts/second-post.html');

    // Verify missing-post (404 Not Found)
    const missing = artifacts.find(a => a.pathname === '/posts/missing-post');
    expect(missing).toBeDefined();
    expect(missing?.status).toBe(404);
    expect(missing?.file).toBe('./static/pages/posts/missing-post.html');
    const missingHtml = fs.readFileSync(path.join(tempDir, 'static', 'pages', 'posts', 'missing-post.html'), 'utf8');
    expect(missingHtml).toContain('Post Not Found (404)');
  });
});
