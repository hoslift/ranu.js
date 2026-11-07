import { getTraceContext } from './tracer.js';
import { getActiveRequestContext } from '../context.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface HttpLogMeta {
  readonly method?: string | undefined;
  readonly pathname?: string | undefined;
  readonly status?: number | undefined;
  readonly durationMs?: number | undefined;
}

export interface StructuredLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly requestId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly traceId?: string | undefined;
  readonly spanId?: string | undefined;
  readonly http?: HttpLogMeta | undefined;
  readonly error?: {
    readonly name?: string;
    readonly message?: string;
    readonly stack?: string;
  } | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly [key: string]: unknown;
}

export type LogSink = (entry: StructuredLogEntry, json: string) => void;

export function createJsonLogSink(stream?: { write: (str: string) => void }): LogSink {
  return (entry, json) => {
    const jsonStr = json ?? JSON.stringify(entry);
    if (stream) {
      stream.write(jsonStr);
    } else if (entry.level === 'ERROR' || entry.level === 'WARN') {
      if (typeof process !== 'undefined' && process.stderr && typeof process.stderr.write === 'function') {
        process.stderr.write(json + '\n');
      } else {
        console.error(json);
      }
    } else {
      if (typeof process !== 'undefined' && process.stdout && typeof process.stdout.write === 'function') {
        process.stdout.write(json + '\n');
      } else {
        console.log(json);
      }
    }
  };
}

let activeRequestIdGetter: (() => string | undefined) | undefined;

export function registerRequestIdGetter(getter: () => string | undefined): () => void {
  activeRequestIdGetter = getter;
  return () => {
    if (activeRequestIdGetter === getter) {
      activeRequestIdGetter = undefined;
    }
  };
}

function resolveActiveRequestId(): string | undefined {
  if (activeRequestIdGetter) {
    return activeRequestIdGetter();
  }
  try {
    return getActiveRequestContext()?.requestId;
  } catch {
    return undefined;
  }
}

const defaultLogSink: LogSink = createJsonLogSink();
const activeSinks = new Set<LogSink>([defaultLogSink]);

export function addLogSink(sink: LogSink): () => void {
  activeSinks.add(sink);
  return () => {
    activeSinks.delete(sink);
  };
}

export function removeLogSink(sink: LogSink): void {
  activeSinks.delete(sink);
}

export function setLogSink(sink: LogSink): void {
  activeSinks.clear();
  activeSinks.add(sink);
}

export function resetLogSink(): void {
  activeSinks.clear();
  activeSinks.add(defaultLogSink);
}

function emitLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): StructuredLogEntry {
  const { traceId, spanId } = getTraceContext();
  const contextRequestId = resolveActiveRequestId();

  const timestamp = new Date().toISOString();
  const rawId = meta?.correlationId ?? meta?.requestId;
  const requestId = typeof rawId === 'string' ? rawId : contextRequestId;
  const correlationId = requestId;

  const entry: StructuredLogEntry = {
    timestamp,
    level,
    message,
    ...(requestId ? { requestId, correlationId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(spanId ? { spanId } : {}),
    metadata: meta,
    ...meta,
  };

  const json = JSON.stringify(entry);
  for (const sink of activeSinks) {
    sink(entry, json);
  }
  return entry;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): StructuredLogEntry;
  warn(message: string, meta?: Record<string, unknown>): StructuredLogEntry;
  error(message: string | Error, meta?: Record<string, unknown>): StructuredLogEntry;
  logRequest(data: {
    method: string;
    pathname?: string | undefined;
    path?: string | undefined;
    status?: number | undefined;
    statusCode?: number | undefined;
    durationMs: number;
    requestId?: string | undefined;
    correlationId?: string | undefined;
    traceId?: string | undefined;
    spanId?: string | undefined;
    meta?: Record<string, unknown> | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): StructuredLogEntry;
  addSink(sink: LogSink): () => void;
  removeSink(sink: LogSink): void;
  setSink(sink: LogSink): void;
  resetSink(): void;
}

export const logger: Logger = {
  info(message: string, meta?: Record<string, unknown>): StructuredLogEntry {
    return emitLog('INFO', message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): StructuredLogEntry {
    return emitLog('WARN', message, meta);
  },

  error(message: string | Error, meta?: Record<string, unknown>): StructuredLogEntry {
    if (message instanceof Error) {
      const errorMeta = {
        name: message.name,
        message: message.message,
        stack: message.stack,
      };
      return emitLog('ERROR', message.message, {
        error: errorMeta,
        ...meta,
      });
    }
    return emitLog('ERROR', message, meta);
  },

  logRequest(data: {
    method: string;
    pathname?: string | undefined;
    path?: string | undefined;
    status?: number | undefined;
    statusCode?: number | undefined;
    durationMs: number;
    requestId?: string | undefined;
    correlationId?: string | undefined;
    traceId?: string | undefined;
    spanId?: string | undefined;
    meta?: Record<string, unknown> | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): StructuredLogEntry {
    const status = data.status ?? data.statusCode ?? 200;
    const pathname = data.pathname ?? data.path ?? '/';
    const requestId = data.requestId ?? data.correlationId;
    const meta = data.meta ?? data.metadata ?? {};

    const level: LogLevel =
      status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
    const msg = `HTTP ${data.method.toUpperCase()} ${pathname} ${status} in ${data.durationMs.toFixed(2)}ms`;

    const httpMeta: HttpLogMeta = {
      method: data.method.toUpperCase(),
      pathname,
      status,
      durationMs: Number(data.durationMs.toFixed(2)),
    };

    return emitLog(level, msg, {
      http: httpMeta,
      ...(requestId ? { requestId, correlationId: requestId } : {}),
      ...(data.traceId ? { traceId: data.traceId } : {}),
      ...(data.spanId ? { spanId: data.spanId } : {}),
      metadata: {
        statusCode: status,
        durationMs: data.durationMs,
        ...meta,
      },
      ...meta,
    });
  },

  addSink(sink: LogSink): () => void {
    return addLogSink(sink);
  },

  removeSink(sink: LogSink): void {
    removeLogSink(sink);
  },

  setSink(sink: LogSink): void {
    setLogSink(sink);
  },

  resetSink(): void {
    resetLogSink();
  },
};
