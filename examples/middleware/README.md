# Ranu.js Middleware Example

This example demonstrates how to intercept, protect, rewrite, and redirect HTTP requests using **Ranu.js Middleware**.

## Concepts Demonstrated

- **Path Matching**: `config = { matcher: ['/*'] }` matches incoming request routes
- **Authentication Guard**: Intercepting requests targeting `/protected` and redirecting unauthorized visitors to `/login`
- **Internal Rewrites**: Silently rewriting paths without altering the user-facing URL in the browser bar

## Project Structure

```text
├── app/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── page.tsx
│   └── protected/page.tsx
├── middleware.ts      # Top-level request middleware
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```
