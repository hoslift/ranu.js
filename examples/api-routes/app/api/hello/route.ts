export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'World';

  return Response.json({
    status: 'ok',
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  });
}
