export interface PartnerProfile {
  id: string;
  name: string;
  headline: string;
  defaultModel: string;
  typicalTps: number;
  typicalTtfbMs: number;
  contextWindow: string;
  description: string;
  sponsorTier: 'Title Partner' | 'Strategic Partner' | 'Open Source Supporter';
  accentColor: string;
  docsUrl: string;
}

export const PARTNERS: Record<string, PartnerProfile> = {
  google: {
    id: 'google',
    name: 'Google DeepMind',
    headline: 'Gemini 2.5 Flash / Pro — Multimodal Brain',
    defaultModel: 'gemini-2.5-flash',
    typicalTps: 185,
    typicalTtfbMs: 140,
    contextWindow: '1,000,000 tokens',
    description: 'DeepMind multimodal reasoning powerhouse with native code understanding and massive 1M context cache.',
    sponsorTier: 'Title Partner',
    accentColor: '#4285F4',
    docsUrl: 'https://ai.google.dev',
  },
  groq: {
    id: 'groq',
    name: 'Groq LPU',
    headline: 'LPU Inference Engine — 500+ Tokens/Sec Sub-10ms',
    defaultModel: 'llama-3.3-70b-versatile',
    typicalTps: 520,
    typicalTtfbMs: 8,
    contextWindow: '128,000 tokens',
    description: 'Ultra-low latency Language Processing Unit designed for instant keystroke-speed coding copilot interactions.',
    sponsorTier: 'Strategic Partner',
    accentColor: '#F55036',
    docsUrl: 'https://groq.com',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    headline: 'Claude 3.5 Sonnet — Nuanced Architecture & Artifacts',
    defaultModel: 'claude-3-5-sonnet-20241022',
    typicalTps: 90,
    typicalTtfbMs: 220,
    contextWindow: '200,000 tokens',
    description: 'Exceptional code architectural fidelity, self-contained artifacts, and deep prompt caching efficiency.',
    sponsorTier: 'Strategic Partner',
    accentColor: '#D97706',
    docsUrl: 'https://anthropic.com',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT-4o',
    headline: 'GPT-4o & o1 — Reasoning Tokens & Omnimodal Execution',
    defaultModel: 'gpt-4o',
    typicalTps: 120,
    typicalTtfbMs: 190,
    contextWindow: '128,000 tokens',
    description: 'Flagship reasoning tokens with high code generation accuracy and structured schema compliance.',
    sponsorTier: 'Strategic Partner',
    accentColor: '#10A37F',
    docsUrl: 'https://openai.com',
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    headline: 'Codestral & Mistral Large — European High Efficiency',
    defaultModel: 'codestral-latest',
    typicalTps: 160,
    typicalTtfbMs: 110,
    contextWindow: '256,000 tokens',
    description: 'Specialized 80+ language coding intelligence with open weights and high compute efficiency.',
    sponsorTier: 'Open Source Supporter',
    accentColor: '#FF7000',
    docsUrl: 'https://mistral.ai',
  },
  cerebras: {
    id: 'cerebras',
    name: 'Cerebras Wafer-Scale',
    headline: 'CS-3 Wafer-Scale Engine — Instantaneous Generation',
    defaultModel: 'llama3.1-70b',
    typicalTps: 450,
    typicalTtfbMs: 6,
    contextWindow: '128,000 tokens',
    description: 'World largest monolithic silicon wafer delivering unprecedented burst inference throughput.',
    sponsorTier: 'Strategic Partner',
    accentColor: '#E11D48',
    docsUrl: 'https://cerebras.ai',
  },
  ollama: {
    id: 'ollama',
    name: 'Local Ollama & Enterprise',
    headline: 'Air-Gapped Private LLM — Zero Telemetry & Local GPUs',
    defaultModel: 'llama3.2',
    typicalTps: 65,
    typicalTtfbMs: 35,
    contextWindow: '128,000 tokens',
    description: 'Self-hosted privacy-first AI engine running entirely on local machine without external API dependencies.',
    sponsorTier: 'Open Source Supporter',
    accentColor: '#6B7280',
    docsUrl: 'https://ollama.ai',
  },
};

export const DEFAULT_PARTNER_KEY = 'google';

/**
 * Resolves a PartnerProfile from a query parameter key or defaults to Google DeepMind.
 */
export function getPartnerConfig(partnerKey?: string | null): PartnerProfile {
  if (!partnerKey) {
    return PARTNERS[DEFAULT_PARTNER_KEY];
  }
  const normalized = partnerKey.toLowerCase().trim();
  return PARTNERS[normalized] || PARTNERS[DEFAULT_PARTNER_KEY];
}

/**
 * Returns an array of all registered partner profiles.
 */
export function getAllPartners(): PartnerProfile[] {
  return Object.values(PARTNERS);
}

/**
 * Returns all registered partner key identifiers.
 */
export function getPartnerKeys(): string[] {
  return Object.keys(PARTNERS);
}
