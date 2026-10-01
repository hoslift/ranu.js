# Ranu.js API Routes Example

This example demonstrates how to build server API endpoints in **Ranu.js** using standard Web `Request` and `Response` interfaces.

## Concepts Demonstrated

- **Route handler exports**: Define `GET`, `POST`, `PUT`, `DELETE` named functions inside `app/api/.../route.ts`
- **JSON responses**: Use standard `Response.json(...)` helper with custom status codes
- **Request processing**: Parse incoming URL search parameters and JSON request bodies

## Project Structure

```text
├── app/
│   ├── api/
│   │   ├── hello/
│   │   │   └── route.ts       # GET /api/hello?name=...
│   │   └── users/
│   │       └── route.ts       # GET & POST /api/users
│   ├── layout.tsx
│   └── page.tsx
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```

Test endpoints with curl or browser:

```bash
curl http://localhost:3000/api/hello?name=Developer
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d "{\"name\":\"Eve\"}"
```
