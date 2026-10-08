# Prisma ORM Setup & Best Practices

**Prisma** is an open-source next-generation ORM featuring a declarative modeling language, automated migrations, and type-safe query generation. In **Ranu.js**, Prisma provides a rich developer experience for building enterprise data models.

---

## 1. Installation

Install Prisma CLI as a development dependency and the Prisma Client runtime:

```bash
pnpm add @prisma/client
pnpm add -D prisma
```

Initialize your Prisma project:

```bash
pnpm prisma init
```

This creates a `prisma/schema.prisma` file and a `.env` template.

---

## 2. Defining Your Schema

Configure your datasource and models in `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
}
```

Run migrations to sync your schema with the database:

```bash
pnpm prisma migrate dev --name init
```

---

## 3. Client Singleton & HMR Caching

In development mode, Ranu.js re-evaluates server files upon edits (Hot Module Replacement). If `new PrismaClient()` is called directly in module scope without caching, each reload creates an extra connection pool, eventually exhausting database connections (`Too many clients already open`).

Instantiate Prisma safely in `lib/prisma.ts`:

```typescript
// lib/prisma.ts
import '@ranujs/core/server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

> [!IMPORTANT]
> Always include `import '@ranujs/core/server-only'` at the top of your Prisma client file. This prevents the Prisma query engine from accidentally entering client-side browser bundles.

---

## 4. Querying in Route Handlers

Use Prisma's generated client inside your API routes (`app/api/users/route.ts`):

```typescript
// app/api/users/route.ts
import { prisma } from '@/lib/prisma';

export async function GET(): Promise<Response> {
  try {
    const users = await prisma.user.findMany({
      include: {
        posts: {
          select: {
            id: true,
            title: true,
            published: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Response.json({ users });
  } catch (error) {
    console.error('Prisma query error:', error);
    return Response.json({ error: 'Failed to fetch users.' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { email?: string; name?: string };

  if (!body.email || !body.name) {
    return Response.json({ error: 'Email and name are required.' }, { status: 400 });
  }

  try {
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
      },
    });

    return Response.json({ user: newUser }, { status: 201 });
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code === 'P2002') {
      return Response.json({ error: 'Email is already registered.' }, { status: 409 });
    }
    return Response.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
```

---

## 5. Deployment & Production Checklist

1. **Build Step Hook:** Add `prisma generate` to your build script in `package.json` so the client is generated inside CI/CD environments before compiling Ranu.js:
   ```json
   {
     "scripts": {
       "build": "prisma generate && ranu build"
     }
   }
   ```
2. **Connection Pooling in Serverless:** When deploying to serverless platforms, use Prisma Accelerate or a connection pooler like PgBouncer, appending `?pgbouncer=true` to the connection string.
3. **Graceful Disconnect:** In long-running containerized servers, disconnect on shutdown signals (`SIGINT`, `SIGTERM`):
   ```typescript
   process.on('SIGINT', async () => {
     await prisma.$disconnect();
     process.exit(0);
   });
   ```
