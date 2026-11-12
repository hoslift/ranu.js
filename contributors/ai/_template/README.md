# @ranu/ai-<provider> (Contributor Template)

> **Contributor Boilerplate:** Use this template to create a new AI model driver for Ranu.js conforming to the `@ranu/ai` `AIModelInstance` and `doStream` contracts.

---

## Certification Badges

Choose and display the appropriate badge in your module's README after certification:

### Free & Open-Source Modules (Community Verified):

```markdown
[![Ranu Ecosystem: Community Free](https://img.shields.io/badge/Ranu%20Ecosystem-Community%20Free-22c55e?style=flat-square&logo=github)](https://github.com/hoslift/ranu.js)
```

### Commercial / Paid Modules (Sponsored Partner):

```markdown
[![Ranu Ecosystem: Sponsored Partner](https://img.shields.io/badge/Ranu%20Ecosystem-Sponsored%20Partner-f59e0b?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/hoslift)
```

---

## Author & Contributor Credit

- **Maintained by:** [@your-github-username](https://github.com/your-github-username)
- **License:** MIT (or Commercial)

---

## Getting Started

1. Copy `contributors/ai/_template` to `ai/<provider-name>` (e.g., `ai/mistral`).
2. Update `tsconfig.json`:
   - Change `"extends": "../../../tsconfig.base.json"` to `"extends": "../../tsconfig.base.json"`.
   - Change `"path": "../../../packages/ai"` to `"path": "../../packages/ai"`.
3. Update `package.json`:
   - Set `"name": "@ranu/ai-<provider-name>"` (automatically mapped to `@ranujs/ai-<provider-name>` on npm publish).
   - Set `"version": "0.1.0"`.
   - Set `"author": "Your Name (https://github.com/your-username)"`.
   - Remove `"private": true` once ready for publication.
4. Implement your streaming driver in `src/types.ts`, `src/provider.ts`, and `src/index.ts`.
5. Submit a **Module Submission & Certification Request** issue on GitHub.
6. Once reviewed and approved, your AI driver will be certified and published!
