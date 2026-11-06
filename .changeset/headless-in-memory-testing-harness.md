---
'@ranu/testing': minor
'@ranujs/core': minor
---

Introduce `@ranu/testing` headless in-memory test harness (`createTestContext`) and assertions (`expectStatus`, `expectHeader`, `expectJson`, `expectText`, `expectRedirect`) for sub-50ms request/response verification without network socket overhead, exposed under `@ranu/testing` and `ranu/testing`.
