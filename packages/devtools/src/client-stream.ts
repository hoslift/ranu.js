import type { AIStudioPartner, PendingDiff } from './types.js';
import {
  getDevToolsState,
  setAIStudioState,
  setPendingDiff,
} from './state.js';
import { computePatchSummary } from './diff.js';

let activeAbortController: AbortController | null = null;

export interface SubmitAIPromptOptions {
  endpoint?: string;
  partner?: AIStudioPartner;
  filePath?: string;
  originalContent?: string;
}

/**
 * Aborts any currently active AI generation request.
 */
export function abortAIGeneration(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  setAIStudioState({ isGenerating: false });
}

/**
 * Submits a natural language prompt to the AI endpoint and streams the response
 * using W3C ReadableStream DefaultReader and TextDecoder. Automatically extracts
 * code proposals, computes patch summaries, and stages a pending diff.
 */
export async function submitAIPrompt(
  prompt: string,
  options: SubmitAIPromptOptions = {},
): Promise<void> {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  const state = getDevToolsState();
  const partner = options.partner ?? state.aiStudio.selectedPartner;
  const endpoint = options.endpoint ?? '/api/ai';
  const filePath = options.filePath ?? state.currentRoute?.pathname ?? 'app/page.tsx';
  const originalContent = options.originalContent ?? '';

  setAIStudioState({
    isGenerating: true,
    currentPrompt: prompt,
    streamingResponse: '',
    error: undefined,
    pendingDiff: undefined,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json, text/plain',
      },
      body: JSON.stringify({
        prompt,
        partner,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`AI endpoint error ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      const text = await response.text();
      handleCompletion(text, filePath, originalContent);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        if (!frame.trim()) continue;
        const lines = frame.split('\n');
        let eventType = 'chunk';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5).trim();
          }
        }

        if (eventType === 'error') {
          let errorMsg = 'AI generation error';
          try {
            const errObj = JSON.parse(dataStr);
            errorMsg = errObj.message ?? errObj.error ?? errorMsg;
          } catch {
            if (dataStr) errorMsg = dataStr;
          }
          setAIStudioState({ error: errorMsg, isGenerating: false });
          return;
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            const chunkText = parsed.text ?? parsed.content ?? parsed.reasoning ?? '';
            accumulatedText += chunkText;
          } catch {
            accumulatedText += dataStr;
          }
          setAIStudioState({ streamingResponse: accumulatedText });
        }
      }
    }

    handleCompletion(accumulatedText, filePath, originalContent);
  } catch (err: unknown) {
    if (signal.aborted || (err as Error).name === 'AbortError') {
      setAIStudioState({ isGenerating: false });
      return;
    }
    const message = (err as Error).message ?? String(err);
    setAIStudioState({
      isGenerating: false,
      error: message,
    });
  } finally {
    if (activeAbortController?.signal === signal) {
      activeAbortController = null;
    }
  }
}

function handleCompletion(
  rawText: string,
  filePath: string,
  originalContent: string,
): void {
  const codeBlockMatch = /```(?:tsx|ts|jsx|js|html|css)?\s*\n([\s\S]*?)```/.exec(rawText);
  const proposedContent = codeBlockMatch ? codeBlockMatch[1]!.trim() : rawText.trim();

  const patchSummary = computePatchSummary(filePath, originalContent, proposedContent);

  const pendingDiff: PendingDiff = {
    filePath,
    originalContent,
    proposedContent,
    patchSummary,
  };

  setPendingDiff(pendingDiff);
  setAIStudioState({
    isGenerating: false,
    streamingResponse: rawText,
  });
}
