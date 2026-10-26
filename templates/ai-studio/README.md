# Ranu.js AI Studio Showcase Template

This template showcases the Ranu.js Native AI Developer Studio ecosystem with a modular partner switcher supporting leading AI model providers.

## Supported AI Model Partners

- **Google DeepMind** (`?partner=google`): Gemini 2.5 Flash / Pro with 1M+ context window and native multimodality.
- **Groq** (`?partner=groq`): LPU inference engine powering sub-10ms TTFB and 500+ tokens/sec throughput.
- **Anthropic** (`?partner=anthropic`): Claude 3.5 Sonnet with prompt caching and artifact code generation.
- **OpenAI** (`?partner=openai`): GPT-4o and o1 reasoning token architecture.
- **Mistral AI** (`?partner=mistral`): European high-efficiency open-weight models (Codestral, Mistral Large).
- **Cerebras** (`?partner=cerebras`): Wafer-scale CS-3 ultra-fast inference.
- **Local Ollama** (`?partner=ollama`): Zero-telemetry offline local AI model runner.

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Visit `http://localhost:3000?partner=groq` to test specific partner profiles.
