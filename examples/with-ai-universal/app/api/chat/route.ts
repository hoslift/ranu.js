// app/api/chat/route.ts
// Universal, Model-Agnostic AI Streaming API Route in Ranu.js

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  provider?: 'openai' | 'gemini' | 'anthropic' | 'local' | 'mock';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const { messages, provider: requestedProvider } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Array of "messages" is required.' }, { status: 400 });
    }

    // Input sanitization and length bounds
    const lastMessage = messages[messages.length - 1];
    if (
      !lastMessage ||
      typeof lastMessage.content !== 'string' ||
      lastMessage.content.length > 8000
    ) {
      return Response.json(
        { error: 'Prompt content is empty or exceeds character ceiling (8000).' },
        { status: 400 },
      );
    }

    const activeProvider = requestedProvider || process.env.AI_PROVIDER || 'openai';

    // 1. Mock / Demo Mode (instant out-of-the-box streaming without requiring API keys)
    if (
      activeProvider === 'mock' ||
      (!process.env.AI_API_KEY && activeProvider === 'openai' && !process.env.OPENAI_API_KEY)
    ) {
      return createMockStreamResponse(lastMessage.content, request.signal);
    }

    // 2. Local LLM Runner (e.g., Ollama / vLLM on localhost)
    if (activeProvider === 'local') {
      const localUrl = process.env.AI_LOCAL_URL || 'http://127.0.0.1:11434/api/chat';
      const localModel = process.env.AI_LOCAL_MODEL || 'llama3';

      const upstream = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages,
          stream: true,
        }),
        signal: request.signal,
      });

      if (!upstream.ok || !upstream.body) {
        throw new Error(`Local inference runner error: ${upstream.statusText}`);
      }

      return transformNdjsonToSse(upstream.body);
    }

    // 3. Google Gemini (REST Endpoint via Web Standard Fetch)
    if (activeProvider === 'gemini') {
      const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
      if (!geminiKey) {
        return Response.json(
          { error: 'GEMINI_API_KEY is not configured on the server.' },
          { status: 500 },
        );
      }

      const geminiModel = process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?key=${geminiKey}&alt=sse`;

      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const upstream = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
        signal: request.signal,
      });

      if (!upstream.ok || !upstream.body) {
        throw new Error(`Gemini upstream error: ${upstream.statusText}`);
      }

      return transformGeminiSse(upstream.body);
    }

    // 4. Anthropic Claude (REST Endpoint via Web Standard Fetch)
    if (activeProvider === 'anthropic') {
      const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY;
      if (!anthropicKey) {
        return Response.json(
          { error: 'ANTHROPIC_API_KEY is not configured on the server.' },
          { status: 500 },
        );
      }

      const anthropicModel = process.env.ANTHROPIC_MODEL_NAME || 'claude-3-5-sonnet-20241022';
      const anthropicMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: anthropicModel,
          max_tokens: 1024,
          messages: anthropicMessages,
          stream: true,
        }),
        signal: request.signal,
      });

      if (!upstream.ok || !upstream.body) {
        throw new Error(`Anthropic upstream error: ${upstream.statusText}`);
      }

      return transformAnthropicSse(upstream.body);
    }

    // 5. OpenAI & OpenAI-Compatible Endpoints (Default: OpenAI, Groq, DeepSeek, Together)
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'AI_API_KEY is not configured on the server.' },
        { status: 500 },
      );
    }

    const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.AI_MODEL_NAME || 'gpt-4o-mini';

    const upstream = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      throw new Error(`OpenAI-compatible inference error: ${upstream.statusText}`);
    }

    return transformOpenAiSse(upstream.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return Response.json({ error: message }, { status: 500 });
  }
}

// Transform standard OpenAI SSE stream into normalized client SSE tokens
function transformOpenAiSse(upstreamBody: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const parsed = JSON.parse(payload);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }
        } catch {
          // Ignore incomplete JSON chunks in stream
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return new Response(upstreamBody.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// Transform Gemini SSE stream into normalized client SSE tokens
function transformGeminiSse(upstreamBody: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        try {
          const parsed = JSON.parse(payload);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`));
          }
        } catch {
          // Ignore partial chunks
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return new Response(upstreamBody.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// Transform Anthropic SSE stream into normalized client SSE tokens
function transformAnthropicSse(upstreamBody: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token: parsed.delta.text })}\n\n`),
            );
          }
        } catch {
          // Ignore partial chunks
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return new Response(upstreamBody.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// Transform Ollama NDJSON stream into normalized client SSE tokens
function transformNdjsonToSse(upstreamBody: ReadableStream<Uint8Array>): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const token = parsed.message?.content;
          if (token) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          }
        } catch {
          // Ignore incomplete JSON lines
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    },
  });

  return new Response(upstreamBody.pipeThrough(transformStream), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// Built-in Demo Mock Stream for zero-config testing
function createMockStreamResponse(prompt: string, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const responseWords = [
    `Hello! `,
    `This `,
    `is `,
    `a `,
    `live `,
    `streaming `,
    `response `,
    `demonstrating `,
    `Ranu.js `,
    `with `,
    `Web `,
    `Standards `,
    `(ReadableStream).\n\n`,
    `You asked: `,
    `"${prompt}".\n\n`,
    `Notice how `,
    `each `,
    `token `,
    `is rendered `,
    `in real time `,
    `with zero `,
    `buffering! `,
    `To connect a real model, set AI_API_KEY in your .env file.`,
  ];

  const stream = new ReadableStream({
    async start(controller) {
      for (const word of responseWords) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: word })}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
