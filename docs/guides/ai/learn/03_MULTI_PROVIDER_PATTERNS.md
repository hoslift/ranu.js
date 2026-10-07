# 03. Multi-Provider Architecture Patterns

A key strength of Ranu.js is its **Zero Vendor Lock-in** philosophy. You are never restricted to a single AI provider or forced to install proprietary wrapper libraries into your framework dependencies.

This guide demonstrates how to architect a **Vendor-Neutral AI Provider Layer** that lets your application switch between cloud providers and local offline models via environment variables.

---

## 1. Common Message & Streaming Contract

Define a universal TypeScript contract for incoming and outgoing chat payloads in your project:

```typescript
// app/lib/ai/types.ts

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderAdapter {
  readonly id: string;
  createStream(request: CompletionRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}
```

---

## 2. Implementing Standard Provider Adapters

Because all modern AI providers expose HTTP/REST interfaces, you can implement adapters using pure `fetch` and Web Standard streams:

### A. OpenAI-Compatible Protocol Adapter

Used by OpenAI, DeepSeek, Groq, Together AI, Mistral, and many standard endpoints:

```typescript
// app/lib/ai/adapters/openai-compatible.ts
import type { ProviderAdapter, CompletionRequest } from '../types.js';

export class OpenAiCompatibleAdapter implements ProviderAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel: string,
    public readonly id: string = 'openai-compatible',
  ) {}

  async createStream(req: CompletionRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model || this.defaultModel,
        messages: req.messages,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Provider (${this.id}) failed: ${res.status} ${res.statusText}`);
    }

    return res.body;
  }
}
```

### B. Local & Self-Hosted Runner (Ollama / vLLM)

For cost-free, 100% private, on-device AI development:

```typescript
// app/lib/ai/adapters/local-runner.ts
import type { ProviderAdapter, CompletionRequest } from '../types.js';

export class LocalRunnerAdapter implements ProviderAdapter {
  constructor(
    private readonly endpointUrl: string = 'http://127.0.0.1:11434/api/chat',
    private readonly defaultModel: string = 'llama3',
    public readonly id: string = 'local-runner',
  ) {}

  async createStream(req: CompletionRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model || this.defaultModel,
        messages: req.messages,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Local runner failed: ${res.status} ${res.statusText}`);
    }

    return res.body;
  }
}
```

---

## 3. Dynamic Factory & Provider Resolution

Create a factory that selects the active provider based on environment configuration:

```typescript
// app/lib/ai/factory.ts
import type { ProviderAdapter } from './types.js';
import { OpenAiCompatibleAdapter } from './adapters/openai-compatible.js';
import { LocalRunnerAdapter } from './adapters/local-runner.js';

export function resolveAiProvider(): ProviderAdapter {
  const provider = process.env.AI_PROVIDER || 'local';

  switch (provider.toLowerCase()) {
    case 'cloud':
    case 'openai':
      return new OpenAiCompatibleAdapter(
        process.env.AI_API_BASE_URL || 'https://api.openai.com/v1',
        process.env.AI_API_KEY || '',
        process.env.AI_MODEL || 'gpt-4o-mini',
      );

    case 'local':
    case 'ollama':
      return new LocalRunnerAdapter(
        process.env.AI_LOCAL_URL || 'http://127.0.0.1:11434/api/chat',
        process.env.AI_MODEL || 'llama3',
      );

    default:
      throw new Error(`Unsupported AI_PROVIDER value: "${provider}".`);
  }
}
```

---

## 4. Universal Route Handler

Now your API route (`app/api/chat/route.ts`) remains 100% decoupled from provider-specific logic:

```typescript
// app/api/chat/route.ts
import { resolveAiProvider } from '../../lib/ai/factory.js';
import type { ChatMessage } from '../../lib/ai/types.js';

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Array of "messages" is required.' }, { status: 400 });
    }

    const provider = resolveAiProvider();
    const stream = await provider.createStream({ messages }, request.signal);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return Response.json({ error: message }, { status: 500 });
  }
}
```

---

## 5. Next Steps

- Protect your AI endpoints against budget exhaustion and injection vulnerabilities in **[04. Security & Best Practices](./04_SECURITY_AND_BEST_PRACTICES.md)**.
