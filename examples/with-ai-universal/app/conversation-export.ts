export interface ExportMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export function conversationToMarkdown(messages: readonly ExportMessage[]): string {
  const sections = messages.map((message) => {
    const author = message.role === 'user' ? 'User' : 'AI Assistant';

    let timestamp: string | null = null;

    if (message.timestamp) {
      const date = new Date(message.timestamp);

      if (!Number.isNaN(date.getTime())) {
        timestamp = date.toISOString();
      }
    }

    const quotedContent = message.content
      .split(/\r\n|\r|\n/)
      .map((line) => `> ${line}`)
      .join('\n');

    return [`## ${author}`, ...(timestamp ? [`Time: ${timestamp}`] : []), '', quotedContent].join(
      '\n',
    );
  });

  return ['# Conversation', ...sections].join('\n\n') + '\n';
}

export function conversationToJson(messages: readonly ExportMessage[]): string {
  return JSON.stringify(messages, null, 2);
}
