# @ranujs/adapter-<platform> (Contributor Template)

> **Contributor Boilerplate:** Use this template to create a new deployment adapter for Ranu.js.

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

1. Copy `contributors/adapters/_template` to `adapters/<platform-name>` (e.g., `adapters/aws`).
2. Update `tsconfig.json`:
   - Change `"extends": "../../../tsconfig.base.json"` to `"extends": "../../tsconfig.base.json"`.
3. Update `package.json`:
   - Set `"name": "@ranujs/adapter-<platform-name>"`.
   - Set `"version": "0.1.0"`.
   - Set `"author": "Your Name (https://github.com/your-username)"`.
   - Set `"private": false`.
4. Submit a **Module Submission & Certification Request** issue on GitHub.
5. Once reviewed and approved, your adapter will be certified and published!
