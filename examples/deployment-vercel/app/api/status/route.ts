export async function GET() {
  return Response.json({
    platform: 'vercel',
    status: 'operational',
    region: process.env.VERCEL_REGION || 'local-dev',
    timestamp: new Date().toISOString(),
  });
}
