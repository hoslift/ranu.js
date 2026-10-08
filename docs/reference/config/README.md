# Configuration Reference (`ranu.config.ts`)

**Ranu.js** is configured using an optional configuration file in your project root. 

The configuration module provides full TypeScript autocompletion and type-safety via the `defineConfig` helper imported from `@ranujs/core/config`.

---

## 1. File Discovery & Precedence

When initializing commands (`dev`, `build`, `start`, `deploy`), Ranu.js searches for a configuration file in the following canonical sequence:

1. `ranu.config.ts` (Recommended)
2. `ranu.config.js`
3. `ranu.config.mjs`
4. `ranu.config.cjs`

> [!CAUTION]
> If multiple configuration files are detected in your root directory simultaneously (for example, both `ranu.config.ts` and `ranu.config.js`), Ranu.js halts execution with diagnostic error **`RANU_CONFIG_AMBIGUOUS`** to prevent unpredictable behavior.

---

## 2. Basic Configuration Example

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
    host: '127.0.0.1',
    trustProxy: true,
  },
  build: {
    sourceMaps: true,
    minify: true,
  },
  routing: {
    trailingSlash: 'never',
  },
});
```

---

## 3. Dynamic Context-Aware Configuration

`defineConfig` also accepts a callback function that receives the current runtime context (`mode` and `command`):

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig(({ mode, command }) => {
  const isDev = mode === 'development';

  return {
    server: {
      port: isDev ? 3000 : 8080,
    },
    build: {
      sourceMaps: isDev,
      minify: !isDev,
    },
  };
});
```

### Context Parameters:
* **`mode`**: `'development' | 'production'`
* **`command`**: `'dev' | 'build' | 'start' | 'create' | 'deploy' | 'help' | 'version'`

---

## 4. Full Configuration Schema (`RanuUserConfig`)

### `server` (Development & Production Server Options)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `port` | `number` | `3000` | Port on which the HTTP server listens |
| `host` | `string` | `127.0.0.1` (dev)<br>`0.0.0.0` (start) | Network interface IP address to bind |
| `trustProxy` | `boolean` | `false` | When true, trust `X-Forwarded-*` headers from reverse proxies |

---

### `build` (Compilation Options)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `sourceMaps` | `boolean` | `true` (dev)<br>`false` (prod) | Generate JavaScript source map files |
| `minify` | `boolean` | `false` (dev)<br>`true` (prod) | Minify and compress generated code bundles |

---

### `routing` (URL & Router Options)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `trailingSlash` | `'always' \| 'never' \| 'ignore'` | `'ignore'` | Controls URL trailing slash redirection rules |
| `basePath` | `string` | `undefined` | Deploy application under a sub-path prefix (e.g., `'/app'`) |

---

### `rendering` (SSR Engine Options)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `defaultMode` | `'server' \| 'static' \| 'client'` | `'server'` | Default rendering strategy for unannotated pages |

---

### `deployment` (Hosting Adapter Options)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `adapter` | `RanuDeploymentAdapter` | `undefined` | Deployment adapter instance (e.g. `vercelAdapter()`) |

---

### `plugins` (Plugin Array)
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `plugins` | `any[]` | `[]` | Array of Ranu.js / Vite build plugins |

---

## 5. TypeScript Definition Reference

```typescript
export interface RanuUserConfig {
  plugins?: any[];
  build?: {
    sourceMaps?: boolean;
    minify?: boolean;
  };
  server?: {
    host?: string;
    port?: number;
    trustProxy?: boolean;
  };
  routing?: {
    trailingSlash?: 'always' | 'never' | 'ignore';
    basePath?: string;
  };
  rendering?: {
    defaultMode?: 'server' | 'static' | 'client';
  };
  deployment?: {
    adapter?: RanuDeploymentAdapter;
  };
  env?: {
    files?: boolean;
  };
}
```
