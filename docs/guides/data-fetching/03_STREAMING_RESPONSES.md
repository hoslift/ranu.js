# Streaming Responses & Web Streams

Instead of forcing users to wait for an entire server operation to finish before sending data, Ranu.js supports streaming data incrementally to clients using W3C `ReadableStream`.

---

## 1. When to Use Streaming

- Long-running data queries or analytics aggregation
- Real-time Server-Sent Events (SSE) updates
- Generative AI token output
- Large file chunking without server memory bloat

---

## 2. Creating a Streaming API Route (`app/api/stream/route.ts`)

Return a standard `Response` initialized with a `ReadableStream`:

```typescript
// app/api/stream/route.ts

export async function GET(request: Request): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const items = ['First chunk', 'Second chunk', 'Third chunk', 'Final completion'];

      for (const item of items) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: item })}\n\n`));
        // Simulate progressive server task
        await new Promise((r) => setTimeout(r, 500));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 3. Reading the Stream on the Client

```tsx
// app/components/StreamConsumer.tsx
'use client';

import React, { useState } from 'react';

export function StreamConsumer() {
  const [messages, setMessages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);

  async function startStream() {
    setMessages([]);
    setStreaming(true);

    const res = await fetch('/api/stream');
    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      setMessages((prev) => [...prev, chunk]);
    }

    setStreaming(false);
  }

  return (
    <div>
      <button onClick={startStream} disabled={streaming}>
        {streaming ? 'Streaming...' : 'Start Stream'}
      </button>
      <pre style={{ background: '#eee', padding: 12, marginTop: 12 }}>
        {messages.join('')}
      </pre>
    </div>
  );
}
```

---

## 4. Key Takeaways

1. **Native Performance:** Streaming bypasses full buffer allocation on the server, drastically cutting Time-To-First-Byte (TTFB).
2. **Next Step:** Optimize your responses with **[Caching Headers & Edge Strategy](./04_CACHING_HEADERS.md)**.
