# Type-Safe Database Access with Drizzle ORM

**Drizzle ORM** is a lightweight, headless TypeScript ORM that provides end-to-end type safety with zero runtime overhead and standard SQL semantics. It pairs seamlessly with **Ranu.js** for high-performance server-side data access.

---

## 1. Installation

Install Drizzle ORM alongside PostgreSQL or SQLite drivers, plus `drizzle-kit` for migrations:

```bash
# For PostgreSQL:
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg

# Or for SQLite:
# pnpm add drizzle-orm better-sqlite3
# pnpm add -D drizzle-kit @types/better-sqlite3
```

---

## 2. Defining Schema

Create your database schema using Drizzle's type-safe schema builders in `lib/schema.ts`:

```typescript
// lib/schema.ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorId: uuid('author_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Infer TypeScript types directly from schema definitions
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

---

## 3. Database Client Setup

Instantiate the Drizzle client with `@ranujs/core/server-only` to guarantee that database queries remain exclusively on the server:

```typescript
// lib/db.ts
import '@ranujs/core/server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

---

## 4. Drizzle Configuration & Migrations

Create `drizzle.config.ts` in the project root:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
```

Add migration scripts to your `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

Run `pnpm db:generate` to generate SQL migration files, then apply them with `pnpm db:migrate`.

---

## 5. Type-Safe Queries in Route Handlers

Query your schema using Drizzle's Relational Queries or standard SQL builders:

```typescript
// app/api/posts/route.ts
import { db } from '@/lib/db';
import { posts, users } from '@/lib/schema';
import { eq } from 'drizzle-orm';

export async function GET(): Promise<Response> {
  // Join query with full autocomplete and type safety
  const allPosts = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      authorName: users.name,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .innerJoin(users, eq(posts.authorId, users.id));

  return Response.json({ posts: allPosts });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    title?: string;
    content?: string;
    authorId?: string;
  };

  if (!body.title || !body.content || !body.authorId) {
    return Response.json({ error: 'Missing required post fields.' }, { status: 400 });
  }

  const [newPost] = await db
    .insert(posts)
    .values({
      title: body.title,
      content: body.content,
      authorId: body.authorId,
    })
    .returning();

  return Response.json({ post: newPost }, { status: 201 });
}
```

---

## 6. Key Advantages with Ranu.js

* **No Code-Gen Daemon:** Drizzle relies on pure TypeScript type inference without requiring heavy background code generation steps.
* **Cold-Start Efficiency:** Minimal bundle overhead makes Drizzle ideal for fast serverless boot times.
* **Strict Boundary Enforcement:** By guarding `lib/db.ts` with `@ranujs/core/server-only`, client components importing types from `lib/schema.ts` never accidentally bundle the database driver or credentials.
