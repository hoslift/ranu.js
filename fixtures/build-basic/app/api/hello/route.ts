export async function GET(_req: Request) {
  return Response.json({ message: 'Hello from Ranu API' });
}

export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ received: body });
}
