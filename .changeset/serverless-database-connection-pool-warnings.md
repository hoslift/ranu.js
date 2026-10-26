---
'@ranu/build': minor
---

Introduce AST static compiler validation for serverless database connection pool exhaustion (`RANU_BUILD_SERVERLESS_DB_POOL`), warning developers when high connection limits (`max > 1`) are configured for ephemeral serverless and edge deployment targets.
