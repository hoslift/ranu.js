import type { ReactNode, ComponentType } from 'react';

/**
 * Props passed to a Page component.
 */
export interface PageProps {
  readonly params: Readonly<Record<string, string | string[]>>;
  readonly searchParams: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Props passed to a Layout component.
 * Layouts receive children and params, but NOT searchParams (04_RENDERING_MODEL.md §85).
 */
export interface LayoutProps {
  readonly children: ReactNode;
  readonly params: Readonly<Record<string, string | string[]>>;
}

/**
 * Props passed to an Error boundary component.
 */
export interface ErrorProps {
  readonly error: Error;
  readonly reset: () => void;
}

/**
 * Component signatures.
 */
export type PageComponent = ComponentType<PageProps> | ((props: PageProps) => Promise<ReactNode> | ReactNode);
export type LayoutComponent = ComponentType<LayoutProps> | ((props: LayoutProps) => Promise<ReactNode> | ReactNode);
export type LoadingComponent = ComponentType<{}> | (() => Promise<ReactNode> | ReactNode);
export type ErrorComponent = ComponentType<ErrorProps>;
export type NotFoundComponent = ComponentType<{}> | (() => Promise<ReactNode> | ReactNode);

/**
 * OpenGraph metadata fields (04_RENDERING_MODEL.md §74).
 */
export interface OpenGraphImage {
  readonly url: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly alt?: string | undefined;
}

export interface OpenGraphMetadata {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly url?: string | undefined;
  readonly siteName?: string | undefined;
  readonly images?: readonly OpenGraphImage[] | undefined;
}

/**
 * Icons metadata fields (04_RENDERING_MODEL.md §74).
 */
export interface IconMetadata {
  readonly icon?: string | undefined;
  readonly apple?: string | undefined;
}

/**
 * Title metadata definition supporting string or template object.
 */
export type TitleMetadata =
  | string
  | {
      readonly default: string;
      readonly template?: string | undefined;
    };

/**
 * Authoritative Metadata contract (04_RENDERING_MODEL.md §74).
 */
export interface Metadata {
  readonly title?: TitleMetadata | undefined;
  readonly description?: string | undefined;
  readonly robots?: string | undefined;
  readonly canonical?: string | undefined;
  readonly openGraph?: OpenGraphMetadata | undefined;
  readonly icons?: IconMetadata | undefined;
}

/**
 * Fully resolved metadata with concrete string values ready for <head> injection.
 */
export interface ResolvedMetadata {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly robots?: string | undefined;
  readonly canonical?: string | undefined;
  readonly openGraph?: OpenGraphMetadata | undefined;
  readonly icons?: IconMetadata | undefined;
}

/**
 * Validated Page module export contract.
 */
export interface PageModule {
  readonly default: PageComponent;
  readonly metadata?: Metadata | undefined;
  readonly generateMetadata?: ((props: PageProps) => Promise<Metadata> | Metadata) | undefined;
  readonly render?: ('server' | 'static' | 'client') | undefined;
}

/**
 * Validated Layout module export contract.
 */
export interface LayoutModule {
  readonly default: LayoutComponent;
  readonly metadata?: Metadata | undefined;
  readonly generateMetadata?: ((props: LayoutProps) => Promise<Metadata> | Metadata) | undefined;
}

/**
 * Validated Loading module export contract.
 */
export interface LoadingModule {
  readonly default: LoadingComponent;
}

/**
 * Validated Error module export contract.
 */
export interface ErrorModule {
  readonly default: ErrorComponent;
}

/**
 * Validated NotFound module export contract.
 */
export interface NotFoundModule {
  readonly default: NotFoundComponent;
}

/**
 * Raw untrusted module loading boundary.
 */
export interface RawModuleLoader {
  loadRaw(path: string): Promise<unknown>;
}

/**
 * Strongly-typed Component Module Loader contract.
 */
export interface ComponentModuleLoader {
  loadPage(path: string): Promise<PageModule>;
  loadLayout(path: string): Promise<LayoutModule>;
  loadLoading(path: string): Promise<LoadingModule | undefined>;
  loadError(path: string): Promise<ErrorModule | undefined>;
  loadNotFound(path: string): Promise<NotFoundModule | undefined>;
}
