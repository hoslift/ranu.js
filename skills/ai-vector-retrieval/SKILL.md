---
name: ai-vector-retrieval
description: Procedural patterns for text embeddings, similarity search, vector retrieval, and context augmentation (RAG) in Ranu.js (@ranujs/core).
triggers:
  - 'embeddings'
  - 'vector retrieval'
  - 'rag'
  - 'cosine similarity'
---

# Universal AI Vector Retrieval Skill

This skill defines rules for generating embeddings, performing vector similarity queries, and injecting contextual memory into **Ranu.js** applications using Web Standards.

---

## 1. Zero-Dependency Embeddings Generation

Generate vector representations using standard inference HTTP endpoints:

```typescript
export async function generateEmbedding(text: string, signal?: AbortSignal): Promise<number[]> {
  const url = process.env.AI_EMBEDDING_URL || 'http://localhost:11434/api/embeddings';
  const apiKey = process.env.AI_EMBEDDING_API_KEY || 'default-token';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.AI_EMBEDDING_MODEL || 'text-embedding-default',
      input: text,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.statusText}`);
  }

  const data = await res.json();
  // Standard format normalization: data.data[0].embedding or data.embedding
  return data.data?.[0]?.embedding || data.embedding;
}
```

---

## 2. In-Memory Cosine Similarity Computation

For edge routes and fast retrieval without external vector database dependencies:

```typescript
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have equal dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## 3. Context Injection (RAG Pattern)

Assemble retrieved contexts into the prompt safely:

```typescript
export function buildAugmentedPrompt(userQuery: string, relevantSnippets: string[]): string {
  const contextBlock = relevantSnippets
    .map((chunk, idx) => `[Source ${idx + 1}]:\n${chunk}`)
    .join('\n\n');

  return `You are a helpful assistant. Use the following verified context to answer the user inquiry. If the answer cannot be found in the context, clearly state that the information is unavailable.

Context:
${contextBlock}

User Question:
${userQuery}`;
}
```

---

## 4. Anti-Patterns to Avoid

- ❌ **Do not store unindexed vectors in large client bundles:** Compute similarity on the server or use a backend vector storage adapter.
- ❌ **Do not inject uncontrolled context without limits:** Always cap the number of retrieved chunks to prevent context window overflow.
- ❌ **Do not ignore dimension mismatches:** Ensure the embedding model used for documents matches the embedding model used for queries.
