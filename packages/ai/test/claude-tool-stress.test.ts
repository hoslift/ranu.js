import { describe, it, expect, vi } from 'vitest';
import {
  createAIProvider,
  type AIChunk,
  type StreamExecutionOptions,
} from '../src/index.js';

function createByteStreamResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function sliceIntoByteChunks(text: string, chunkSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const allBytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < allBytes.length; i += chunkSize) {
    chunks.push(allBytes.slice(i, i + chunkSize));
  }
  return chunks;
}

function sliceIntoRandomByteChunks(text: string, minSize: number, maxSize: number): Uint8Array[] {
  const encoder = new TextEncoder();
  const allBytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < allBytes.length) {
    const size = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
    chunks.push(allBytes.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

async function collectChunks(stream: ReadableStream<AIChunk>): Promise<AIChunk[]> {
  const reader = stream.getReader();
  const chunks: AIChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe('@ranu/ai — Claude Tool Calling SSE Stress & Fragmented Deltas', () => {
  it('1. Survives 1-byte extreme TCP fragmentation across all Claude tool calling SSE deltas', async () => {
    const sseLines = [
      'event: message_start\n',
      'data: {"type": "message_start", "message": {"id": "msg_01", "type": "message", "role": "assistant", "model": "claude-3-5-sonnet-20241022", "usage": {"input_tokens": 15, "output_tokens": 1}}}\n\n',
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_019H7f8Kla90", "name": "get_current_weather", "input": {}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{\\"location\\": "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "\\"San Francisco, CA\\", "}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "\\"unit\\": \\"celsius\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 42}}\n\n',
      'event: message_stop\n',
      'data: {"type": "message_stop"}\n\n',
    ].join('');

    // Extreme stress: 1 byte per chunk
    const singleByteChunks = sliceIntoByteChunks(sseLines, 1);
    expect(singleByteChunks.length).toBe(sseLines.length);

    const mockFetch = vi.fn(async () => createByteStreamResponse(singleByteChunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Weather?' });
    const chunks = await collectChunks(stream);

    // Verify tool-call chunks
    const toolChunks = chunks.filter((c) => c.type === 'tool-call');
    expect(toolChunks.length).toBe(4);

    // Header chunk
    expect(toolChunks[0]?.toolCall).toEqual({
      id: 'toolu_019H7f8Kla90',
      name: 'get_current_weather',
    });

    // Reconstruct partial JSON
    const accumulatedJson = toolChunks
      .slice(1)
      .map((c) => c.toolCall?.arguments ?? '')
      .join('');
    expect(JSON.parse(accumulatedJson)).toEqual({
      location: 'San Francisco, CA',
      unit: 'celsius',
    });

    // Verify finish chunk
    const finishChunk = chunks.find((c) => c.type === 'finish');
    expect(finishChunk).toEqual({
      type: 'finish',
      finishReason: 'tool_use',
      usage: { completionTokens: 42 },
    });
  });

  it('2. Handles 50+ fragmented micro-chunks for input_json_delta', async () => {
    const fullPayload = JSON.stringify({
      target_server: 'production-east-1',
      commands: ['systemctl restart ranu', 'journalctl -u ranu -n 50 --no-pager'],
      nested_options: {
        timeout_seconds: 30,
        retry: true,
        flags: { verbose: true, force: false },
      },
    });

    // Slice JSON string into 2-character pieces
    const partialPieces: string[] = [];
    for (let i = 0; i < fullPayload.length; i += 2) {
      partialPieces.push(fullPayload.slice(i, i + 2));
    }
    expect(partialPieces.length).toBeGreaterThanOrEqual(50);

    const sseEvents: string[] = [
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_50_micro", "name": "exec_remote", "input": {}}}\n\n',
    ];

    for (const piece of partialPieces) {
      sseEvents.push(
        'event: content_block_delta\n',
        `data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": ${JSON.stringify(piece)}}}\n\n`,
      );
    }

    sseEvents.push(
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 128}}\n\n',
    );

    const sseContent = sseEvents.join('');
    // Split into irregular byte slices (1-7 bytes)
    const byteChunks = sliceIntoRandomByteChunks(sseContent, 1, 7);

    const mockFetch = vi.fn(async () => createByteStreamResponse(byteChunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Execute remote commands' });
    const chunks = await collectChunks(stream);

    const toolChunks = chunks.filter((c) => c.type === 'tool-call');
    expect(toolChunks.length).toBe(1 + partialPieces.length);

    expect(toolChunks[0]?.toolCall?.id).toBe('toolu_50_micro');
    expect(toolChunks[0]?.toolCall?.name).toBe('exec_remote');

    const reconstructedJson = toolChunks
      .slice(1)
      .map((c) => c.toolCall?.arguments ?? '')
      .join('');
    expect(reconstructedJson).toBe(fullPayload);
    expect(JSON.parse(reconstructedJson)).toEqual(JSON.parse(fullPayload));
  });

  it('3. Handles whitespace variations, extra spaces, tabs, comments, and CRLF splits', async () => {
    const sseRaw = [
      ': keepalive heartbeat ping\r\n\r\n',
      '   \r\n',
      '\t\r\n',
      'event: content_block_start\r\n',
      'data:   {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_ws_test", "name": "query_db"}}\r\n\r\n',
      ': another comment\n\n',
      'event: content_block_delta\r\n',
      'data:\t{"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{\\n  \\"sql\\": \\"SELECT * FROM users\\\\nWHERE active = 1;\\"\\n}"}}\r\n\r\n',
      'event: content_block_stop\r\n',
      'data: {"type": "content_block_stop", "index": 0}\r\n\r\n',
      'event: message_delta\r\n',
      'data:    {"type": "message_delta", "delta": {"stop_reason": "tool_use"}}\r\n\r\n',
      '   \n\n',
      'event: message_stop\r\n',
      'data: {"type": "message_stop"}\r\n\r\n',
    ].join('');

    // Force chunk boundaries right on \r and \n characters
    const encoder = new TextEncoder();
    const allBytes = encoder.encode(sseRaw);
    const boundaryChunks: Uint8Array[] = [];
    // Slice into 5-byte chunks which will straddle \r\n and data: boundaries
    for (let i = 0; i < allBytes.length; i += 5) {
      boundaryChunks.push(allBytes.slice(i, i + 5));
    }

    const mockFetch = vi.fn(async () => createByteStreamResponse(boundaryChunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'SQL query' });
    const chunks = await collectChunks(stream);

    const toolChunks = chunks.filter((c) => c.type === 'tool-call');
    expect(toolChunks.length).toBe(2);

    expect(toolChunks[0]?.toolCall).toEqual({
      id: 'toolu_ws_test',
      name: 'query_db',
    });

    const sqlArg = toolChunks[1]?.toolCall?.arguments;
    expect(sqlArg).toBeDefined();
    const parsed = JSON.parse(sqlArg!);
    expect(parsed).toEqual({
      sql: 'SELECT * FROM users\nWHERE active = 1;',
    });

    const finishChunks = chunks.filter((c) => c.type === 'finish');
    expect(finishChunks.length).toBeGreaterThanOrEqual(1);
    expect(finishChunks[0]?.finishReason).toBe('tool_use');
  });

  it('4. Handles multiple sequential tool call IDs in a single response stream', async () => {
    const sseText = [
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_seq_01_read", "name": "read_file"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{\\"path\\": \\"package.json\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 1, "content_block": {"type": "tool_use", "id": "toolu_seq_02_search", "name": "search_code"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "input_json_delta", "partial_json": "{\\"query\\": \\"createAIProvider\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 1}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}}\n\n',
    ].join('');

    const chunks = sliceIntoRandomByteChunks(sseText, 3, 11);
    const mockFetch = vi.fn(async () => createByteStreamResponse(chunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Read and search' });
    const collected = await collectChunks(stream);

    const toolChunks = collected.filter((c) => c.type === 'tool-call');
    expect(toolChunks.length).toBe(4);

    // Call 1
    expect(toolChunks[0]?.toolCall?.id).toBe('toolu_seq_01_read');
    expect(toolChunks[0]?.toolCall?.name).toBe('read_file');
    expect(JSON.parse(toolChunks[1]?.toolCall?.arguments ?? '{}')).toEqual({
      path: 'package.json',
    });

    // Call 2
    expect(toolChunks[2]?.toolCall?.id).toBe('toolu_seq_02_search');
    expect(toolChunks[2]?.toolCall?.name).toBe('search_code');
    expect(JSON.parse(toolChunks[3]?.toolCall?.arguments ?? '{}')).toEqual({
      query: 'createAIProvider',
    });
  });

  it('5. Handles full interleaved cycle: thinking -> text -> tool_use with special-character ID', async () => {
    const sseText = [
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "thinking"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "thinking_delta", "thinking": "Let me look up the weather in Tokyo."}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 1, "content_block": {"type": "text"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 1, "delta": {"type": "text_delta", "text": "Checking current conditions..."}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 1}\n\n',
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 2, "content_block": {"type": "tool_use", "id": "toolu_spec-$chars_@123", "name": "lookup"}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 2, "delta": {"type": "input_json_delta", "partial_json": "{\\"city\\": \\"Tokyo\\"}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 2}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}, "usage": {"output_tokens": 88}}\n\n',
    ].join('');

    const chunks = sliceIntoRandomByteChunks(sseText, 4, 12);
    const mockFetch = vi.fn(async () => createByteStreamResponse(chunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Check Tokyo weather' });
    const collected = await collectChunks(stream);

    expect(collected[0]).toEqual({
      type: 'reasoning',
      reasoning: 'Let me look up the weather in Tokyo.',
    });
    expect(collected[1]).toEqual({
      type: 'text',
      text: 'Checking current conditions...',
    });
    expect(collected[2]).toEqual({
      type: 'tool-call',
      toolCall: { id: 'toolu_spec-$chars_@123', name: 'lookup' },
    });
    expect(collected[3]).toEqual({
      type: 'tool-call',
      toolCall: { arguments: '{"city": "Tokyo"}' },
    });
    expect(collected[4]).toEqual({
      type: 'finish',
      finishReason: 'tool_use',
      usage: { completionTokens: 88 },
    });
  });

  it('6. Handles large payload tool arguments (50KB) split across 50+ deltas under byte-level jitter', async () => {
    // Generate a 50KB data array
    const largeArray = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      name: `item_${i}`,
      score: Math.sin(i),
      tags: ['alpha', 'beta', 'gamma'],
    }));
    const largeJson = JSON.stringify({ items: largeArray });
    expect(largeJson.length).toBeGreaterThan(40000);

    // Split largeJson into 100 partial_json chunks
    const chunkSize = Math.ceil(largeJson.length / 100);
    const deltas: string[] = [];
    for (let i = 0; i < largeJson.length; i += chunkSize) {
      deltas.push(largeJson.slice(i, i + chunkSize));
    }

    const sseEvents: string[] = [
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_large_50kb", "name": "batch_process"}}\n\n',
    ];

    for (const d of deltas) {
      sseEvents.push(
        'event: content_block_delta\n',
        `data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": ${JSON.stringify(d)}}}\n\n`,
      );
    }

    sseEvents.push(
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}}\n\n',
    );

    const fullSse = sseEvents.join('');
    // Split into random byte chunks
    const byteChunks = sliceIntoRandomByteChunks(fullSse, 64, 512);

    const mockFetch = vi.fn(async () => createByteStreamResponse(byteChunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Process 50KB batch' });
    const collected = await collectChunks(stream);

    const toolChunks = collected.filter((c) => c.type === 'tool-call');
    expect(toolChunks[0]?.toolCall?.id).toBe('toolu_large_50kb');
    expect(toolChunks[0]?.toolCall?.name).toBe('batch_process');

    const reconstructed = toolChunks
      .slice(1)
      .map((c) => c.toolCall?.arguments ?? '')
      .join('');
    expect(reconstructed.length).toBe(largeJson.length);
    const parsed = JSON.parse(reconstructed);
    expect(parsed.items.length).toBe(500);
    expect(parsed.items[250].name).toBe('item_250');
  });

  it('7. Handles tool call with empty arguments input: {} without crashing', async () => {
    const sseText = [
      'event: content_block_start\n',
      'data: {"type": "content_block_start", "index": 0, "content_block": {"type": "tool_use", "id": "toolu_empty", "name": "get_status", "input": {}}}\n\n',
      'event: content_block_delta\n',
      'data: {"type": "content_block_delta", "index": 0, "delta": {"type": "input_json_delta", "partial_json": "{}"}}\n\n',
      'event: content_block_stop\n',
      'data: {"type": "content_block_stop", "index": 0}\n\n',
      'event: message_delta\n',
      'data: {"type": "message_delta", "delta": {"stop_reason": "tool_use"}}\n\n',
    ].join('');

    const chunks = sliceIntoByteChunks(sseText, 2);
    const mockFetch = vi.fn(async () => createByteStreamResponse(chunks));
    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const model = provider('claude-3-5-sonnet');
    const stream = await model.doStream({ prompt: 'Get status' });
    const collected = await collectChunks(stream);

    const toolChunks = collected.filter((c) => c.type === 'tool-call');
    expect(toolChunks.length).toBe(2);
    expect(toolChunks[0]?.toolCall).toEqual({ id: 'toolu_empty', name: 'get_status' });
    expect(toolChunks[1]?.toolCall).toEqual({ arguments: '{}' });
  });
});
