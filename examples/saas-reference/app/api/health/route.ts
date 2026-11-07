export async function GET() {
  return Response.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    framework: 'Ranu.js',
    features: ['server-actions', 'isr', 'tailwind-styling'],
  });
}
