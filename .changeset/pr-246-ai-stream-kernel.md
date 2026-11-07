---
'@ranu/ai': minor
---

Implement streamAI execution kernel with W3C ReadableStream protocol, Server-Sent Events (SSE) event framing (chunk, reasoning, tool-call, finish, error, [DONE]), queue-bounded backpressure drain management (<64KB highWaterMark), and AbortSignal propagation.
