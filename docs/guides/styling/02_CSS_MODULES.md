# Locally Scoped Styling with CSS Modules

**CSS Modules** offer component-scoped styling by automatically generating unique, localized class names. In **Ranu.js**, CSS Modules require zero configuration, emit no runtime CSS-in-JS JavaScript footprint, and preserve fast development HMR.

---

## 1. Zero-Configuration Support

Ranu.js recognizes any file ending in `.module.css` (or `.module.scss` if Sass is installed) as a CSS Module.

During compilation, classes are hashed into unique identifiers (e.g., `Button_button__a1b2c`), preventing style collisions across components without requiring global namespace prefixes.

---

## 2. Creating and Consuming a CSS Module

### Step A: Define Module Styles

Create a style file next to your component (`components/Button.module.css`):

```css
/* components/Button.module.css */
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 0.375rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.primary {
  background-color: #4f46e5;
  color: #ffffff;
}

.primary:hover {
  background-color: #4338ca;
}

.secondary {
  background-color: #f3f4f6;
  color: #1f2937;
  border-color: #e5e7eb;
}

.secondary:hover {
  background-color: #e5e7eb;
}

.outline {
  background-color: transparent;
  color: #4f46e5;
  border-color: #4f46e5;
}

.outline:hover {
  background-color: #eef2ff;
}
```

### Step B: Import into React Component

Import the CSS module as a default object (`components/Button.tsx`):

```tsx
// components/Button.tsx
import styles from './Button.module.css';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...props
}: ButtonProps) {
  // Combine scoped module class with optional external className
  const combinedClasses = `${styles.button} ${styles[variant]} ${className}`.trim();

  return (
    <button className={combinedClasses} {...props}>
      {children}
    </button>
  );
}
```

---

## 3. Composing Class Names

For complex conditional logic, use utility helpers such as `clsx`:

```bash
pnpm add clsx
```

```tsx
// components/Card.tsx
import styles from './Card.module.css';
import clsx from 'clsx';

interface CardProps {
  elevated?: boolean;
  padded?: boolean;
  children: React.ReactNode;
}

export function Card({ elevated, padded = true, children }: CardProps) {
  return (
    <div
      className={clsx(styles.card, {
        [styles.elevated]: elevated,
        [styles.padded]: padded,
      })}
    >
      {children}
    </div>
  );
}
```

---

## 4. TypeScript Typing for CSS Modules

To get TypeScript autocompletion on module class names, add a ambient declaration in `types/css-modules.d.ts`:

```typescript
// types/css-modules.d.ts
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

Or generate exact type definitions automatically using `typed-css-modules`:

```bash
pnpm add -D typed-css-modules
```

---

## 5. CSS Modules vs. CSS-in-JS Comparison

| Metric | CSS Modules (Ranu.js) | Runtime CSS-in-JS |
| :--- | :--- | :--- |
| **Runtime JS Cost** | **0 KB** (Extracted to static `.css`) | 10–25 KB runtime library |
| **Server Streaming** | Native `<link>` stream; 0 FOUC | Requires style collector context |
| **Performance** | Native browser CSS parsing | Heavy JS execution on every render |
| **HMR Speed** | Sub-second CSS patch | Full component tree re-evaluation |
