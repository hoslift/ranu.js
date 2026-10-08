# Guide 06: Production — Hardening, Security & Observability

Welcome to Guide 6 of the **Ranu.js Universal AI Engineering Series**.

In this concluding guide, you will learn how to harden your AI-powered Ranu.js endpoints against adversarial threats (Prompt Injection, Denial-of-Wallet, Data Exfiltration) and implement production telemetry and rate limiting.

---

## 1. Threat Vectors in Generative AI Systems

Deploying LLMs to production introduces distinct security vulnerabilities:
1. **Direct & Indirect Prompt Injection:** Users attempting to override system constraints by inserting command syntax into input fields.
2. **Denial-of-Wallet (Token Exhaustion):** Flooding endpoints with massive contexts to deplete server compute or API credits.
3. **Secret Exfiltration:** Tricking the model into regurgitating system prompts, backend connection strings, or server environment keys.

---

## 2. Token Bucket Rate Limiting (`app/lib/ai/security.ts`)

Prevent abusive bursts using an in-memory or Redis-backed token bucket:

```typescript
// app/lib/ai/security.ts

interface ClientBucket {
  tokens: number;
  lastRefilled: number;
}

const clientLimits = new Map<string, ClientBucket>();
const MAX_BURST = 10;
const REFILL_PER_SECOND = 1;

export function verifyRateLimit(clientId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = clientLimits.get(clientId) || { tokens: MAX_BURST, lastRefilled: now };

  const deltaSeconds = (now - bucket.lastRefilled) / 1000;
  bucket.tokens = Math.min(MAX_BURST, bucket.tokens + deltaSeconds * REFILL_PER_SECOND);
  bucket.lastRefilled = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    clientLimits.set(clientId, bucket);
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  clientLimits.set(clientId, bucket);
  return { allowed: false, remaining: 0 };
}
```

---

## 3. Input Sanitization & Payload Bounds

Never forward unbounded or raw client text directly to inference engines:

```typescript
// app/lib/ai/sanitizer.ts

export function sanitizeAndBoundInput(input: unknown, maxChars = 2000): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a valid string');
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('Input cannot be empty');
  }

  if (trimmed.length > maxChars) {
    throw new Error(`Input exceeds maximum allowed limit of ${maxChars} characters.`);
  }

  // Strip invisible non-printable control characters
  return trimmed
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .normalize('NFKC');
}
```

---

## 4. Production AI Gateway Route (`app/api/chat/route.ts`)

Combine rate limiting, input bounds, telemetry timing, and abort propagation into a production-grade route handler:

```typescript
// app/api/chat/route.ts
import { verifyRateLimit } from '../../lib/ai/security.js';
import { sanitizeAndBoundInput } from '../../lib/ai/sanitizer.js';

export async function POST(request: Request) {
  const startTime = performance.now();
  const clientIp = request.headers.get('x-forwarded-for') || 'anonymous-client';

  // 1. Enforce Rate Limiting
  const { allowed, remaining } = verifyRateLimit(clientIp);
  if (!allowed) {
    return Response.json(
      { error: 'Rate limit exceeded. Please throttle your requests.' },
      {
        status: 429,
        headers: { 'Retry-After': '5', 'X-RateLimit-Remaining': '0' },
      }
    );
  }

  // 2. Validate and Sanitize Input
  let sanitizedPrompt: string;
  try {
    const body = await request.json();
    sanitizedPrompt = sanitizeAndBoundInput(body.prompt, 4000);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  // 3. Dispatch to Inference with Abort Propagation
  try {
    const upstream = await fetch(process.env.AI_INFERENCE_URL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_INFERENCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL_NAME,
        messages: [{ role: 'user', content: sanitizedPrompt }],
        stream: true,
      }),
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return Response.json({ error: `Upstream error: ${upstream.statusText}` }, { status: upstream.status });
    }

    const durationMs = Math.round(performance.now() - startTime);

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-RateLimit-Remaining': String(remaining),
        'X-Response-Time-Ms': String(durationMs),
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return new Response(null, { status: 499 });
    }
    return Response.json({ error: 'Internal gateway error' }, { status: 500 });
  }
}
```

---

## 5. Summary & Graduation

Congratulations! You have completed the **Ranu.js Universal AI Engineering Guides**.

By adhering to:
- Native Web Streams (`ReadableStream`, SSE),
- Multi-provider abstraction contracts,
- Strict schema validation and sandboxed tool calling,
- Vector embeddings and cosine retrieval,
- ReAct loops with safety bounds, and
- Production security gateways,

your Ranu.js applications are prepared to deliver high-performance, vendor-neutral AI experiences with enterprise reliability.
