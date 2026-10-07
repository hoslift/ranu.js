import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type ProviderType = 'openai' | 'gemini' | 'anthropic' | 'local' | 'mock';

export default function UniversalAiChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Welcome to **Ranu.js Universal AI Chat**! This reference application demonstrates real-time streaming inference using pure Web Standards (`ReadableStream` & SSE) without proprietary SDK wrappers.\n\nType a message below or switch providers to test streaming.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState<ProviderType>('openai');
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || isStreaming) return;

    setError(null);
    setInput('');

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
    setMessages(newMessages);

    // Prepare assistant placeholder message
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          provider,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);

          if (payload === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(payload) as { token?: string };
            if (parsed.token) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.token,
                  };
                }
                return updated;
              });
            }
          } catch {
            // Incomplete JSON chunk
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Stream aborted gracefully by user
      } else {
        const message = err instanceof Error ? err.message : 'Failed to stream response';
        setError(message);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '1rem',
      }}
    >
      {/* App Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          marginBottom: '1rem',
          border: '1px solid #334155',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8' }}>
            Ranu.js Universal AI Chat
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Model-Agnostic Web Standards Streaming (React 19)
          </p>
        </div>

        {/* Provider Switcher Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="provider-select" style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
            Provider:
          </label>
          <select
            id="provider-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderType)}
            disabled={isStreaming}
            style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.85rem',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="openai">OpenAI / Compatible</option>
            <option value="gemini">Google Gemini</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="local">Local (Ollama 127.0.0.1)</option>
            <option value="mock">Demo Simulation (No Key)</option>
          </select>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          border: '1px solid #334155',
        }}
      >
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={index}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                backgroundColor: isUser ? '#2563eb' : '#0f172a',
                color: '#f8fafc',
                padding: '0.85rem 1.15rem',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                border: isUser ? 'none' : '1px solid #334155',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
                fontSize: '0.95rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: isUser ? '#bfdbfe' : '#38bdf8',
                  textTransform: 'uppercase',
                }}
              >
                {isUser ? 'You' : 'AI Assistant'}
              </div>
              {msg.content}
              {!isUser && isStreaming && index === messages.length - 1 && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '14px',
                    backgroundColor: '#38bdf8',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    animation: 'blink 1s step-end infinite',
                  }}
                />
              )}
            </div>
          );
        })}

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#451a1a',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '0.875rem',
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={chatBottomRef} />
      </main>

      {/* Input & Controls Form */}
      <footer style={{ marginTop: '1rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              provider === 'mock'
                ? 'Type anything to test the real-time simulation stream...'
                : `Ask ${provider} anything...`
            }
            disabled={isStreaming}
            style={{
              flex: 1,
              padding: '0.85rem 1.15rem',
              backgroundColor: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              style={{
                padding: '0.85rem 1.5rem',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{
                padding: '0.85rem 1.5rem',
                backgroundColor: input.trim() ? '#2563eb' : '#334155',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Send
            </button>
          )}
        </form>
      </footer>
    </div>
  );
}
