import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RanuDevTools } from '../src/component.js';
import {
  resetDevToolsState,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  setCurrentPrompt,
  setPendingDiff,
  setAIStudioState,
  setDevToolsDockPosition,
  recordStreamingChunk,
} from '../src/state.js';

describe('React 19 <RanuDevTools /> Component', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    resetDevToolsState();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('renders nothing in production mode (NODE_ENV === "production")', () => {
    process.env.NODE_ENV = 'production';
    const html = renderToString(<RanuDevTools />);
    expect(html).toBe('');
  });

  it('renders closed dock launcher in development mode', () => {
    recordStreamingChunk(512, 'chunk preview');
    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('Ranu DevTools');
    expect(html).toContain('⚡');
    expect(html).toContain('launcher');
    expect(html).toContain('1'); // Chunk count badge
  });

  it('renders open panel with 5 tabs including AI Studio', () => {
    toggleDevToolsDock();
    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('panel');
    expect(html).toContain('Waterfall (0)');
    expect(html).toContain('Route Hierarchy');
    expect(html).toContain('Hydration (pending)');
    expect(html).toContain('Diagnostics (0)');
    expect(html).toContain('AI Studio ✨');
  });

  it('renders AI Studio tab with partner badges, prompt input, and Generate button', () => {
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');
    setCurrentPrompt('Add responsive navigation bar');

    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('PARTNER:');
    expect(html).toContain('✦ Gemini');
    expect(html).toContain('⚡ Groq');
    expect(html).toContain('▲ Claude');
    expect(html).toContain('● OpenAI');
    expect(html).toContain('⚙ Custom');

    expect(html).toContain('value="Add responsive navigation bar"');
    expect(html).toContain('Generate');
    expect(html).toContain('Select an AI partner, enter your instructions above');
  });

  it('renders Stop button and streaming response when generating', () => {
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');
    setAIStudioState({
      isGenerating: true,
      streamingResponse: '```tsx\nexport const Banner = () => <div>Hello</div>;\n```',
    });

    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('Stop');
    expect(html).toContain('export const Banner');
  });

  it('renders error banner when AIStudioState contains error', () => {
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');
    setAIStudioState({
      error: 'Model provider quota exceeded',
    });

    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('Error: Model provider quota exceeded');
  });

  it('renders Visual Diff review card with additions, removals, and Accept/Discard buttons', () => {
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');
    setPendingDiff({
      filePath: 'app/routes/pricing.tsx',
      originalContent: 'export default function Pricing() {\n  return <div>Free</div>;\n}',
      proposedContent: 'export default function Pricing() {\n  return <div>Pro Plan $19/mo</div>;\n}',
      patchSummary: 'app/routes/pricing.tsx: +1 -1 lines',
    });

    const html = renderToString(<RanuDevTools />);

    expect(html).toContain('app/routes/pricing.tsx');
    expect(html).toContain('+1 -1 lines');
    expect(html).toContain('✓ Accept Changes');
    expect(html).toContain('✕ Discard');

    // Additions and removals present in diff
    expect(html).toContain('return &lt;div&gt;Free&lt;/div&gt;;');
    expect(html).toContain('return &lt;div&gt;Pro Plan $19/mo&lt;/div&gt;;');
    expect(html).toContain('diff-line added');
    expect(html).toContain('diff-line removed');
    expect(html).toContain('+');
    expect(html).toContain('-');
  });

  it('adjusts position styles when dockPosition is set to top', () => {
    toggleDevToolsDock();
    setDevToolsDockPosition('top');

    const html = renderToString(<RanuDevTools />);
    expect(html).toContain('top:0');
  });
});
