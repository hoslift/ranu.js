import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';
import { createProductionServer } from '@ranu/runtime-node';
import { logger, type StructuredLogEntry } from '@ranu/runtime';

describe('Production Observability & Telemetry Integration', () => {
  let tempDir: string;
  let capturedLogs: StructuredLogEntry[] = [];
  let unsubscribeLogSink: (() => void) | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-telemetry-int-'));
    capturedLogs = [];
    unsubscribeLogSink = logger.addSink((entry) => {
      capturedLogs.push(entry);
    });

    const appDir = path.join(tempDir, 'app');
    const apiDir = path.join(appDir, 'api', 'trace');
    const publicDir = path.join(tempDir, 'public');

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    // 1. Root Layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head><title>Telemetry Monitored App</title></head>
      <body>{children}</body>
    </html>
  );
}`,
    );

    // 2. SSR Page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import { getRequestContext } from '@ranu/server';

export default function HomePage() {
  const ctx = getRequestContext();
  return (
    <main>
      <h1>Telemetry Home Page</h1>
      <p id="req-id">{ctx.requestId}</p>
    </main>
  );
}`,
    );

    // 3. API Route with Trace Context inspection
    fs.writeFileSync(
      path.join(apiDir, 'route.ts'),
      `import { getRequestContext } from '@ranu/server';

export async function GET() {
  const ctx = getRequestContext();
  return Response.json({
    status: 'ok',
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  });
}`,
    );

    // 4. Middleware
    fs.writeFileSync(
      path.join(tempDir, 'middleware.ts'),
      `export default async function middleware(req: Request) {
  return {
    type: 'next',
    headers: {
      'x-monitored-by': 'ranu-telemetry',
    },
  };
}`,
    );
  });

  afterEach(() => {
    if (unsubscribeLogSink) {
      unsubscribeLogSink();
      unsubscribeLogSink = undefined;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('executes full telemetry lifecycle: tracing, x-request-id correlation, JSON logs, and Prometheus metrics', async () => {
    // 1. Production Build
    const buildResult = await build({
      projectRoot: tempDir,
      sourceMaps: false,
    });
    expect(buildResult.success).toBe(true);

    const buildDir = path.join(tempDir, '.ranu', 'build');
    expect(fs.existsSync(path.join(buildDir, 'build.json'))).toBe(true);

    // 2. Create and start production server with telemetry enabled
    const server = await createProductionServer({
      projectRoot: tempDir,
      buildDir,
      port: 0,
      host: '127.0.0.1',
    });

    const addr = await server.listen(0, '127.0.0.1');
    expect(addr.port).toBeGreaterThan(0);
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 3. Test Trace Context Extraction & Request ID Propagation via API Route
      const testTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const testSpanId = '00f067aa0ba902b7';
      const customRequestId = 'test-custom-client-req-999';

      const apiRes = await fetch(`${baseUrl}/api/trace`, {
        headers: {
          traceparent: `00-${testTraceId}-${testSpanId}-01`,
          'x-request-id': customRequestId,
        },
      });

      expect(apiRes.status).toBe(200);
      expect(apiRes.headers.get('x-request-id')).toBe(customRequestId);
      expect(apiRes.headers.get('x-monitored-by')).toBe('ranu-telemetry');

      const apiData = await apiRes.json();
      expect(apiData.status).toBe('ok');
      expect(apiData.requestId).toBe(customRequestId);
      expect(apiData.traceId).toBe(testTraceId);

      // 4. Test Auto-Generated UUID v4 x-request-id on SSR page
      const ssrRes = await fetch(`${baseUrl}/`);
      expect(ssrRes.status).toBe(200);
      const generatedRequestId = ssrRes.headers.get('x-request-id');
      expect(generatedRequestId).toBeDefined();
      expect(generatedRequestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const html = await ssrRes.text();
      expect(html).toContain('Telemetry Home Page');
      expect(html).toContain(generatedRequestId);

      // 5. Test Structured JSON Logging Capture
      const matchingLog = capturedLogs.find(
        (entry) =>
          entry.requestId === customRequestId || entry.correlationId === customRequestId,
      );
      expect(matchingLog).toBeDefined();
      if (matchingLog) {
        expect(matchingLog.level).toBe('INFO');
        expect(matchingLog.timestamp).toBeDefined();
        expect(matchingLog.http?.method).toBe('GET');
        expect(matchingLog.http?.status).toBe(200);
        expect(matchingLog.http?.durationMs).toBeGreaterThan(0);
      }

      // 6. Test Direct GET /metrics Endpoint (Prometheus Text Format)
      const metricsRes = await fetch(`${baseUrl}/metrics`);
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.headers.get('content-type')).toBe(
        'text/plain; version=0.0.4; charset=utf-8',
      );
      expect(metricsRes.headers.get('cache-control')).toBe('no-store');

      const metricsText = await metricsRes.text();
      expect(metricsText).toContain('# TYPE ranu_http_requests_total counter');
      expect(metricsText).toContain('ranu_http_requests_total');
      expect(metricsText).toContain('# TYPE ranu_http_request_duration_seconds histogram');
      expect(metricsText).toContain('ranu_http_request_duration_seconds');
      expect(metricsText).toContain('# TYPE ranu_http_requests_active gauge');
      expect(metricsText).toContain('# TYPE ranu_ssr_render_duration_seconds histogram');
    } finally {
      await server.close();
    }
  });
});
