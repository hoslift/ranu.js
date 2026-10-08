# Embedded SQLite with Ranu.js

SQLite is a lightweight, zero-configuration SQL database engine that runs directly within your application process. In **Ranu.js**, SQLite is an ideal choice for local prototyping, micro-services, and edge single-node production deployments.

---

## 1. Installation

Install `better-sqlite3` and its TypeScript definitions:

```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

---

## 2. Server Boundary Guard & Connection Singleton

Because SQLite operates as a native C++ binding directly touching the filesystem, it must **never** be bundled into client code. Ranu.js enforces this boundary using `@ranujs/core/server-only`.

Create a centralized database module in `lib/db.ts`:

```typescript
// lib/db.ts
import '@ranujs/core/server-only';
import Database from 'better-sqlite3';
import path from 'node:path';

// Store SQLite database in a persistent project directory
const dbPath = path.resolve(process.cwd(), 'data.db');

// Reuse singleton instance across Hot Module Replacement (HMR) in development
const globalForDb = globalThis as unknown as {
  sqliteDb?: Database.Database;
};

export const db: Database.Database =
  globalForDb.sqliteDb ??
  new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

// Optimize SQLite for high concurrency via Write-Ahead Logging (WAL)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sqliteDb = db;
}
```

> [!IMPORTANT]
> Always enable **WAL (Write-Ahead Logging)** mode via `db.pragma('journal_mode = WAL')`. This allows simultaneous readers and writers without database locking bottlenecks.

---

## 3. Schema Initialization

Run a schema migration or bootstrap script to ensure required tables exist:

```typescript
// lib/init-db.ts
import { db } from './db';

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

// Call once on server startup
initializeDatabase();
```

---

## 4. Querying SQLite in API Routes

Run prepared statements inside your Ranu.js route handlers (`app/api/users/route.ts`):

```typescript
// app/api/users/route.ts
import { db } from '@/lib/db';

interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export async function GET(): Promise<Response> {
  // Prepared statements prevent SQL injection
  const statement = db.prepare('SELECT id, email, name, created_at FROM users ORDER BY created_at DESC');
  const users = statement.all() as UserRow[];

  return Response.json({ users });
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { email?: string; name?: string };

  if (!body.email || !body.name) {
    return Response.json({ error: 'Email and name are required.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const insertStatement = db.prepare(
    'INSERT INTO users (id, email, name) VALUES (?, ?, ?)'
  );

  try {
    insertStatement.run(id, body.email, body.name);
    return Response.json({ id, email: body.email, name: body.name }, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message.includes('UNIQUE constraint failed')) {
      return Response.json({ error: 'Email already exists.' }, { status: 409 });
    }
    return Response.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
```

---

## 5. Security & Deployment Best Practices

1. **Keep DB Files Out of Git:** Add `*.db`, `*.db-wal`, and `*.db-shm` to your `.gitignore`:
   ```gitignore
   # SQLite databases
   *.db
   *.db-wal
   *.db-shm
   ```
2. **Prepared Statements:** Always use parameterized queries (`db.prepare('... WHERE id = ?').get(id)`) instead of string interpolation to prevent SQL injection.
3. **Container Volumes:** When deploying with Docker or container environments, ensure the directory containing `data.db` is mounted on a persistent volume so data persists across container redeployments.
