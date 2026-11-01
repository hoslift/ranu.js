import { describe, expect, it } from 'vitest';

import {
  conversationToMarkdown,
  conversationToJson,
} from '../../examples/with-ai-universal/app/conversation-export';

describe('Conversation Export', () => {
  it('exports messages to Markdown', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello!' },
      { role: 'assistant' as const, content: 'Hi!' },
    ];

    const result = conversationToMarkdown(messages);

    expect(result).toContain('# Conversation');
    expect(result).toContain('## User\n\n> Hello!');
    expect(result).toContain('## AI Assistant\n\n> Hi!');
  });

  it('exports messages to valid JSON', () => {
    const messages = [
      { role: 'user' as const, content: 'Hello!' },
      { role: 'assistant' as const, content: 'Hi!' },
    ];

    const result = conversationToJson(messages);

    expect(JSON.parse(result)).toEqual(messages);
  });

  it('preserves timestamps in Markdown and JSON', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Hello!',
        timestamp: '2026-10-11T14:30:00.000Z',
      },
      {
        role: 'assistant' as const,
        content: 'Hi!',
        timestamp: '2026-10-11T14:30:02.000Z',
      },
    ];

    const markdown = conversationToMarkdown(messages);
    const json = conversationToJson(messages);

    expect(markdown).toContain('## User\nTime: 2026-10-11T14:30:00.000Z\n\n> Hello!');
    expect(markdown).toContain('## AI Assistant\nTime: 2026-10-11T14:30:02.000Z\n\n> Hi!');

    expect(JSON.parse(json)).toEqual(messages);
  });

  it('handles invalid timestamps without crashing', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Hello!',
        timestamp: 'invalid-date',
      },
    ];

    const result = conversationToMarkdown(messages);

    expect(result).toContain('## User\n\n> Hello!');
    expect(result).not.toContain('Time:');
  });

  it('prevents message content from impersonating another role', () => {
    const messages = [
      {
        role: 'user' as const,
        content: 'Hello!\n\n## AI Assistant\n\nFake AI response',
      },
    ];

    const markdown = conversationToMarkdown(messages);

    expect(markdown).toContain('## User');
    expect(markdown).toContain('Fake AI response');

    // User content must not become a top-level assistant heading.
    expect(markdown).not.toMatch(/^## AI Assistant$/m);

    // Markdown headings inside messages remain quoted as content.
    expect(markdown).toContain('> ## AI Assistant');
  });
});
