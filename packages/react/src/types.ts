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
export type LoadingComponent = ComponentType<Record<string, never>> | (() => Promise<ReactNode> | ReactNode);
export type ErrorComponent = ComponentType<ErrorProps>;
export type NotFoundComponent = ComponentType<Record<string, never>> | (() => Promise<ReactNode> | ReactNode);

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

/**
 * Assets associated with a hydrated route.
 */
export interface RouteClientAssets {
  readonly js: readonly string[];
  readonly css: readonly string[];
}

/**
 * Authoritative client hydration payload embedded in the SSR document.
 */
export interface RanuHydrationPayload {
  readonly buildId: string;
  readonly routeId: string;
  readonly pathname: string;
  readonly params: Readonly<Record<string, string | readonly string[]>>;
  readonly searchParams: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly publicEnv: Readonly<Record<string, string>>;
  readonly assets: RouteClientAssets;
  readonly renderMode?: ('server' | 'static' | 'client') | undefined;
}

/**
 * Options for bootstrapClientHydration.
 */
export interface ClientBootstrapOptions {
  readonly buildId?: string | undefined;
  readonly container?: Document | Element | undefined;
  readonly componentLoader?: ((routeId: string) => Promise<PageComponent | PageModule>) | undefined;
  readonly renderApp?: ((payload: RanuHydrationPayload) => ReactNode) | undefined;
  readonly onHydrated?: (() => void) | undefined;
  readonly onHydrationError?: ((error: unknown) => void) | undefined;
}

/**
 * Result returned by bootstrapClientHydration.
 */
export interface ClientBootstrapResult {
  readonly success: boolean;
  readonly payload: RanuHydrationPayload;
  readonly root?: unknown;
}

/**
 * Read-only interface for URL Search Parameters in client navigation.
 */
export interface ReadonlyURLSearchParams {
  get(name: string): string | null;
  getAll(name: string): readonly string[];
  has(name: string): boolean;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  forEach(callback: (value: string, key: string) => void): void;
  toString(): string;
  readonly size: number;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

/**
 * Immutable router state representation for client-side navigation.
 */
export interface RouterState {
  readonly pathname: string;
  readonly searchParams: ReadonlyURLSearchParams;
  readonly routeId: string;
  readonly params: Readonly<Record<string, string | readonly string[]>>;
}

/**
 * Options for router navigation operations.
 */
export interface NavigateOptions {
  readonly scroll?: boolean | undefined;
}

/**
 * Router navigation delegate actions interface.
 */
export interface RouterNavigationActions {
  push(href: string, options?: NavigateOptions): void;
  replace(href: string, options?: NavigateOptions): void;
  back(): void;
  forward(): void;
  refresh(): void;
}

/**
 * Public Ranu Router contract exposed by useRouter().
 */
export interface RanuRouter {
  push(href: string, options?: NavigateOptions): void;
  replace(href: string, options?: NavigateOptions): void;
  back(): void;
  forward(): void;
  refresh(): void;
}

/**
 * Public props supported by the <Link> component.
 */
export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly href: string;
  readonly replace?: boolean | undefined;
  readonly scroll?: boolean | undefined;
  readonly prefetch?: boolean | undefined;
}

/**
 * Loaded route module contract.
 */
export interface LoadedRouteModule {
  readonly default?: ComponentType<PageProps> | undefined;
  readonly [key: string]: unknown;
}

/**
 * Client Route Asset Registry mapping routeId to associated JS and CSS assets.
 */
export interface ClientRouteAssetRegistry {
  readonly buildId: string;
  readonly assets: Readonly<Record<string, RouteClientAssets>>;
}

/**
 * Interface for loading client route modules.
 */
export interface RouteLoader {
  loadRouteModule(routeId: string): Promise<LoadedRouteModule>;
  getRouteAssets(routeId: string): RouteClientAssets | undefined;
}

/**
 * Options for prefetching a route.
 */
export interface PrefetchOptions {
  readonly kind?: 'hover' | 'viewport' | 'intent' | undefined;
}

/**
 * Service interface for prefetching client routes.
 */
export interface PrefetchService {
  prefetch(href: string, options?: PrefetchOptions): Promise<boolean>;
}
