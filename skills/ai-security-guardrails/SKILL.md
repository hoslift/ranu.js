---
name: ai-security-guardrails
description: Hardening policies, threat mitigation, token rate-limiting, and runtime safety for production AI routes in Ranu.js (@ranujs/core).
triggers:
  - 'ai security'
  - 'rate limiting'
  - 'prompt injection'
  - 'guardrails'
---

# Universal AI Security Guardrails Skill

This skill defines mandatory security guardrails, rate-limiting patterns, and defense-in-depth mechanisms for AI-enabled endpoints in **Ranu.js**.

---

## 1. Zero-Leak Compiler Boundaries

- **Private Variables:** Never prefix AI API keys with `RANU_PUBLIC_`.
- Server secrets (`AI_INFERENCE_API_KEY`, `AI_DATABASE_URL`) must only be accessed within `app/api/**/route.ts` or server utilities.
- Never pass secret credentials down into React client component props or client state.

---

## 2. In-Memory Token Bucket Rate Limiting

Protect server compute budgets against abuse and infinite loop queries:

```typescript
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const rateLimitMap = new Map<string, TokenBucket>();
const CAPACITY = 20; // Maximum bursts
const REFILL_RATE_PER_SECOND = 2; // Tokens added per second

export function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(clientId) || { tokens: CAPACITY, lastRefill: now };

  // Calculate elapsed time and add tokens
  const elapsedSeconds = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsedSeconds * REFILL_RATE_PER_SECOND);
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    rateLimitMap.set(clientId, bucket);
    return true; // Request allowed
  }

  rateLimitMap.set(clientId, bucket);
  return false; // Rate limit exceeded
}
```

---

## 3. Prompt Injection Defense & Input Sanitization

```typescript
export function sanitizePrompt(rawInput: string, maxCharacters = 4000): string {
  if (typeof rawInput !== 'string') {
    throw new Error('Input must be a valid string');
  }

  // 1. Truncate oversized payloads to prevent context window denial-of-service
  const trimmed = rawInput.trim().slice(0, maxCharacters);

  // 2. Neutralize dangerous control characters
  const sanitized = trimmed
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .normalize('NFKC');

  return sanitized;
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Do not trust user input in system instructions:** Always keep system prompts immutable on the server. Never append raw user text directly into system prompt variables.
- ❌ **Do not log unmasked authorization tokens:** Redact credentials in all server logs, telemetry, and error reporters.
- ❌ **Do not run endpoints without payload length guards:** Enforce strict body size limits before parsing JSON.
