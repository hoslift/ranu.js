import React, { type ReactNode } from 'react';
import type { Metadata, ResolvedMetadata, PageProps, LayoutProps, PageModule, LayoutModule } from './types.js';
import { escapeHtml } from './sanitizer.js';

/**
 * Resolves static or dynamic metadata for a Layout module.
 */
async function resolveLayoutMetadata(
  mod: LayoutModule,
  props: LayoutProps,
): Promise<Metadata | undefined> {
  if (mod.generateMetadata) {
    return await mod.generateMetadata(props);
  }
  return mod.metadata;
}

/**
 * Resolves static or dynamic metadata for a Page module.
 */
async function resolvePageMetadata(
  mod: PageModule,
  props: PageProps,
): Promise<Metadata | undefined> {
  if (mod.generateMetadata) {
    return await mod.generateMetadata(props);
  }
  return mod.metadata;
}

/**
 * Merges a list of metadata objects from root to leaf, applying title templates and overrides.
 */
export function mergeMetadata(metadataList: readonly (Metadata | undefined)[]): ResolvedMetadata {
  let currentTitle: string | undefined;
  let titleTemplate: string | undefined;
  let description: string | undefined;
  let robots: string | undefined;
  let canonical: string | undefined;
  let openGraph: ResolvedMetadata['openGraph'];
  let icons: ResolvedMetadata['icons'];

  for (const meta of metadataList) {
    if (!meta) continue;

    // Title resolution
    if (meta.title !== undefined) {
      if (typeof meta.title === 'string') {
        currentTitle = meta.title;
      } else if (typeof meta.title === 'object' && meta.title !== null) {
        currentTitle = meta.title.default;
        if (meta.title.template) {
          titleTemplate = meta.title.template;
        }
      }
    }

    if (meta.description !== undefined) {
      description = meta.description;
    }

    if (meta.robots !== undefined) {
      robots = meta.robots;
    }

    if (meta.canonical !== undefined) {
      canonical = meta.canonical;
    }

    if (meta.openGraph !== undefined) {
      openGraph = {
        ...openGraph,
        ...meta.openGraph,
      };
    }

    if (meta.icons !== undefined) {
      icons = {
        ...icons,
        ...meta.icons,
      };
    }
  }

  // Apply title template if present on non-root titles
  let resolvedTitle = currentTitle;
  if (resolvedTitle && titleTemplate && !titleTemplate.includes(resolvedTitle) && metadataList.length > 1) {
    // Apply template to leaf title if template contains %s
    if (titleTemplate.includes('%s')) {
      resolvedTitle = titleTemplate.replace('%s', resolvedTitle);
    }
  }

  return {
    title: resolvedTitle,
    description,
    robots,
    canonical,
    openGraph,
    icons,
  };
}

/**
 * Resolves metadata across the entire layout and page hierarchy.
 */
export async function resolveHierarchyMetadata(
  layouts: readonly LayoutModule[],
  page: PageModule,
  pageProps: PageProps,
): Promise<ResolvedMetadata> {
  const metadataList: (Metadata | undefined)[] = [];

  for (const layout of layouts) {
    const layoutProps: LayoutProps = {
      children: null,
      params: pageProps.params,
    };
    const meta = await resolveLayoutMetadata(layout, layoutProps);
    metadataList.push(meta);
  }

  const pageMeta = await resolvePageMetadata(page, pageProps);
  metadataList.push(pageMeta);

  return mergeMetadata(metadataList);
}

/**
 * Renders resolved metadata into React <head> elements.
 * React 19 natively hoists <title>, <meta>, <link> tags to the document head during SSR.
 */
export function MetadataHeadElements({ metadata }: { readonly metadata?: ResolvedMetadata | undefined }): ReactNode {
  if (!metadata) {
    return null;
  }

  const elements: ReactNode[] = [];

  if (metadata.title) {
    elements.push(React.createElement('title', { key: 'meta-title' }, metadata.title));
  }

  if (metadata.description) {
    elements.push(
      React.createElement('meta', {
        key: 'meta-desc',
        name: 'description',
        content: metadata.description,
      }),
    );
  }

  if (metadata.robots) {
    elements.push(
      React.createElement('meta', {
        key: 'meta-robots',
        name: 'robots',
        content: metadata.robots,
      }),
    );
  }

  if (metadata.canonical) {
    elements.push(
      React.createElement('link', {
        key: 'meta-canonical',
        rel: 'canonical',
        href: metadata.canonical,
      }),
    );
  }

  if (metadata.openGraph) {
    const og = metadata.openGraph;
    if (og.title) {
      elements.push(React.createElement('meta', { key: 'og-title', property: 'og:title', content: og.title }));
    }
    if (og.description) {
      elements.push(React.createElement('meta', { key: 'og-desc', property: 'og:description', content: og.description }));
    }
    if (og.url) {
      elements.push(React.createElement('meta', { key: 'og-url', property: 'og:url', content: og.url }));
    }
    if (og.siteName) {
      elements.push(React.createElement('meta', { key: 'og-sitename', property: 'og:site_name', content: og.siteName }));
    }
    if (og.images) {
      og.images.forEach((img, idx) => {
        elements.push(React.createElement('meta', { key: `og-img-${idx}`, property: 'og:image', content: img.url }));
        if (img.width) {
          elements.push(React.createElement('meta', { key: `og-img-w-${idx}`, property: 'og:image:width', content: String(img.width) }));
        }
        if (img.height) {
          elements.push(React.createElement('meta', { key: `og-img-h-${idx}`, property: 'og:image:height', content: String(img.height) }));
        }
        if (img.alt) {
          elements.push(React.createElement('meta', { key: `og-img-alt-${idx}`, property: 'og:image:alt', content: img.alt }));
        }
      });
    }
  }

  if (metadata.icons) {
    if (metadata.icons.icon) {
      elements.push(React.createElement('link', { key: 'icon-default', rel: 'icon', href: metadata.icons.icon }));
    }
    if (metadata.icons.apple) {
      elements.push(React.createElement('link', { key: 'icon-apple', rel: 'apple-touch-icon', href: metadata.icons.apple }));
    }
  }

  return React.createElement(React.Fragment, null, ...elements);
}
