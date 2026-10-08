# Production PostgreSQL with Ranu.js

PostgreSQL is a robust, open-source object-relational database system suited for scalable, mission-critical SaaS architectures. In **Ranu.js**, applications connect to PostgreSQL using standard connection pooling libraries such as `pg` (`node-postgres`).

---

## 1. Installation

Install the PostgreSQL driver and TypeScript typings:

```bash
pnpm add pg
pnpm add -D @types/pg
```

---

## 2. Environment Configuration

Define your PostgreSQL connection URL in `.env.local`:

```bash
# .env.local
DATABASE_URL="postgres://ranu_user:secret_password@localhost:5432/ranu_production?sslmode=prefer"
```

> [!CAUTION]
> Never commit `.env.local` or raw database credentials into version control. Ensure `.env*` is listed in `.gitignore`.

---

## 3. Connection Pooling Singleton

Opening a new database connection on every incoming HTTP request causes socket exhaustion under high traffic. Use a connection pool (`Pool`) cached on `globalThis` to survive development Hot Module Replacement (HMR):

```typescript
// lib/postgres.ts
import '@ranujs/core/server-only';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not defined.');
}

const globalForPg = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString,
    max: 20, // Maximum active connections in pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Error out if connection acquisition takes > 5s
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pgPool = pool;
}

/**
 * Helper to run parameterized queries safely
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = performance.now();
  const res = await pool.query<T>(text, params);
  const duration = (performance.now() - start).toFixed(2);

  if (process.env.NODE_ENV === 'development') {
    console.log(`[SQL Query] ${text} - ${duration}ms (rows: ${res.rowCount})`);
  }

  return res;
}
```

---

## 4. Executing Queries in Route Handlers

Use parameterized queries inside your Ranu.js API endpoints (`app/api/organizations/route.ts`):

```typescript
// app/api/organizations/route.ts
import { query } from '@/lib/postgres';

interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export async function GET(): Promise<Response> {
  try {
    const { rows } = await query<Organization>(
      'SELECT id, name, created_at FROM organizations ORDER BY created_at DESC'
    );
    return Response.json({ organizations: rows });
  } catch (err: unknown) {
    console.error('Failed to fetch organizations:', err);
    return Response.json({ error: 'Database query failed.' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { name?: string };

  if (!body.name || typeof body.name !== 'string') {
    return Response.json({ error: 'Valid name is required.' }, { status: 400 });
  }

  try {
    const { rows } = await query<Organization>(
      `INSERT INTO organizations (id, name, created_at)
       VALUES (gen_random_uuid(), $1, NOW())
       RETURNING id, name, created_at`,
      [body.name.trim()]
    );

    return Response.json({ organization: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    console.error('Failed to create organization:', err);
    return Response.json({ error: 'Database insert failed.' }, { status: 500 });
  }
}
```

---

## 5. Transaction Support

For operations modifying multiple records atomically, acquire a dedicated client from the pool:

```typescript
// lib/transaction-example.ts
import { pool } from '@/lib/postgres';

export async function transferBalance(
  senderId: string,
  receiverId: string,
  amount: number
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
      [amount, senderId]
    );

    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, receiverId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release(); // Return client back to the pool
  }
}
```

---

## 6. Production Hardening Checklist

| Feature | Best Practice |
| :--- | :--- |
| **Server-Only Guard** | Always import `@ranujs/core/server-only` in DB modules to prevent bundle leaks |
| **Pool Capacity** | Set `max` according to your deployment target (e.g., 5-10 for serverless/edge, 20-50 for containers) |
| **SSL Enforcement** | Use TLS/SSL connections in production to prevent plain-text traffic on external networks |
| **Parameterized Queries** | Always pass values via `$1, $2` parameters; never concatenate raw user input into SQL strings |
