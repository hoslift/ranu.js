interface User {
  id: number;
  name: string;
  role: string;
}

const mockUsers: User[] = [
  { id: 1, name: 'Alice Smith', role: 'Engineer' },
  { id: 2, name: 'Bob Jones', role: 'Architect' },
  { id: 3, name: 'Charlie Day', role: 'Product Lead' },
];

export async function GET() {
  return Response.json({
    users: mockUsers,
    total: mockUsers.length,
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { name?: string; role?: string };
    if (!payload.name) {
      return Response.json({ error: 'Field "name" is required.' }, { status: 400 });
    }

    const newUser: User = {
      id: mockUsers.length + 1,
      name: payload.name,
      role: payload.role || 'Member',
    };
    mockUsers.push(newUser);

    return Response.json({ success: true, user: newUser }, { status: 201 });
  } catch {
    return Response.json({ error: 'Invalid JSON body provided.' }, { status: 400 });
  }
}
