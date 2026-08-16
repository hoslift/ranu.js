import { describe, it, expect } from 'vitest';
import { mergeMetadata, resolveHierarchyMetadata } from '../src/metadata.js';
import type { LayoutModule, PageModule, PageProps } from '../src/types.js';

describe('Metadata Engine', () => {
  describe('mergeMetadata', () => {
    it('merges root and leaf metadata with singular overrides', () => {
      const rootMeta = {
        title: 'Root App',
        description: 'Root Description',
        robots: 'index, follow',
      };
      const pageMeta = {
        title: 'About Page',
        description: 'About Description',
      };

      const merged = mergeMetadata([rootMeta, pageMeta]);
      expect(merged.title).toBe('About Page');
      expect(merged.description).toBe('About Description');
      expect(merged.robots).toBe('index, follow');
    });

    it('applies title template from root to leaf', () => {
      const rootMeta = {
        title: {
          default: 'My App',
          template: '%s | My App',
        },
      };
      const pageMeta = {
        title: 'Products',
      };

      const merged = mergeMetadata([rootMeta, pageMeta]);
      expect(merged.title).toBe('Products | My App');
    });

    it('merges openGraph and icons fields', () => {
      const rootMeta = {
        openGraph: {
          siteName: 'MySite',
          images: [{ url: '/og-root.png' }],
        },
        icons: {
          icon: '/favicon.ico',
        },
      };
      const pageMeta = {
        openGraph: {
          title: 'Custom OG Title',
        },
        icons: {
          apple: '/apple-touch.png',
        },
      };

      const merged = mergeMetadata([rootMeta, pageMeta]);
      expect(merged.openGraph?.siteName).toBe('MySite');
      expect(merged.openGraph?.title).toBe('Custom OG Title');
      expect(merged.openGraph?.images?.[0].url).toBe('/og-root.png');
      expect(merged.icons?.icon).toBe('/favicon.ico');
      expect(merged.icons?.apple).toBe('/apple-touch.png');
    });
  });

  describe('resolveHierarchyMetadata', () => {
    it('resolves dynamic generateMetadata across hierarchy', async () => {
      const layoutModule: LayoutModule = {
        default: ({ children }: any) => children,
        generateMetadata: async () => ({
          title: { default: 'Store', template: '%s - Store' },
          robots: 'all',
        }),
      };

      const pageModule: PageModule = {
        default: ({ params }: any) => `Product ${params.id}`,
        generateMetadata: async ({ params }) => ({
          title: `Product ${params.id}`,
          description: `Details for product ${params.id}`,
        }),
      };

      const pageProps: PageProps = {
        params: { id: '42' },
        searchParams: {},
      };

      const resolved = await resolveHierarchyMetadata([layoutModule], pageModule, pageProps);
      expect(resolved.title).toBe('Product 42 - Store');
      expect(resolved.description).toBe('Details for product 42');
      expect(resolved.robots).toBe('all');
    });
  });
});
