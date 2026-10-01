export async function GET() {
  return Response.json({
    metrics: {
      uptimeSeconds: process.uptime(),
      memoryRssBytes: process.memoryUsage().rss,
      cpuUserTimeUs: process.cpuUsage().user,
    },
    service: 'ranu-dashboard-telemetry',
    timestamp: new Date().toISOString(),
  });
}
