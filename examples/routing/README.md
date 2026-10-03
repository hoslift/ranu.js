# Ranu.js File-Based Routing Example

This example demonstrates the file-based routing system of **Ranu.js**, including nested layouts, page hierarchies, client-side navigation, and custom not-found (404) pages.

## Concepts Demonstrated

- **File-based route mapping**: Directory structure automatically defines URL hierarchy (`app/about/page.tsx` -> `/about`)
- **Nested layouts**: `app/dashboard/layout.tsx` nests inside `app/layout.tsx` without re-rendering the parent shell
- **Client navigation**: `<Link>` component from `@ranujs/core/react` providing instant client-side transitions
- **Custom 404 page**: `app/404.tsx` handling unmatched paths gracefully

## Project Structure

```text
├── app/
│   ├── 404.tsx                # Custom 404 page
│   ├── about/
│   │   └── page.tsx           # /about route
│   ├── contact/
│   │   └── page.tsx           # /contact route
│   ├── dashboard/
│   │   ├── layout.tsx         # Nested dashboard sidebar layout
│   │   ├── page.tsx           # /dashboard route
│   │   └── settings/
│   │       └── page.tsx       # /dashboard/settings route
│   ├── layout.tsx             # Root document layout with top nav
│   └── page.tsx               # Root / route
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) and click between navigation links to see nested layout composition.
