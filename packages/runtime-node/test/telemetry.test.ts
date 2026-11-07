import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RanuServerRuntime,
  getTracer,
  extractTraceContext,
  injectTraceContext,
  withSpan,
  getActiveSpan,
  getTraceContext,
  logger,
  Logger,
  createJsonLogSink,
  type LogSink,
  type StructuredLogEntry,
  getMetrics,
  recordMetric,
  PrometheusRegistry,
  type MetricsProvider,
  type RanuRequestContext,
  type ApiDispatcher,
  type StaticDispatcher,
  type ReactRendererLike,
} from '@ranu/runtime';
import { NodeRequestContextStore } from '../src/index.js';

describe('Production Observability & Telemetry Subsystem', () => {
  let contextStore: NodeRequestContextStore;

  beforeEach(() => {
    contextStore = new NodeRequestContextStore();
  });

  describe('OpenTelemetry Tracing & Context Propagation', () => {
    it('extracts W3C traceparent carrier headers into valid OpenTelemetry context', () => {
      const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const spanId = '00f067aa0ba902b7';
      const carrier = {
        traceparent: `00-${traceId}-${spanId}-01`,
      };

      const ctx = extractTraceContext(carrier);
      expect(ctx).toBeDefined();

      const tracer = getTracer('test');
      const span = tracer.startSpan('extracted-span', {}, ctx);
      expect(span.spanContext().traceId).toBe(traceId);
    });

    it('injects W3C traceparent into carrier object from active span', async () => {
      const tracer = getTracer('test-tracer');
      await withSpan('test.operation', async (span) => {
        expect(span).toBeDefined();
        const active = getActiveSpan();
        expect(active).toBeDefined();

        const traceCtx = getTraceContext();
        expect(traceCtx).toBeDefined();
        expect(traceCtx?.traceId).toBeDefined();
        expect(traceCtx?.spanId).toBeDefined();

        const carrier: Record<string, string> = {};
        injectTraceContext(carrier);
        expect(carrier.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      });
    });

    it('creates root SERVER span and child spans across middleware, SSR, and API dispatches', async () => {
      let dispatchedWithSpan = false;

      const mockApiDispatcher: ApiDispatcher = {
        async dispatch(req, ctx, target) {
          const activeSpan = getActiveSpan();
          expect(activeSpan).toBeDefined();
          expect(activeSpan?.spanContext().traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
          dispatchedWithSpan = true;
          return Response.json({ ok: true });
        },
      };

      const mockStaticDispatcher: StaticDispatcher = {
        async dispatch() {
          return new Response('Not Found', { status: 404 });
        },
      };

      const mockRenderer: ReactRendererLike = {
        async render(req, ctx, target) {
          return new Response('<html><body>Rendered</body></html>', {
            headers: { 'Content-Type': 'text/html' },
          });
        },
      };

      const runtime = new RanuServerRuntime({
        routeRecords: [
          {
            routeId: 'api:/api/data',
            kind: 'api',
            pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'data' }] },
            pathnameTemplate: '/api/data',
            params: [],
            methods: ['GET'],
            layouts: [],
            errors: [],
          },
        ],
        contextStore,
        apiDispatcher: mockApiDispatcher,
        staticDispatcher: mockStaticDispatcher,
        renderer: mockRenderer,
        config: { mode: 'development' },
        telemetry: { enabled: true },
      });

      const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const incomingSpanId = '00f067aa0ba902b7';
      const req = new Request('http://localhost:3000/api/data', {
        headers: {
          traceparent: `00-${incomingTraceId}-${incomingSpanId}-01`,
        },
      });

      const res = await runtime.handle(req);
      expect(res.status).toBe(200);
      expect(dispatchedWithSpan).toBe(true);

      const data = await res.json();
      expect(data).toEqual({ ok: true });
    });
  });

  describe('Correlation ID (x-request-id) Lifecycle', () => {
    it('preserves existing x-request-id from request header into context and response header', async () => {
      let capturedContext: RanuRequestContext | null = null;

      const mockApiDispatcher: ApiDispatcher = {
        async dispatch(req, ctx) {
          capturedContext = ctx;
          return Response.json({ ok: true });
        },
      };

      const runtime = new RanuServerRuntime({
        routeRecords: [
          {
            routeId: 'api:/test-id',
            kind: 'api',
            pattern: { segments: [{ kind: 'static', value: 'test-id' }] },
            pathnameTemplate: '/test-id',
            params: [],
            methods: ['GET'],
            layouts: [],
            errors: [],
          },
        ],
        contextStore,
        apiDispatcher: mockApiDispatcher,
        staticDispatcher: { async dispatch() { return new Response('404', { status: 404 }); } },
        renderer: { async render() { return new Response('404', { status: 404 }); } },
        config: { mode: 'development' },
      });

      const customRequestId = 'client-req-uuid-987654';
      const req = new Request('http://localhost:3000/test-id', {
        headers: { 'x-request-id': customRequestId },
      });

      const res = await runtime.handle(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe(customRequestId);
      expect(capturedContext?.requestId).toBe(customRequestId);
    });

    it('generates a valid UUID v4 when request does not provide x-request-id', async () => {
      let capturedContext: RanuRequestContext | null = null;

      const mockApiDispatcher: ApiDispatcher = {
        async dispatch(req, ctx) {
          capturedContext = ctx;
          return Response.json({ generated: true });
        },
      };

      const runtime = new RanuServerRuntime({
        routeRecords: [
          {
            routeId: 'api:/auto-id',
            kind: 'api',
            pattern: { segments: [{ kind: 'static', value: 'auto-id' }] },
            pathnameTemplate: '/auto-id',
            params: [],
            methods: ['GET'],
            layouts: [],
            errors: [],
          },
        ],
        contextStore,
        apiDispatcher: mockApiDispatcher,
        staticDispatcher: { async dispatch() { return new Response('404', { status: 404 }); } },
        renderer: { async render() { return new Response('404', { status: 404 }); } },
        config: { mode: 'development' },
      });

      const req = new Request('http://localhost:3000/auto-id');
      const res = await runtime.handle(req);

      expect(res.status).toBe(200);
      const resRequestId = res.headers.get('x-request-id');
      expect(resRequestId).toBeDefined();
      expect(resRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(capturedContext?.requestId).toBe(resRequestId);
    });
  });

  describe('Structured JSON Logging Subsystem', () => {
    let capturedLogs: StructuredLogEntry[] = [];
    const testSink: LogSink = (entry) => {
      capturedLogs.push(entry);
    };

    beforeEach(() => {
      capturedLogs = [];
      logger.addSink(testSink);
    });

    afterEach(() => {
      logger.removeSink(testSink);
    });

    it('emits structured JSON entries for info, warn, and error with timestamps', () => {
      logger.info('System startup initiated', { component: 'runtime' });
      logger.warn('High memory usage threshold reached', { memMb: 512 });
      logger.error('Unhandled database timeout', { error: 'ECONNREFUSED' });

      expect(capturedLogs.length).toBe(3);

      expect(capturedLogs[0].level).toBe('INFO');
      expect(capturedLogs[0].message).toBe('System startup initiated');
      expect(capturedLogs[0].metadata?.component).toBe('runtime');
      expect(capturedLogs[0].timestamp).toBeDefined();

      expect(capturedLogs[1].level).toBe('WARN');
      expect(capturedLogs[1].message).toBe('High memory usage threshold reached');
      expect(capturedLogs[1].metadata?.memMb).toBe(512);

      expect(capturedLogs[2].level).toBe('ERROR');
      expect(capturedLogs[2].message).toBe('Unhandled database timeout');
      expect(capturedLogs[2].metadata?.error).toBe('ECONNREFUSED');
    });

    it('records request completion with latency timers via logger.logRequest', () => {
      logger.logRequest({
        method: 'POST',
        path: '/api/v1/checkout',
        statusCode: 201,
        durationMs: 42.85,
        requestId: 'req-corr-1234',
        traceId: 'trace-abc-789',
        spanId: 'span-001',
      });

      expect(capturedLogs.length).toBe(1);
      const entry = capturedLogs[0];
      expect(entry.level).toBe('INFO');
      expect(entry.message).toContain('POST /api/v1/checkout 201');
      expect(entry.correlationId).toBe('req-corr-1234');
      expect(entry.traceId).toBe('trace-abc-789');
      expect(entry.spanId).toBe('span-001');
      expect(entry.metadata?.durationMs).toBe(42.85);
      expect(entry.metadata?.statusCode).toBe(201);
    });

    it('formats JSON string accurately via createJsonLogSink', () => {
      const writtenLines: string[] = [];
      const stream = {
        write: (str: string) => {
          writtenLines.push(str);
        },
      };

      const jsonSink = createJsonLogSink(stream);
      jsonSink({
        timestamp: '2026-11-05T12:00:00.000Z',
        level: 'INFO',
        message: 'Telemetry test message',
        correlationId: 'corr-xyz',
        metadata: { key: 'value' },
      });

      expect(writtenLines.length).toBe(1);
      const parsed = JSON.parse(writtenLines[0]);
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('Telemetry test message');
      expect(parsed.correlationId).toBe('corr-xyz');
      expect(parsed.metadata.key).toBe('value');
    });
  });

  describe('Prometheus Metrics & Direct GET /metrics Exposition', () => {
    it('records counters, gauges, and histograms conforming to Prometheus text format 0.0.4', async () => {
      const registry = new PrometheusRegistry();

      registry.increment('ranu_http_requests_total', 1, { method: 'GET', status: '200' });
      registry.increment('ranu_http_requests_total', 2, { method: 'GET', status: '200' });
      registry.gauge('ranu_http_requests_active', 14);
      registry.record('ranu_http_request_duration_seconds', 0.045, { method: 'GET' });

      const exposition = await registry.getMetricsText();

      expect(exposition).toContain('# TYPE ranu_http_requests_total counter');
      expect(exposition).toContain('ranu_http_requests_total{method="GET",status="200"} 3');

      expect(exposition).toContain('# TYPE ranu_http_requests_active gauge');
      expect(exposition).toContain('ranu_http_requests_active 14');

      expect(exposition).toContain('# TYPE ranu_http_request_duration_seconds histogram');
      expect(exposition).toContain('ranu_http_request_duration_seconds_count{method="GET"} 1');
      expect(exposition).toContain('ranu_http_request_duration_seconds_sum{method="GET"} 0.045');
      expect(exposition).toContain('ranu_http_request_duration_seconds_bucket{method="GET",le="+Inf"} 1');
    });

    it('exposes direct GET /metrics endpoint in runtime engine with standard Prometheus headers', async () => {
      const runtime = new RanuServerRuntime({
        routeRecords: [],
        contextStore,
        apiDispatcher: { async dispatch() { return new Response('404', { status: 404 }); } },
        staticDispatcher: { async dispatch() { return new Response('404', { status: 404 }); } },
        renderer: { async render() { return new Response('404', { status: 404 }); } },
        config: { mode: 'development' },
        metrics: { enabled: true, endpoint: '/metrics' },
      });

      const req = new Request('http://localhost:3000/metrics');
      const res = await runtime.handle(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(res.headers.get('cache-control')).toBe('no-store');

      const body = await res.text();
      expect(body).toContain('# TYPE ranu_http_requests_total counter');
      expect(body).toContain('# TYPE ranu_http_requests_active gauge');
      expect(body).toContain('# TYPE ranu_http_request_duration_seconds histogram');
      expect(body).toContain('# TYPE ranu_ssr_render_duration_seconds histogram');
    });

    it('supports pluggable custom MetricsProvider interface', async () => {
      const customCounters: Record<string, number> = {};
      const customProvider: MetricsProvider = {
        increment(name, value = 1, labels) {
          const key = `${name}:${JSON.stringify(labels ?? {})}`;
          customCounters[key] = (customCounters[key] ?? 0) + value;
        },
        gauge: vi.fn(),
        record: vi.fn(),
        getMetricsText: () => '# custom metrics format\ncustom_metric 42\n',
      };

      const runtime = new RanuServerRuntime({
        routeRecords: [
          {
            routeId: 'api:/ping',
            kind: 'api',
            pattern: { segments: [{ kind: 'static', value: 'ping' }] },
            pathnameTemplate: '/ping',
            params: [],
            methods: ['GET'],
            layouts: [],
            errors: [],
          },
        ],
        contextStore,
        apiDispatcher: { async dispatch() { return Response.json({ pong: true }); } },
        staticDispatcher: { async dispatch() { return new Response('404', { status: 404 }); } },
        renderer: { async render() { return new Response('404', { status: 404 }); } },
        config: { mode: 'development' },
        metrics: { provider: customProvider, endpoint: '/custom-metrics' },
      });

      // Handle a normal request which increments request count
      const pingReq = new Request('http://localhost:3000/ping');
      const pingRes = await runtime.handle(pingReq);
      expect(pingRes.status).toBe(200);

      const metricsReq = new Request('http://localhost:3000/custom-metrics');
      const metricsRes = await runtime.handle(metricsReq);
      expect(metricsRes.status).toBe(200);
      const metricsText = await metricsRes.text();
      expect(metricsText).toBe('# custom metrics format\ncustom_metric 42\n');
    });
  });
});
