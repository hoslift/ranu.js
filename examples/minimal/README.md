# Minimal Ranu.js Example

This example demonstrates the absolute minimal configuration required to build and run an application with **Ranu.js**.

## Concept Demonstrated

- Zero extra configuration: runs directly with `@ranujs/core`
- Bare minimal project structure with an index route (`app/page.tsx`)
- Server-side rendering (SSR) out of the box with zero boilerplate

## Project Structure

```text
examples/minimal/
├── app/
│   └── page.tsx       # Home page component
└── package.json       # Dependencies and run scripts
```

## Running the Example

Start the local development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the minimal application.

Build for production:

```bash
pnpm build
pnpm start
```

## Key Takeaways

- `@ranujs/core` handles the bare essentials without unnecessary dependencies or configuration overhead.
- Layouts, configuration files, and custom server helpers can be added progressively as project complexity grows.
