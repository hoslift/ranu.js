---
name: ai-universal-streaming
description: Procedural rules and best practices for building zero-dependency real-time streaming AI APIs in Ranu.js using native W3C Web Standards.
version: 1.0.0
compatibility: ranu >= 0.1.0
tags: [ai, streaming, sse, web-streams, react19]
---

# Universal AI Streaming Skill

This skill defines mandatory architectural patterns and procedural rules for implementing real-time streaming AI interactions in **Ranu.js** applications without vendor lock-in.

---

## 1. Core Architectural Mental Model

1. **W3C Standards Only:**
   - Always leverage native global `ReadableStream`, `TransformStream`, `TextEncoder`, and `TextDecoder`.
   - Never import vendor-specific stream wrappers or meta-framework proprietary streaming utilities.
2. **Server-Sent Events (SSE) Protocol:**
   - Streaming endpoints return `Response` with headers:
     - `Content-Type: text/event-stream; charset=utf-8`
     - `Cache-Control: no-cache, no-transform`
     - `Connection: keep-alive`
3. **Immediate Abort Propagation (Resource Conservation):**
   - Forward `request.signal` directly to upstream inference `fetch` calls.
   - When a client closes the browser tab or aborts the request, the upstream AI inference call must terminate immediately.

---

## 2. Server Implementation Pattern (`app/api/chat/route.ts`)

```typescript
export async function POST(request: Request): Promise<Response> {
  const signal = request.signal;

  // Handle pre-aborted requests
  if (signal.aborted) {
    return new Response(null, { status: 499 });
  }

  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt || typeof prompt !== 'string') {
    return Response.json({ error: 'Prompt is required.' }, { status: 400 });
  }

  const upstreamUrl = process.env.AI_INFERENCE_URL || 'http://localhost:11434/v1/chat/completions';
  const apiKey = process.env.AI_INFERENCE_API_KEY || 'default-token';

  // 1. Forward request to standard inference endpoint
  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL_NAME || 'default',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return Response.json(
      { error: `Upstream error: ${upstreamResponse.statusText}` },
      { status: upstreamResponse.status }
    );
  }

  // 2. Stream directly back to client without in-memory buffering
  return new Response(upstreamResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 3. Client Consumption Pattern (`app/page.tsx`)

Always read incoming chunks iteratively using `ReadableStreamDefaultReader`:

```typescript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt }),
  signal: abortController.signal,
});

if (!response.ok || !response.body) {
  throw new Error('Failed to start streaming');
}

const reader = response.body.getReader();
const decoder = new TextDecoder();

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    // Process SSE lines (data: { ... })
  }
} finally {
  reader.releaseLock();
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Do not buffer responses in server memory:** Never accumulate full responses in a string variable before returning.
- ❌ **Do not swallow client disconnects:** Always bind `signal: request.signal` to upstream fetch requests.
- ❌ **Do not use Node.js legacy event emitters:** Use modern W3C Web Streams (`ReadableStream`).
