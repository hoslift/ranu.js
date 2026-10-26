import type { HttpMethod, RouteKind } from '@ranu/core';
import type { CompiledRouteRecord } from '@ranu/router';
import type { RanuRequestContext, RanuServerRuntime } from '@ranu/runtime';

/**
 * Route handler signature accepting WHATWG Request and RanuRequestContext.
 */
export type TestRouteHandler = (
  request: Request,
  context: RanuRequestContext,
) => Promise<Response> | Response;

/**
 * Map of HTTP methods to handler functions or a single fallback handler function.
 */
export type TestRouteHandlerMap =
  | Partial<Record<HttpMethod, TestRouteHandler>>
  | TestRouteHandler;

/**
 * Explicit test route definition.
 */
export interface TestRouteDefinition {
  readonly pathname: string;
  readonly handler: TestRouteHandlerMap;
  readonly kind?: RouteKind;
}

/**
 * Options to configure createTestContext.
 */
export interface CreateTestContextOptions {
  /**
   * Inline route handler definitions or pathname-to-handler map.
   */
  readonly routes?: Record<string, TestRouteHandlerMap> | readonly TestRouteDefinition[];

  /**
   * Pre-compiled route records, if testing pre-discovered or compiler-generated routes.
   */
  readonly routeRecords?: readonly CompiledRouteRecord[];

  /**
   * Optional middleware handler function.
   */
  readonly middleware?: (
    request: Request,
    context: RanuRequestContext,
  ) => Promise<Response | void> | Response | void;

  /**
   * Base origin for relative URLs (e.g. '/api/users'). Defaults to 'http://localhost:3000'.
   */
  readonly baseOrigin?: string;

  /**
   * Optional environment variables to mock within the test harness execution.
   */
  readonly env?: Record<string, string>;
}

/**
 * Request init options extended with convenient JSON body and query parameter helpers.
 */
export interface TestRequestOptions extends Omit<RequestInit, 'body'> {
  /**
   * Request body. Plain objects or arrays are serialized to JSON automatically.
   */
  body?: any;

  /**
   * Query parameters to append to the URL.
   */
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * In-memory test context for sub-50ms headless verification.
 */
export interface TestContext {
  /**
   * The underlying RanuServerRuntime instance.
   */
  readonly runtime: RanuServerRuntime;

  /**
   * The base URL used for relative request paths.
   */
  readonly baseOrigin: string;

  /**
   * Dispatches a raw WHATWG Request directly into the in-memory runtime (<1ms).
   */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

  /**
   * Dispatches a GET request.
   */
  get(path: string, options?: Omit<TestRequestOptions, 'method'>): Promise<Response>;

  /**
   * Dispatches a POST request.
   */
  post(
    path: string,
    body?: any,
    options?: Omit<TestRequestOptions, 'method' | 'body'>,
  ): Promise<Response>;

  /**
   * Dispatches a PUT request.
   */
  put(
    path: string,
    body?: any,
    options?: Omit<TestRequestOptions, 'method' | 'body'>,
  ): Promise<Response>;

  /**
   * Dispatches a PATCH request.
   */
  patch(
    path: string,
    body?: any,
    options?: Omit<TestRequestOptions, 'method' | 'body'>,
  ): Promise<Response>;

  /**
   * Dispatches a DELETE request.
   */
  delete(path: string, options?: Omit<TestRequestOptions, 'method'>): Promise<Response>;

  /**
   * Cleans up the runtime and unregisters context stores.
   */
  dispose(): void;
}
