---
'@ranu/build': minor
---

AST dynamic bracket-notation and destructured environment secret protection:

- **AST Dynamic Bracket-Notation & Destructured Secret Stripping**: Enhance `@ranu/build` environment AST validation to detect and block bracket-notation accesses (`process['env']`, `import.meta['env']`), destructured references (`const { SECRET } = process.env`), sequence operators (`(0, process)`), and aliased variable pointers in client code, reporting actionable `RanuDiagnostic` entries with exact coordinates.
