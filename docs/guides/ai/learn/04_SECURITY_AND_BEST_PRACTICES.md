# 04. Security & Production Best Practices for AI

Deploying AI capabilities into production introduces unique security considerations, from **API key exfiltration** to **denial-of-wallet (financial exhaustion) attacks** and **prompt injection**.

This guide outlines defensive patterns for hardening AI-driven applications built on **Ranu.js**.

---

## 1. Secret Protection & Compiler Boundaries

### The Server-Only Rule

Never embed raw API keys in client-side components. Ranu.js enforces a strict compiler boundary between server and client code:

```bash
# .env

# ✅ SERVER-PRIVATE: Accessible only in API routes and server logic
AI_API_KEY=sk-prod-9876543210
UPSTREAM_AI_URL=https://api.inference-provider.com/v1

# ⚠️ BROWSER-PUBLIC: Inlined into client JavaScript bundles at build time
RANU_PUBLIC_APP_NAME="My AI App"
```

### Compiler Guardrails

If a client component (e.g. `app/components/chat-box.tsx`) attempts to read a server-only environment variable like `process.env.AI_API_KEY`, Ranu.js's production build pipeline throws an error, actively preventing key leakage before deployment.

---

## 2. Rate Limiting & Financial Protection

AI endpoints cost money per token. To prevent malicious actors or runaway automated loops from draining your budget, implement rate limiting in `middleware.ts`:

```typescript
// middleware.ts
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const MAX_REQUESTS_PER_MINUTE = 20;
const WINDOW_MS = 60 * 1000;

export const config = {
  matcher: ['/api/chat*'],
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/chat')) {
    // Derive client identifier (e.g. from IP or authorization token)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anonymous';
    const now = Date.now();

    const record = rateLimitMap.get(clientIp) || { count: 0, resetAt: now + WINDOW_MS };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + WINDOW_MS;
    }

    record.count++;
    rateLimitMap.set(clientIp, record);

    if (record.count > MAX_REQUESTS_PER_MINUTE) {
      return Response.json(
        { error: 'Too Many Requests. Please wait before asking another question.' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((record.resetAt - now) / 1000).toString(),
          },
        },
      );
    }
  }
}
```

---

## 3. Request Body Size Limits & DoS Defense

To prevent attackers from sending multi-megabyte payloads that cause memory exhaustion in your API routes, enforce maximum prompt lengths:

```typescript
// app/api/chat/route.ts
const MAX_PROMPT_LENGTH = 4000; // ~1000 tokens

export async function POST(request: Request) {
  const body = (await request.json()) as { prompt?: string };

  if (!body.prompt || typeof body.prompt !== 'string') {
    return Response.json({ error: 'Prompt string is required.' }, { status: 400 });
  }

  if (body.prompt.length > MAX_PROMPT_LENGTH) {
    return Response.json(
      { error: `Prompt exceeds maximum character length (${MAX_PROMPT_LENGTH}).` },
      { status: 413 }, // Payload Too Large
    );
  }

  // Proceed with sanitized prompt...
}
```

---

## 4. Output Sanitization & XSS Prevention

LLM outputs are untrusted content. When rendering markdown, tables, or generated code in React 19:

- **Never** render raw AI output using `dangerouslySetInnerHTML`.
- Use a safe markdown renderer (such as `react-markdown` with `rehype-sanitize`) to neutralize script injections, malicious `<iframe>` embeds, or forged links.

```tsx
// app/components/safe-response.tsx
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export function SafeAiResponse({ text }: { text: string }) {
  return (
    <article className="prose">
      <Markdown rehypePlugins={[rehypeSanitize]}>{text}</Markdown>
    </article>
  );
}
```

---

## 5. Production Checklist

Before deploying your AI application to production:

- [ ] All AI API keys are stored in server-private environment variables (no `RANU_PUBLIC_` prefix).
- [ ] Upstream `fetch` calls include `signal: request.signal` to abort orphaned generation tasks.
- [ ] Rate limiting is enabled on public `/api/*` AI routes.
- [ ] Maximum input length validation is enforced before dispatching inference requests.
- [ ] Client UI sanitizes rendered markdown to prevent XSS.
- [ ] Upstream API quotas and spending limits are configured in your provider dashboard.
