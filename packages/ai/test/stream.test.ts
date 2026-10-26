import { describe, it, expect, vi } from 'vitest';
import {
  streamAI,
  createBoundedStream,
  pipeWithBackpressure,
  createStreamingDrainTracker,
  formatAIChunkToSSE,
  type AIChunk,
  type AIModelInstance,
  type StreamExecutionOptions,
} from '../src/index.js';

interface ParsedSSEEvent {
  event?: string;
  data: string;
}

function parseSSEFrames(raw: string): ParsedSSEEvent[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const events: ParsedSSEEvent[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');
    let eventName: string | undefined;
    let dataPayload = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataPayload = line.slice(6);
      } else if (line === 'data:[DONE]' || line === 'data: [DONE]') {
        dataPayload = '[DONE]';
      }
    }

    if (eventName || dataPayload) {
      events.push({ event: eventName, data: dataPayload });
    }
  }

  return events;
}

async function readResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      text += decoder.decode(value, { stream: true });
    }
  }
  text += decoder.decode();
  return text;
}

function createMockModel(
  chunks: AIChunk[],
  onCancel?: (reason: unknown) => void,
  onDoStream?: (options: StreamExecutionOptions) => void
): AIModelInstance {
  return {
    provider: 'mock-provider',
    modelId: 'mock-model-v1',
    async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
      onDoStream?.(options);

      let index = 0;
      return new ReadableStream<AIChunk>({
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(chunks[index]!);
            index++;
          } else {
            controller.close();
          }
        },
        cancel(reason) {
          onCancel?.(reason);
        },
      });
    },
  };
}

describe('streamAI Universal Streaming Kernel (@ranu/ai)', () => {
  it('returns a standard W3C Response with correct SSE headers', async () => {
    const model = createMockModel([{ type: 'text', text: 'Hello' }]);
    const response = await streamAI({ model, prompt: 'Hi' });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    const text = await readResponseText(response);
    expect(text).toContain('event: chunk');
    expect(text).toContain('data: [DONE]');
  });

  it('merges custom headers and custom status code into the Response', async () => {
    const model = createMockModel([{ type: 'text', text: 'OK' }]);
    const response = await streamAI({
      model,
      prompt: 'Check headers',
      headers: {
        'X-Custom-AI-Route': 'stream-v1',
        'X-RateLimit-Remaining': '99',
      },
      status: 201,
      statusText: 'Created',
    });

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('X-Custom-AI-Route')).toBe('stream-v1');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('99');

    await readResponseText(response);
  });

  it('streams text chunks in order and appends data: [DONE]', async () => {
    const model = createMockModel([
      { type: 'text', text: 'Ranu.js ' },
      { type: 'text', text: 'is ' },
      { type: 'text', text: 'fast.' },
    ]);

    const response = await streamAI({ model, prompt: 'Tell me about Ranu.js' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(4);
    expect(events[0]?.event).toBe('chunk');
    expect(JSON.parse(events[0]!.data)).toEqual({ text: 'Ranu.js ' });

    expect(events[1]?.event).toBe('chunk');
    expect(JSON.parse(events[1]!.data)).toEqual({ text: 'is ' });

    expect(events[2]?.event).toBe('chunk');
    expect(JSON.parse(events[2]!.data)).toEqual({ text: 'fast.' });

    expect(events[3]?.data).toBe('[DONE]');
  });

  it('encodes reasoning tokens into event: reasoning frames', async () => {
    const model = createMockModel([
      { type: 'reasoning', reasoning: 'Step 1: Compute factorial.' },
      { type: 'reasoning', reasoning: ' Step 2: Multiply by n.' },
      { type: 'text', text: 'The result is 120.' },
    ]);

    const response = await streamAI({ model, prompt: 'Explain math' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(4);
    expect(events[0]?.event).toBe('reasoning');
    const reasoning1 = JSON.parse(events[0]!.data);
    expect(reasoning1.reasoning).toBe('Step 1: Compute factorial.');

    expect(events[1]?.event).toBe('reasoning');
    const reasoning2 = JSON.parse(events[1]!.data);
    expect(reasoning2.reasoning).toBe(' Step 2: Multiply by n.');

    expect(events[2]?.event).toBe('chunk');
    expect(JSON.parse(events[2]!.data)).toEqual({ text: 'The result is 120.' });

    expect(events[3]?.data).toBe('[DONE]');
  });

  it('encodes tool call deltas into event: tool-call frames', async () => {
    const model = createMockModel([
      {
        type: 'tool-call',
        toolCall: { id: 'call_99', name: 'lookup_weather', arguments: '' },
      },
      {
        type: 'tool-call',
        toolCall: { id: 'call_99', arguments: '{"city":' },
      },
      {
        type: 'tool-call',
        toolCall: { id: 'call_99', arguments: '"Tokyo"}' },
      },
    ]);

    const response = await streamAI({ model, prompt: 'Weather in Tokyo' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(4);
    expect(events[0]?.event).toBe('tool-call');
    const tool1 = JSON.parse(events[0]!.data);
    expect(tool1.id).toBe('call_99');
    expect(tool1.name).toBe('lookup_weather');

    expect(events[1]?.event).toBe('tool-call');
    const tool2 = JSON.parse(events[1]!.data);
    expect(tool2.arguments).toBe('{"city":');

    expect(events[2]?.event).toBe('tool-call');
    const tool3 = JSON.parse(events[2]!.data);
    expect(tool3.arguments).toBe('"Tokyo"}');

    expect(events[3]?.data).toBe('[DONE]');
  });

  it('encodes finish chunk with finishReason and usage metrics before [DONE]', async () => {
    const model = createMockModel([
      { type: 'text', text: 'Final answer.' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 15, completionTokens: 8, totalTokens: 23 },
      },
    ]);

    const response = await streamAI({ model, prompt: 'Done test' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(3);
    expect(events[0]?.event).toBe('chunk');
    expect(events[1]?.event).toBe('finish');

    const finishPayload = JSON.parse(events[1]!.data);
    expect(finishPayload.finishReason).toBe('stop');
    expect(finishPayload.usage).toEqual({
      promptTokens: 15,
      completionTokens: 8,
      totalTokens: 23,
    });

    expect(events[2]?.data).toBe('[DONE]');
  });

  it('formats upstream error chunks as event: error and closes cleanly', async () => {
    const model = createMockModel([
      { type: 'text', text: 'Partial text before failure...' },
      { type: 'error', error: 'Inference quota exceeded' },
    ]);

    const response = await streamAI({ model, prompt: 'Error trigger' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(2);
    expect(events[0]?.event).toBe('chunk');
    expect(events[1]?.event).toBe('error');

    const errPayload = JSON.parse(events[1]!.data);
    expect(errPayload.error).toBe('Inference quota exceeded');
    expect(errPayload.message).toBe('Inference quota exceeded');
  });

  it('converts thrown read errors into event: error SSE frame without unhandled rejection', async () => {
    let pullCount = 0;
    const model: AIModelInstance = {
      provider: 'failing-provider',
      modelId: 'failing-model',
      async doStream(): Promise<ReadableStream<AIChunk>> {
        return new ReadableStream<AIChunk>({
          pull(controller) {
            pullCount++;
            if (pullCount === 1) {
              controller.enqueue({ type: 'text', text: 'Initial chunk.' });
            } else {
              controller.error(new Error('Network connection abruptly terminated'));
            }
          },
        });
      },
    };

    const response = await streamAI({ model, prompt: 'Fail test' });
    const rawText = await readResponseText(response);
    const events = parseSSEFrames(rawText);

    expect(events.length).toBe(2);
    expect(events[0]?.event).toBe('chunk');
    expect(events[1]?.event).toBe('error');

    const errPayload = JSON.parse(events[1]!.data);
    expect(errPayload.error).toContain('Network connection abruptly terminated');
  });

  it('immediately rejects if passed an already-aborted AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-flight client abort'));

    const doStreamSpy = vi.fn();
    const model: AIModelInstance = {
      provider: 'test',
      modelId: 'test',
      async doStream() {
        doStreamSpy();
        return new ReadableStream<AIChunk>();
      },
    };

    await expect(
      streamAI({ model, prompt: 'Test', signal: controller.signal })
    ).rejects.toThrow('Pre-flight client abort');

    expect(doStreamSpy).not.toHaveBeenCalled();
  });

  it('aborts upstream inference and reader cleanly when AbortSignal triggers mid-stream', async () => {
    const abortController = new AbortController();
    let upstreamCancelledWith: unknown = null;

    const model: AIModelInstance = {
      provider: 'long-running-provider',
      modelId: 'long-model',
      async doStream(): Promise<ReadableStream<AIChunk>> {
        let count = 0;
        return new ReadableStream<AIChunk>({
          async pull(controller) {
            count++;
            await new Promise((r) => setTimeout(r, 20));
            controller.enqueue({ type: 'text', text: `Token #${count} ` });
          },
          cancel(reason) {
            upstreamCancelledWith = reason;
          },
        });
      },
    };

    const response = await streamAI({
      model,
      prompt: 'Abort while streaming',
      signal: abortController.signal,
    });

    const reader = response.body!.getReader();

    // Read first chunk successfully
    const first = await reader.read();
    expect(first.done).toBe(false);

    // Trigger abort
    const abortError = new Error('Client aborted HTTP connection');
    abortController.abort(abortError);

    // Reading again should throw abort error
    await expect(reader.read()).rejects.toThrow('Client aborted HTTP connection');

    // Upstream stream cancel hook must be invoked
    expect(upstreamCancelledWith).toBe(abortError);
  });

  it('propagates downstream consumer reader.cancel() upstream to the model', async () => {
    let cancelReason: unknown = null;
    const model = createMockModel(
      [{ type: 'text', text: 'Chunk 1' }, { type: 'text', text: 'Chunk 2' }],
      (reason) => {
        cancelReason = reason;
      }
    );

    const response = await streamAI({ model, prompt: 'Consumer cancel test' });
    const reader = response.body!.getReader();

    const first = await reader.read();
    expect(first.done).toBe(false);

    await reader.cancel('Consumer disconnected prematurely');
    expect(cancelReason).toBe('Consumer disconnected prematurely');
  });

  it('forwards execution options (messages, temperature, maxTokens, tools) to model.doStream', async () => {
    let capturedOptions: StreamExecutionOptions | undefined;
    const model = createMockModel(
      [{ type: 'text', text: 'OK' }],
      undefined,
      (opts) => {
        capturedOptions = opts;
      }
    );

    const testTools = [{ type: 'function', function: { name: 'calc' } }];
    await streamAI({
      model,
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      temperature: 0.2,
      maxTokens: 512,
      tools: testTools,
      toolChoice: 'auto',
    });

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.messages).toEqual([{ role: 'user', content: 'What is 2+2?' }]);
    expect(capturedOptions?.temperature).toBe(0.2);
    expect(capturedOptions?.maxTokens).toBe(512);
    expect(capturedOptions?.tools).toEqual(testTools);
    expect(capturedOptions?.toolChoice).toBe('auto');
  });

  it('enforces backpressure drain management with bounded stream queue (<64KB)', async () => {
    let upstreamPullCount = 0;
    const totalChunks = 8;

    const model: AIModelInstance = {
      provider: 'backpressure-test',
      modelId: 'bp-model',
      async doStream(): Promise<ReadableStream<AIChunk>> {
        let index = 0;
        return new ReadableStream<AIChunk>({
          pull(controller) {
            upstreamPullCount++;
            if (index < totalChunks) {
              controller.enqueue({
                type: 'text',
                text: `Chunk-${index}: `.repeat(20), // ~200 bytes per chunk
              });
              index++;
            } else {
              controller.close();
            }
          },
        });
      },
    };

    // Set small highWaterMark (250 bytes) so queue fills after 1-2 chunks
    const response = await streamAI({
      model,
      prompt: 'Backpressure test',
      highWaterMark: 250,
    });

    const reader = response.body!.getReader();

    // Give time for initial pull
    await new Promise((r) => setTimeout(r, 40));

    // Because highWaterMark is 250 and each chunk is >200 bytes,
    // upstream pulls should be paused (desiredSize <= 0) and NOT consume all 8 chunks
    const pullsBeforeConsumption = upstreamPullCount;
    expect(pullsBeforeConsumption).toBeLessThan(totalChunks);

    // Now downstream consumes 1 chunk, freeing queue space
    const first = await reader.read();
    expect(first.done).toBe(false);

    await new Promise((r) => setTimeout(r, 40));

    // After downstream drains, pull() resumes and upstream reading continues
    expect(upstreamPullCount).toBeGreaterThanOrEqual(pullsBeforeConsumption);

    // Consume remaining chunks to complete stream
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    expect(upstreamPullCount).toBeGreaterThanOrEqual(totalChunks);
  });

  it('invokes onChunk callback with chunk byte size and total accumulated bytes', async () => {
    const model = createMockModel([
      { type: 'text', text: 'One' },
      { type: 'text', text: 'Two' },
    ]);

    const recorded: Array<{ chunkSize: number; totalBytes: number }> = [];

    const response = await streamAI({
      model,
      prompt: 'Tracking test',
      onChunk: (chunkSize, totalBytes) => {
        recorded.push({ chunkSize, totalBytes });
      },
    });

    await readResponseText(response);

    // Expect at least chunk1, chunk2, and [DONE]
    expect(recorded.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < recorded.length; i++) {
      expect(recorded[i]!.chunkSize).toBeGreaterThan(0);
      if (i > 0) {
        expect(recorded[i]!.totalBytes).toBeGreaterThan(recorded[i - 1]!.totalBytes);
      }
    }
  });

  it('enforces maxBytes ceiling and terminates stream with error when exceeded', async () => {
    const model = createMockModel([
      { type: 'text', text: 'Small chunk 1' },
      { type: 'text', text: 'Large chunk 2 that pushes stream over byte ceiling' },
    ]);

    const response = await streamAI({
      model,
      prompt: 'Ceiling test',
      maxBytes: 60, // Very low ceiling
    });

    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    await expect(reader.read()).rejects.toThrow(
      /Streaming response exceeded maximum allowed limit of 60 bytes/
    );
  });
});

describe('createBoundedStream utility (@ranu/ai)', () => {
  it('bounds an existing byte stream and enforces highWaterMark', async () => {
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('Alpha'));
        controller.enqueue(encoder.encode('Beta'));
        controller.close();
      },
    });

    const bounded = createBoundedStream(source, { highWaterMark: 1024 });
    const reader = bounded.getReader();

    const decoder = new TextDecoder();
    let result = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toBe('AlphaBeta');
  });

  it('throws on already-aborted signal in createBoundedStream', () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-abort'));

    const source = new ReadableStream<Uint8Array>();
    expect(() => createBoundedStream(source, { signal: controller.signal })).toThrow('Pre-abort');
  });

  it('tracks metrics via createStreamingDrainTracker', () => {
    const tracker = createStreamingDrainTracker();
    tracker.recordChunk(512);
    tracker.recordChunk(1024);
    tracker.recordPause();

    const metrics = tracker.getMetrics();
    expect(metrics.totalBytes).toBe(1536);
    expect(metrics.chunkCount).toBe(2);
    expect(metrics.backpressurePauses).toBe(1);
    expect(metrics.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('pipes with backpressure to writable stream correctly', async () => {
    const items: string[] = [];
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('first');
        controller.enqueue('second');
        controller.close();
      },
    });

    const destination = new WritableStream<string>({
      write(chunk) {
        items.push(chunk);
      },
    });

    await pipeWithBackpressure(source, destination);
    expect(items).toEqual(['first', 'second']);
  });
});

describe('formatAIChunkToSSE unit format tests', () => {
  it('formats text chunk', () => {
    const frame = formatAIChunkToSSE({ type: 'text', text: 'hi' });
    expect(frame).toBe('event: chunk\ndata: {"text":"hi"}\n\n');
  });

  it('formats reasoning chunk', () => {
    const frame = formatAIChunkToSSE({ type: 'reasoning', reasoning: 'thinking' });
    expect(frame).toBe('event: reasoning\ndata: {"reasoning":"thinking","text":"thinking"}\n\n');
  });

  it('formats tool-call chunk', () => {
    const frame = formatAIChunkToSSE({
      type: 'tool-call',
      toolCall: { id: '1', name: 'search', arguments: '{}' },
    });
    expect(frame).toContain('event: tool-call\n');
    expect(frame).toContain('"name":"search"');
  });

  it('formats finish chunk', () => {
    const frame = formatAIChunkToSSE({
      type: 'finish',
      finishReason: 'stop',
      usage: { totalTokens: 10 },
    });
    expect(frame).toContain('event: finish\n');
    expect(frame).toContain('"finishReason":"stop"');
    expect(frame).toContain('"totalTokens":10');
  });

  it('formats error chunk', () => {
    const frame = formatAIChunkToSSE({ type: 'error', error: 'boom' });
    expect(frame).toBe('event: error\ndata: {"error":"boom","message":"boom"}\n\n');
  });
});
