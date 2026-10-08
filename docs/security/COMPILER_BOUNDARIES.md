# Compiler Boundaries & Architecture Isolation

In full-stack React applications, code written for the backend (such as database credentials, private encryption keys, and internal microservice tokens) can easily be accidentally bundled into client-side JavaScript if boundaries are not strictly enforced.

**Ranu.js** implements rigorous compiler-level isolation and runtime defenses to safeguard secret keys, prevent execution leakage, and neutralize common web exploit vectors.

---

## 1. The `@ranujs/core/server-only` Guard

To ensure a module or utility can only ever execute in server environments, import `@ranujs/core/server-only`:

```typescript
// lib/secrets.ts
import '@ranujs/core/server-only';

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
export const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD!;
```

### How the Guard Works
1. **Build-Time Detection:** During `ranu build`, the module bundler analyzes client entry graphs (`app/**/page.tsx` client components).
2. **Compilation Failure:** If any client bundle attempts to import a module containing `@ranujs/core/server-only`, the build halts immediately with a compiler diagnostic error.
3. **Zero Secret Leakage:** Prevents API tokens and internal credentials from ever reaching the client's browser bundle.

---

## 2. Environment Variable Segregation

Ranu.js enforces a strict boundary between public and private environment variables:

| Prefix / Variable | Accessible In | Safe For Secrets? |
| :--- | :--- | :---: |
| `DATABASE_URL` | Server Only (API Routes, SSR) | :white_check_mark: **Yes** |
| `AUTH_SECRET` | Server Only | :white_check_mark: **Yes** |
| `RANU_PUBLIC_*` | Server & Browser Bundles | :x: **No (Public)** |

> [!CAUTION]
> Never prefix sensitive API keys, private passwords, or internal tokens with `RANU_PUBLIC_`. Variables without this prefix are stripped from browser bundles during compilation.

---

## 3. ReDoS (Regular Expression Denial of Service) Defense

Dynamic route segments (`[id]`, `[...slug]`) and path matchers in `middleware.ts` are compiled using linear-time, non-backtracking automata algorithms.

* **Linear-Time Matching:** Eliminates exponential backtracking vulnerabilities that could cause CPU lockups when evaluating malformed URLs.
* **Bounded Route Length:** Request paths exceeding maximum length constraints are rejected prior to route parsing.

---

## 4. Path Traversal & Directory Traversal Guards

When serving static files from `public/` or `.ranu/build/client/`, Ranu.js applies canonical path resolution checks:

* **URL Normalization:** Hex-encoded dots (`%2e%2e`), null bytes (`%00`), and escaped directory separators are normalized prior to filesystem lookup.
* **Boundary Confinement:** Resolved paths are verified to reside strictly within the project's designated public folder. Any request attempting to traverse upward (`../../etc/passwd` or `.env.local`) receives an immediate HTTP `403 Forbidden` or `404 Not Found`.

---

## 5. XSS Defense & Stream State Escaping

During Server-Side Rendering (SSR) and chunked HTML streaming, dynamic data serialized into HTML documents (such as initial state or hydrated props) undergoes automatic JSON escaping:

```html
<!-- Automatically escaped against script termination -->
<script type="application/json" id="__RANU_STATE__">
  {"user":"\u003Cscript\u003Ealert('xss')\u003C/script\u003E"}
</script>
```

HTML tag delimiters (`<`, `>`, `&`, `'`, `"`) within JSON script blocks are encoded using standard Unicode escapes, neutralizing DOM-based and Reflected Cross-Site Scripting (XSS).

---

## 6. Security Architecture Matrix

| Security Layer | Threat Mitigated | Enforced By |
| :--- | :--- | :--- |
| **`server-only` Guard** | Secret exfiltration & bundle bloat | Compiler AST analyzer |
| **Env Sanitization** | Accidental credential exposure | Build bundler |
| **Path Traversal Guard** | Arbitrary file disclosure (`.env`) | Server runtime handler |
| **Linear Automata** | ReDoS / Denial of Service | Route compilation engine |
| **Unicode Serialization**| Cross-Site Scripting (XSS) | SSR HTML streaming engine |
