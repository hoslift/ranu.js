# Static Assets, SVGs, and Web Fonts

Fast, resilient full-stack applications require efficient delivery of images, vectors, icons, and typography. **Ranu.js** provides static file serving via the `public/` directory, optimized SVG handling, and privacy-respecting self-hosted font loading.

---

## 1. The `public/` Static Directory

All files placed inside the root `public/` directory are served directly from the root path (`/`):

```
my-ranu-app/
├── app/
├── public/
│   ├── favicon.ico       --> /favicon.ico
│   ├── robots.txt        --> /robots.txt
│   ├── logo.svg          --> /logo.svg
│   └── images/
│       └── hero.webp     --> /images/hero.webp
```

### Referencing Static Assets in Components

Reference assets using absolute URL paths starting with `/`:

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <main>
      <img
        src="/images/hero.webp"
        alt="Product Dashboard Preview"
        width={1200}
        height={630}
        loading="eager"
      />
    </main>
  );
}
```

> [!NOTE]
> Files in `public/` are served with standard cache headers in production and are not hashed into build bundles. For assets requiring aggressive cache-busting, import them inside your TypeScript/TSX code.

---

## 2. Self-Hosted Web Fonts with `@font-face`

Self-hosting fonts prevents external network requests to third-party CDNs, improves Core Web Vitals (Largest Contentful Paint & Cumulative Layout Shift), and adheres to privacy regulations (GDPR).

### Step A: Place WOFF2 Font Files in `public/fonts/`

Store modern, compressed `.woff2` font files in `public/fonts/`:
```
public/
└── fonts/
    ├── Inter-Regular.woff2
    └── Inter-Bold.woff2
```

### Step B: Define `@font-face` Rules in CSS

Add font definitions to `app/globals.css`:

```css
/* app/globals.css */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
}

@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('/fonts/Inter-Bold.woff2') format('woff2');
}

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
```

* `font-display: swap`: Prevents invisible text during font loading by rendering fallback system fonts until the web font is ready.

---

## 3. Font Preloading for Zero Layout Shift

To eliminate layout shifts (CLS), instruct the browser to download critical fonts during initial HTML parsing by adding `<link rel="preload">` in `app/layout.tsx`:

```tsx
// app/layout.tsx
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/Inter-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## 4. Working with SVG Icons & Vectors

### Approach A: Static SVG via `<img>` (Best for large illustrations)

```tsx
<img src="/logo.svg" alt="Ranu Logo" width={32} height={32} />
```

### Approach B: Inline React SVG Components (Best for interactive icons)

Inlining SVGs into React components enables dynamic CSS coloring (`currentColor`) and hover effects:

```tsx
// components/icons/CheckIcon.tsx
interface IconProps {
  className?: string;
  size?: number;
}

export function CheckIcon({ className = '', size = 20 }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
```

---

## 5. Metadata Assets: Favicons & Social Graphs

Ranu.js supports standard web metadata files placed in `public/`:

* **`favicon.ico` / `icon.svg`**: Root browser tabs icon.
* **`apple-touch-icon.png`**: iOS home screen icon (180x180 px).
* **`og-image.png`**: Open Graph card preview (1200x630 px).

Reference these in `app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```
