# Installation & Setup

This guide walks you through setting up a new **Ranu.js** project on your machine.

---

## 🛠️ Prerequisites

Before getting started, make sure your development environment meets these requirements:

- **Node.js:** `>= 22.0.0` (Active LTS recommended)
- **Package Manager:** `pnpm` (`>= 11.0.0`), `npm` (`>= 10.0.0`), `yarn`, or `bun`

You can verify your Node.js version in your terminal:

```bash
node -v
```

---

## ⚡ Method 1: Automatic Scaffolding (Recommended)

The fastest and easiest way to create a production-ready Ranu.js application is with the official `create-ranujs` starter tool:

### Using npm:
```bash
npx create-ranujs@latest my-app
```

### Using npm's initializer syntax:
```bash
npm create ranujs@latest my-app
```

### Using pnpm:
```bash
pnpm create ranujs my-app
```

### Using yarn or bun:
```bash
yarn create ranujs my-app
# or
bun create ranujs my-app
```

Follow the interactive prompts to configure your project name and preferences.

---

## 🚀 Running Your Development Server

Navigate into your newly created project directory and start the local dev server:

```bash
cd my-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The development server supports instant Hot Module Replacement (HMR) powered by Vite.

---

## 📦 Method 2: Manual Installation

If you prefer to configure an existing project or configure Ranu.js manually:

### 1. Install Dependencies
```bash
npm install @ranujs/core react react-dom
npm install -D typescript @types/node @types/react @types/react-dom
```

### 2. Configure `package.json`
Add the standard Ranu scripts to your `package.json`:

```json
{
  "name": "my-ranu-app",
  "type": "module",
  "scripts": {
    "dev": "ranu dev",
    "build": "ranu build",
    "start": "ranu start",
    "typecheck": "tsc --noEmit"
  }
}
```

### 3. Create Configuration (`ranu.config.ts`)
Create a `ranu.config.ts` file in your root folder:

```typescript
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
```

---

## 🧭 Next Steps

- Explore the **[Project Structure](./03_PROJECT_STRUCTURE.md)** to learn about the `app/` directory and routing conventions.
- Build your first full-stack page in **[Your First Application](./04_FIRST_APP.md)**.
