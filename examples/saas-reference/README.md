# SaaS Reference Application

Turnkey production full-stack SaaS reference application built with [Ranu.js](https://github.com/hoslift/ranu.js).

## Architecture & Framework Primitives

- **React 19 Streaming SSR:** Dynamic server-rendered pages streamed via W3C Web Streams.
- **Server Actions HTTP RPC Wire Protocol:** Type-safe form mutations dispatched over `POST /_ranu/action/:actionId` using `createFormAction` and `useFormAction`.
- **Incremental Static Regeneration (ISR):** Granular cache invalidation using `revalidatePath` and `revalidateTag` with single-flight mutex protection.
- **Tailwind CSS Styling:** Modern utility styling with native responsive layout tokens and dark/light color accents.

## Getting Started

Run the development server with hot module reloading:

```bash
pnpm dev
```

Build the application for production:

```bash
pnpm build
```

Start the production server:

```bash
pnpm start
```
