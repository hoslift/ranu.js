# Ranu.js Client Components & Interactivity Example

This example demonstrates how to build interactive client-side components and use programmatic navigation hooks in **Ranu.js**.

## Concepts Demonstrated

- **Client hydration**: Standard React 19 hooks (`useState`, `useEffect`) executing on the browser client
- **Navigation hooks**:
  - `useRouter()`: Provides `push(url)`, `replace(url)`, `back()`, `forward()`
  - `usePathname()`: Returns current URL pathname
  - `useSearchParams()`: Returns URL search query parameters

## Project Structure

```text
├── app/
│   ├── components/
│   │   ├── counter.tsx        # Interactive counter with useState
│   │   └── text-filter.tsx    # Live search input filter
│   ├── layout.tsx
│   ├── navigate/
│   │   └── page.tsx           # Programmatic navigation hooks
│   └── page.tsx               # Client components overview
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```
