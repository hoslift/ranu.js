import { AsyncLocalStorage } from 'node:async_hooks';
import {
  trace,
  context,
  propagation,
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
  TraceFlags,
  type Tracer,
  type Span,
  type SpanOptions,
  type SpanContext,
  type Context,
  type TextMapPropagator,
  type TextMapSetter,
  type TextMapGetter,
} from '@opentelemetry/api';

export {
  SpanKind,
  SpanStatusCode,
  ROOT_CONTEXT,
  TraceFlags,
  type Tracer,
  type Span,
  type SpanOptions,
  type SpanContext,
  type Context,
};

const TRACER_NAME = 'ranu';
const TRACER_VERSION = '0.3.0';

function generateRandomHex(bytes: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let str = '';
  for (let i = 0; i < bytes; i++) {
    str += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return str;
}

/**
 * Built-in OpenTelemetry Span implementation.
 */
class RanuSpan implements Span {
  private _spanContext: SpanContext;
  private _ended = false;
  readonly attributes: Record<string, unknown> = {};
  status = { code: SpanStatusCode.UNSET };

  constructor(
    readonly name: string,
    options: SpanOptions = {},
    parentContext?: Context,
  ) {
    const ctx = parentContext ?? context.active();
    const parentSpanContext =
      trace.getSpan(ctx)?.spanContext() ??
      trace.getSpanContext(ctx);

    const traceId =
      parentSpanContext?.traceId &&
      parentSpanContext.traceId !== '00000000000000000000000000000000'
        ? parentSpanContext.traceId
        : generateRandomHex(16);

    const spanId = generateRandomHex(8);

    this._spanContext = {
      traceId,
      spanId,
      traceFlags: parentSpanContext?.traceFlags ?? TraceFlags.SAMPLED,
    };

    if (options.attributes) {
      Object.assign(this.attributes, options.attributes);
    }
  }

  spanContext(): SpanContext {
    return this._spanContext;
  }

  setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  addEvent(): this {
    return this;
  }

  addLink(): this {
    return this;
  }

  addLinks(): this {
    return this;
  }

  setStatus(status: { code: SpanStatusCode; message?: string }): this {
    this.status = status;
    return this;
  }

  updateName(): this {
    return this;
  }

  end(): void {
    this._ended = true;
  }

  isRecording(): boolean {
    return !this._ended;
  }

  recordException(error: Error | string): this {
    const msg = error instanceof Error ? error.message : String(error);
    this.attributes['exception.message'] = msg;
    if (error instanceof Error && error.stack) {
      this.attributes['exception.stacktrace'] = error.stack;
    }
    return this;
  }
}

/**
 * Built-in OpenTelemetry Tracer implementation.
 */
class RanuTracer implements Tracer {
  constructor(readonly name: string, readonly version?: string) {}

  startSpan(name: string, options: SpanOptions = {}, spanContext?: Context): Span {
    return new RanuSpan(name, options, spanContext);
  }

  startActiveSpan<F extends (span: Span) => unknown>(name: string, fn: F): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(name: string, options: SpanOptions, fn: F): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    spanContext: Context,
    fn: F,
  ): ReturnType<F>;
  startActiveSpan<F extends (span: Span) => unknown>(...args: any[]): ReturnType<F> {
    const name = args[0] as string;
    let options: SpanOptions = {};
    let parentContext: Context = ROOT_CONTEXT;
    let fn: F;

    if (args.length === 2) {
      fn = args[1] as F;
    } else if (args.length === 3) {
      options = args[1] as SpanOptions;
      fn = args[2] as F;
    } else {
      options = args[1] as SpanOptions;
      parentContext = args[2] as Context;
      fn = args[3] as F;
    }

    const span = this.startSpan(name, options, parentContext);
    const activeWithSpan = trace.setSpan(parentContext, span);
    return context.with(activeWithSpan, () => fn(span)) as ReturnType<F>;
  }
}

/**
 * Built-in W3C Trace Context Propagator.
 */
class W3CTraceContextPropagator implements TextMapPropagator {
  inject(ctx: Context, carrier: unknown, setter: TextMapSetter): void {
    const sc = trace.getSpan(ctx)?.spanContext() ?? trace.getSpanContext(ctx);
    if (!sc || !sc.traceId || !sc.spanId) return;
    const traceFlags = (sc.traceFlags ?? TraceFlags.SAMPLED).toString(16).padStart(2, '0');
    setter.set(carrier, 'traceparent', `00-${sc.traceId}-${sc.spanId}-${traceFlags}`);
  }

  extract(ctx: Context, carrier: unknown, getter: TextMapGetter): Context {
    const rawTraceParent = getter.get(carrier, 'traceparent');
    if (!rawTraceParent) return ctx;
    const traceParent = Array.isArray(rawTraceParent) ? rawTraceParent[0] : rawTraceParent;
    if (typeof traceParent !== 'string') return ctx;
    const match = traceParent.trim().match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/i);
    if (!match) return ctx;
    const [, , traceId, spanId, flags] = match;
    if (!traceId || !spanId || traceId === '00000000000000000000000000000000' || spanId === '0000000000000000') {
      return ctx;
    }
    const spanContext: SpanContext = {
      traceId,
      spanId,
      traceFlags: parseInt(flags ?? '01', 16) || TraceFlags.SAMPLED,
      isRemote: true,
    };
    return trace.setSpanContext(ctx, spanContext);
  }

  fields(): string[] {
    return ['traceparent'];
  }
}

/**
 * Built-in AsyncLocalStorage Context Manager.
 */
class AsyncLocalStorageContextManager {
  private storage = new AsyncLocalStorage<Context>();

  active(): Context {
    return this.storage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    ctx: Context,
    fn: F,
    thisArg?: unknown,
    ...args: A
  ): ReturnType<F> {
    return this.storage.run(ctx, () => fn.apply(thisArg, args));
  }

  enable(): this {
    return this;
  }

  disable(): this {
    return this;
  }

  bind<T>(_ctx: Context, target: T): T {
    return target;
  }
}

// Initialize OpenTelemetry global hooks with Ranu built-ins
try {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager());
} catch {
  // Already initialized or externally controlled
}

try {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
} catch {
  // Already initialized or externally controlled
}

class RanuTracerProvider {
  getTracer(name: string, version?: string): Tracer {
    return new RanuTracer(name, version);
  }
}

try {
  trace.setGlobalTracerProvider(new RanuTracerProvider());
} catch {
  // Already initialized or externally controlled
}

/**
 * Returns the OpenTelemetry tracer for Ranu.js.
 */
export function getTracer(name = TRACER_NAME, version = TRACER_VERSION): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Normalizes HTTP headers into a carrier dictionary suitable for W3C trace context extraction.
 */
export function headersToCarrier(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
): Record<string, string> {
  const carrier: Record<string, string> = {};
  if (!headers) {
    return carrier;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      carrier[key.toLowerCase()] = value;
    });
  } else if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        carrier[key.toLowerCase()] = value;
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
        carrier[key.toLowerCase()] = value[0];
      }
    }
  }
  return carrier;
}

/**
 * Extracts OpenTelemetry Context from incoming HTTP request headers using W3C traceparent.
 */
export function extractTraceContext(
  headers: Headers | Record<string, string | string[] | undefined> | undefined,
  parentContext: Context = ROOT_CONTEXT,
): Context {
  const carrier = headersToCarrier(headers);
  return propagation.extract(parentContext, carrier);
}

/**
 * Injects the current or specified OpenTelemetry context into outgoing HTTP headers carrier.
 */
export function injectTraceContext(
  carrier: Record<string, string>,
  activeContext?: Context,
): void {
  const ctx = activeContext ?? context.active();
  propagation.inject(ctx, carrier);
}

/**
 * Returns the currently active OpenTelemetry span, if any.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Extracts traceId and spanId from the currently active span or a given span.
 */
export function getTraceContext(span?: Span): { traceId?: string; spanId?: string } {
  const targetSpan = span ?? trace.getActiveSpan();
  if (!targetSpan) {
    return {};
  }
  const spanContext = targetSpan.spanContext();
  if (!spanContext || !spanContext.traceId || spanContext.traceId === '00000000000000000000000000000000') {
    return {};
  }
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

/**
 * Executes a function within the scope of a new OpenTelemetry span.
 * Manages span lifecycle, error recording, and status code.
 */
export function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
): Promise<T>;
export function withSpan<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T> | T,
  parentContext?: Context,
): Promise<T>;
export function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T> | T,
): Promise<T>;
export function withSpan<T>(
  tracer: Tracer,
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T> | T,
  parentContext?: Context,
): Promise<T>;
export async function withSpan<T>(...args: any[]): Promise<T> {
  let tracer: Tracer;
  let name: string;
  let options: SpanOptions = {};
  let fn: (span: Span) => Promise<T> | T;
  let parentContext: Context | undefined;

  if (typeof args[0] === 'string') {
    tracer = getTracer();
    name = args[0];
    if (typeof args[1] === 'function') {
      fn = args[1];
      parentContext = args[2];
    } else {
      options = args[1] ?? {};
      fn = args[2];
      parentContext = args[3];
    }
  } else {
    tracer = args[0];
    name = args[1];
    if (typeof args[2] === 'function') {
      fn = args[2];
      parentContext = args[3];
    } else {
      options = args[2] ?? {};
      fn = args[3];
      parentContext = args[4];
    }
  }

  const parent = parentContext ?? context.active();
  const span = tracer.startSpan(name, options, parent);
  const activeWithSpan = trace.setSpan(parent, span);

  return context.with(activeWithSpan, async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err: unknown) {
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
