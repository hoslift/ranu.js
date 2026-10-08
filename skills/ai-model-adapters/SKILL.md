---
name: ai-model-adapters
description: Procedural patterns for creating model-agnostic, interchangeable inference adapters and failover routing in Ranu.js.
version: 1.0.0
compatibility: ranu >= 0.1.0
tags: [ai, adapters, abstraction, multi-model, routing]
---

# Universal Model Adapters Skill

This skill defines rules for abstracting heterogeneous AI inference providers into a uniform, vendor-neutral programming contract in **Ranu.js**.

---

## 1. Unified Contract Interface

All model adapters must implement this minimal, standard interface:

```typescript
export interface UniversalMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UniversalChatRequest {
  messages: UniversalMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelAdapter {
  readonly id: string;
  createStream(request: UniversalChatRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}
```

---

## 2. Standard HTTP Protocol Adapter

Implement adapters using standard Web `fetch` without vendor-specific SDK wrappers:

```typescript
export class StandardInferenceAdapter implements ModelAdapter {
  constructor(
    public readonly id: string,
    private readonly endpointUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel: string
  ) {}

  async createStream(req: UniversalChatRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(`${this.endpointUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model || this.defaultModel,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`[Adapter: ${this.id}] HTTP error ${res.status}: ${res.statusText}`);
    }

    return res.body;
  }
}
```

---

## 3. Resilient Failover & Router Pattern

When building production endpoints, implement multi-provider fallbacks:

```typescript
export class ResilientRouter {
  constructor(private readonly adapters: ModelAdapter[]) {}

  async route(req: UniversalChatRequest, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const errors: Error[] = [];

    for (const adapter of this.adapters) {
      if (signal?.aborted) throw new DOMException('Aborted by client', 'AbortError');

      try {
        return await adapter.createStream(req, signal);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
        // Proceed to next fallback adapter
      }
    }

    throw new Error(`All adapters failed: ${errors.map(e => e.message).join('; ')}`);
  }
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Do not tie route handlers to specific provider formats:** Route handlers should always speak the unified `UniversalChatRequest` contract.
- ❌ **Do not hardcode endpoints:** Keep endpoints and tokens inside server environment variables.
- ❌ **Do not rely on proprietary SDK bundles:** Direct HTTP inference enables seamless zero-cost model switching.
