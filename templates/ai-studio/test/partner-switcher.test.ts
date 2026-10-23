import { describe, it, expect } from 'vitest';
import {
  PARTNERS,
  DEFAULT_PARTNER_KEY,
  getPartnerConfig,
  getAllPartners,
  getPartnerKeys,
} from '../src/partners.js';
import { POST } from '../app/api/studio/route.js';

describe('AI Studio Partner Switcher & Metadata', () => {
  it('falls back to Google DeepMind when no parameter or null is provided', () => {
    const configNull = getPartnerConfig(null);
    expect(configNull.id).toBe(DEFAULT_PARTNER_KEY);
    expect(configNull.name).toBe('Google DeepMind');

    const configUndefined = getPartnerConfig(undefined);
    expect(configUndefined.id).toBe(DEFAULT_PARTNER_KEY);

    const configEmpty = getPartnerConfig('');
    expect(configEmpty.id).toBe(DEFAULT_PARTNER_KEY);
  });

  it('falls back to default when unknown partner identifier is supplied', () => {
    const configUnknown = getPartnerConfig('unknown-partner-xyz');
    expect(configUnknown.id).toBe(DEFAULT_PARTNER_KEY);
    expect(configUnknown.name).toBe('Google DeepMind');
  });

  it('resolves all official partner profiles accurately', () => {
    const expectedKeys = ['google', 'groq', 'anthropic', 'openai', 'mistral', 'cerebras', 'ollama'];
    for (const key of expectedKeys) {
      const partner = getPartnerConfig(key);
      expect(partner.id).toBe(key);
      expect(partner.typicalTps).toBeGreaterThan(0);
      expect(partner.typicalTtfbMs).toBeGreaterThan(0);
      expect(partner.defaultModel).toBeTruthy();
      expect(partner.headline).toBeTruthy();
      expect(partner.description).toBeTruthy();
      expect(partner.sponsorTier).toMatch(/Title Partner|Strategic Partner|Open Source Supporter/);
      expect(partner.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(partner.docsUrl).toMatch(/^https?:\/\//);
    }
  });

  it('normalizes uppercase and whitespace in partner query strings', () => {
    expect(getPartnerConfig('  GROQ  ').id).toBe('groq');
    expect(getPartnerConfig('ANTHROPIC').id).toBe('anthropic');
    expect(getPartnerConfig('OpenAI').id).toBe('openai');
    expect(getPartnerConfig(' CeReBrAs ').id).toBe('cerebras');
  });

  it('verifies getAllPartners returns complete list with valid keys', () => {
    const all = getAllPartners();
    expect(all.length).toBeGreaterThanOrEqual(7);
    const keys = getPartnerKeys();
    expect(keys).toEqual(expect.arrayContaining(['google', 'groq', 'anthropic', 'openai', 'mistral', 'cerebras', 'ollama']));
  });

  it('verifies Groq LPU sub-10ms latency benchmark claim', () => {
    const groq = getPartnerConfig('groq');
    expect(groq.typicalTtfbMs).toBeLessThanOrEqual(10);
    expect(groq.typicalTps).toBeGreaterThanOrEqual(500);
  });

  it('verifies Google DeepMind 1M token context window claim', () => {
    const google = getPartnerConfig('google');
    expect(google.contextWindow).toContain('1,000,000');
  });
});

describe('AI Studio API Route Handler', () => {
  it('returns 400 Bad Request when prompt is omitted', async () => {
    const req = new Request('http://localhost:3000/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner: 'groq' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing prompt parameter');
  });

  it('returns 200 with standard streaming body and partner header for valid prompt', async () => {
    const req = new Request('http://localhost:3000/api/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Build a high-speed telemetry widget',
        partner: 'groq',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('X-Partner-Engine')).toBe('groq');
    expect(res.body).toBeTruthy();

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain('[Ranu.js AI Studio Engine]');
    expect(text).toContain('Groq LPU');
    expect(text).toContain('Build a high-speed telemetry widget');
  });
});
