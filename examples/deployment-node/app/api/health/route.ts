export async function GET() {
  return Response.json(
    {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
    },
    { status: 200 },
  );
}
