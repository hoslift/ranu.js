# Styling with Tailwind CSS

**Tailwind CSS** is a utility-first CSS framework designed for rapid UI development. In **Ranu.js**, Tailwind integrates directly into the build pipeline, extracting generated utility classes into optimized CSS assets (`/_ranu/assets/*.css`) with sub-second Hot Module Replacement (HMR).

---

## 1. Installation

Install Tailwind CSS, PostCSS, and Autoprefixer:

```bash
pnpm add -D tailwindcss postcss autoprefixer
```

---

## 2. Configuration

Create `postcss.config.js` in your project root:

```javascript
// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Create `tailwind.config.ts` in your project root:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          500: '#6366f1',
          900: '#312e81',
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 3. Global Stylesheet Setup

Create `app/globals.css` and inject Tailwind's layers:

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #09090b;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #09090b;
    --foreground: #fafafa;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
}
```

---

## 4. Root Layout Integration

Import `globals.css` in your root layout (`app/layout.tsx`):

```tsx
// app/layout.tsx
import './globals.css';
import type { ReactNode } from 'react';

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
          <span className="font-bold text-lg text-indigo-600 dark:text-indigo-400">
            Ranu App
          </span>
        </header>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
```

---

## 5. How Ranu.js Processes CSS

1. **Asset Extraction:** During `ranu build`, CSS imported in server layouts or pages is collected, compiled via PostCSS/Tailwind, minified, and output to `/_ranu/assets/[hash].css`.
2. **Link Injection:** The HTML streaming engine automatically injects `<link rel="stylesheet" href="/_ranu/assets/[hash].css">` into `<head>`, preventing Flash of Unstyled Content (FOUC).
3. **Sub-second HMR:** In `ranu dev`, editing class names or styles updates in real-time via the Vite HMR engine without discarding React component state or triggering full page reloads.

---

## 6. Best Practices

* **Avoid Dynamic Class Strings:** Tailwind scans source files statically with regex. Avoid constructed strings like `text-${color}-500`; use full class names or mapping objects instead:
  ```tsx
  // Good:
  const colorMap = {
    primary: 'text-indigo-600',
    danger: 'text-rose-600',
  };
  <span className={colorMap[variant]} />
  ```
* **Production Optimization:** Unused utilities are purged automatically during production builds, keeping the final asset footprint minimal (typically under 20kB gzipped).
