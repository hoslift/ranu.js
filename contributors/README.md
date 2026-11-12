# Ranu.js Contributor Module Templates

Welcome to the centralized contributor starter directory for the Ranu.js modular ecosystem.
Each category directory below contains a clean `_template` boilerplate to help you scaffold, test, and submit a new module.

---

## Directory Structure

| Template Path                         | Target Category          | Proposed Package Name Pattern   |
| :------------------------------------ | :----------------------- | :------------------------------ |
| `contributors/ai/_template`           | `ai/<provider>`          | `@ranujs/ai-<provider>`         |
| `contributors/adapters/_template`     | `adapters/<platform>`    | `@ranujs/adapter-<platform>`    |
| `contributors/integrations/_template` | `integrations/<service>` | `@ranujs/integration-<service>` |
| `contributors/plugins/_template`      | `plugins/<feature>`      | `@ranujs/plugin-<feature>`      |
| `contributors/tools/_template`        | `tools/<tool>`           | `@ranujs/tool-<tool>`           |
| `contributors/ui/_template`           | `ui/<component>`         | `@ranujs/ui-<component>`        |

---

## Quick Start

1. **Copy the template** for your target category into the corresponding repository directory:
   ```bash
   # Example for a deployment adapter:
   cp -r contributors/adapters/_template adapters/<platform-name>
   ```
2. **Update `tsconfig.json`**:
   - Adjust `"extends": "../../../tsconfig.base.json"` to `"extends": "../../tsconfig.base.json"` since your module now lives two levels deep from the repository root.
3. **Update `package.json`**:
   - Set `"name"` (e.g., `"@ranujs/adapter-<platform-name>"`).
   - Set `"version"` (start new modules at `"0.1.0"`).
   - Set `"author": "Your Name (https://github.com/your-username)"`.
   - Set `"private": false` once ready for publication.
4. **Update `README.md`** with usage instructions, author credit, and your tier badge.
5. **Submit for Review & Certification**:
   - Open a [New Module Submission & Certification](https://github.com/hoslift/ranu.js/issues/new?template=module_submission.yml) issue on GitHub.
   - Follow the Pull Request rules and checklist in [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Ecosystem Certification Badges

All certification badges are verified automatically by CI (`scripts/verify-badges.mjs`) against `.ecosystem/certified-modules.json`. Add the matching badge to your module's `README.md` only after review/certification:

### Free & Open-Source Modules (`community-free`)

```markdown
[![Ranu Ecosystem: Community Free](https://img.shields.io/badge/Ranu%20Ecosystem-Community%20Free-22c55e?style=flat-square&logo=github)](https://github.com/hoslift/ranu.js)
```

### Commercial / Sponsored Partner Modules (`sponsored-partner`)

```markdown
[![Ranu Ecosystem: Sponsored Partner](https://img.shields.io/badge/Ranu%20Ecosystem-Sponsored%20Partner-f59e0b?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/hoslift)
```

---

## License

Unless otherwise specified for a commercial partner module, templates in this directory are licensed under the [MIT License](./LICENSE).
