---
name: ai-tool-calling
description: Procedural patterns for deterministic tool calling, structured JSON output extraction, and schema validation in Ranu.js.
version: 1.0.0
compatibility: ranu >= 0.1.0
tags: [ai, tool-calling, structured-outputs, schema-validation, json]
---

# Universal AI Tool Calling Skill

This skill defines rules for declaring, invoking, and validating AI tools (function calling) and structured JSON outputs in **Ranu.js**.

---

## 1. Tool Declaration Contract

Declare tools using standard JSON Schema definitions:

```typescript
export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: TArgs) => Promise<unknown> | unknown;
}
```

---

## 2. Server Tool Execution Protocol (`app/api/agent/route.ts`)

```typescript
export async function executeToolCall(
  tools: Map<string, ToolDefinition>,
  toolName: string,
  rawArguments: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const tool = tools.get(toolName);
  if (!tool) {
    return { success: false, error: `Tool "${toolName}" not registered.` };
  }

  try {
    const parsedArgs = JSON.parse(rawArguments);
    const result = await tool.execute(parsedArgs);
    return { success: true, result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Tool execution failed',
    };
  }
}
```

---

## 3. Structured Output Extraction

For guaranteed JSON payloads, enforce system instructions and explicit validation:

```typescript
export async function extractStructuredData<T>(
  prompt: string,
  validator: (data: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  const systemPrompt = 'Respond strictly with valid JSON conforming to the requested schema. Do not include markdown codeblocks or conversational text.';

  const response = await fetch(process.env.AI_INFERENCE_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_INFERENCE_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1, // Low temperature for high determinism
    }),
    signal,
  });

  const payload = await response.json();
  const rawText = payload.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(rawText.trim());

  return validator(parsed);
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Never execute tool arguments blindly:** Always parse with `try/catch` and validate types against the schema.
- ❌ **Never run destructive tools without confirmation:** Keep critical actions (e.g. database deletions) guarded by server authorization or confirmation tokens.
- ❌ **Do not parse streaming chunks manually for tool calls:** Wait for the complete tool invocation delta or utilize structured function-call streaming protocols.
