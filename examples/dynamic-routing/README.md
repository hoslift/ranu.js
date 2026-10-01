# Ranu.js Dynamic Routing Example

This example demonstrates parameter extraction and wildcard matching in **Ranu.js**.

## Concepts Demonstrated

- **Single dynamic segment**: `app/posts/[id]/page.tsx` captures `/posts/101` as `{ id: '101' }`
- **Multiple dynamic segments**: `app/shop/[category]/[productId]/page.tsx` captures nested hierarchical params
- **Catch-all segments**: `app/archive/[...slug]/page.tsx` matches any nested path under `/archive/...` as a string array
- **Params typing**: Standard React component props receiving strongly-typed `params`

## Project Structure

```text
├── app/
│   ├── archive/
│   │   └── [...slug]/
│   │       └── page.tsx       # Catch-all route (/archive/*)
│   ├── layout.tsx             # Root document layout
│   ├── page.tsx               # Index directory
│   ├── posts/
│   │   └── [id]/
│   │       └── page.tsx       # Single parameter route (/posts/:id)
│   └── shop/
│       └── [category]/
│           └── [productId]/
│               └── page.tsx   # Multi-segment route (/shop/:category/:productId)
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```
