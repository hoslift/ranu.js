# 01. Getting Started with AI in Ranu.js

This guide walks you through building a real-time, streaming AI chat interface in **Ranu.js** from scratch in under 5 minutes.

You will learn how to:

1. Configure your environment variables safely.
2. Build a server API route that streams tokens using Web Standards.
3. Build an interactive React 19 client chat component.

---

## Step 1: Configure Environment Variables

Create a `.env` file in the root of your Ranu.js project and add your AI inference endpoint and secret API key:

```bash
# .env (Never commit your real secrets to version control)
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your_secret_api_key_here
AI_MODEL_NAME=gpt-4o-mini
```

> [!NOTE]
> In Ranu.js, environment variables without a `RANU_PUBLIC_` prefix are **server-private**. The framework compiler strictly prevents these variables from leaking into client-side JavaScript bundles.

---

## Step 2: Create the Streaming API Route

Create an API route at `app/api/chat/route.ts`.

In Ranu.js, API routes run on the server and communicate using standard W3C `Request` and `Response` objects:

```typescript
// app/api/chat/route.ts

interface ChatRequestBody {
  prompt: string;
}

export async function POST(request: Request) {
  try {
    const { prompt } = (await request.json()) as ChatRequestBody;

    if (!prompt || typeof prompt !== 'string') {
      return Response.json({ error: 'Field "prompt" is required.' }, { status: 400 });
    }

    const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL_NAME || 'gpt-4o-mini';

    if (!apiKey) {
      return Response.json({ error: 'AI_API_KEY is not configured on the server.' }, { status: 500 });
    }

    // 1. Dispatch request to upstream AI inference endpoint
    // Passing request.signal ensures upstream calls abort immediately if the user disconnects
    const upstreamResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
      signal: request.signal,
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errorText = await upstreamResponse.text();
      return Response.json(
        { error: `Upstream AI provider error: ${upstreamResponse.statusText}`, details: errorText },
        { status: upstreamResponse.status },
      );
    }

    // 2. Return the native ReadableStream directly to the client
    return new Response(upstreamResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(null, { status: 499 }); // Client Closed Request
    }
    return Response.json({ error: 'Failed to process AI request.' }, { status: 500 });
  }
}
```

---

## Step 3: Build the React 19 Client UI

Create or edit your page component at `app/page.tsx`. This component handles user interaction, reads the streamed token chunks using `TextDecoderStream`, and displays real-time updates:

```tsx
// app/page.tsx
import { useState, useRef, FormEvent } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    setInput('');
    setIsLoading(true);

    const userMessage: ChatMessage = { role: 'user', content: prompt };
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // Create an AbortController so the user can cancel anytime
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      // Read streamed chunks decoded directly through TextDecoderStream
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let accumulatedText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Process Server-Sent Events lines (data: {...})
        const lines = value.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataContent = trimmed.replace(/^data:\s*/, '');

          if (dataContent === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataContent);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            accumulatedText += delta;

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                last.content = accumulatedText;
              }
              return updated;
            });
          } catch {
            // Non-JSON SSE chunk, continue buffering
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled generation
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'An error occurred while generating the response.' },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '720px', margin: '2rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ranu.js AI Chat</h1>
      <p style={{ color: '#666' }}>Powered by Web Standard Streams and React 19.</p>

      <section
        style={{
          minHeight: '360px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: '#999', margin: 'auto' }}>Type a message below to start chatting.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#2563eb' : '#f3f4f6',
              color: m.role === 'user' ? '#fff' : '#111',
              padding: '0.6rem 1rem',
              borderRadius: '12px',
              maxWidth: '80%',
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong>{m.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <div>{m.content}</div>
          </div>
        ))}
      </section>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          disabled={isLoading}
          style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{ padding: '0.6rem 1.2rem', cursor: 'pointer' }}
        >
          {isLoading ? 'Streaming...' : 'Send'}
        </button>
        {isLoading && (
          <button
            type="button"
            onClick={handleStop}
            style={{
              padding: '0.6rem 1rem',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
      </form>
    </main>
  );
}
```

---

## Step 4: Run the Application

Launch your development server:

```bash
ranu dev
```

Navigate to `http://localhost:3000` in your browser. Type a message and watch your AI tokens stream in real time!

---

## Next Steps

Now that your first streaming AI route is operational:

- Learn how Server-Sent Events work under the hood in **[02. Streaming & SSE Recipes](./02_STREAMING_AND_SSE.md)**.
- Build a multi-provider setup that supports local LLMs in **[03. Multi-Provider Patterns](./03_MULTI_PROVIDER_PATTERNS.md)**.
