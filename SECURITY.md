# Security Policy

<div align="center">

[![Security Policy](https://img.shields.io/badge/Security-Policy_Enforced-22c55e?style=flat&labelColor=0f172a)](./SECURITY.md)
[![Response SLA](https://img.shields.io/badge/Response_SLA-72h-38bdf8?style=flat&labelColor=0f172a)](https://github.com/hoslift/ranu.js/security/advisories)
[![Reporting](https://img.shields.io/badge/Advisories-Private_Reporting-blue?style=flat&labelColor=0f172a)](https://github.com/hoslift/ranu.js/security/advisories/new)
[![Safe Harbor](https://img.shields.io/badge/Safe_Harbor-Compliant-8b5cf6?style=flat&labelColor=0f172a)](https://github.com/hoslift/ranu.js/security)

</div>

Security is an essential pillar of **Ranu.js**. We take the safety and integrity of applications built on Ranu.js seriously and are committed to addressing vulnerabilities promptly and transparently.

Ranu.js is currently in active development (**v0.1.x Public Alpha**). Security boundaries and APIs evolve toward production stability, and we actively maintain and backport critical fixes to the latest published releases.

---

## Supported Versions

Security fixes and maintenance patches are applied exclusively to the latest published release on npm.

| Version Line | Release State         |  Security Support  | Status                                            |
| :----------- | :-------------------- | :----------------: | :------------------------------------------------ |
| **`0.1.x`**  | Public Alpha          | :white_check_mark: | **Active Maintenance** (Latest published release) |
| `< 0.1.3`    | Development Pre-alpha |        :x:         | Unsupported / End of Life                         |

> [!NOTE]
> We strongly recommend keeping your dependencies pinned to the latest available `ranu` patch release (`npm install ranu@latest`) to ensure all security patches are active.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or social media.**

Public disclosure leaves developers and production workloads vulnerable before a remedy can be deployed. We provide two private, coordinated channels:

### Primary Channel: GitHub Private Vulnerability Reporting (Recommended)

1. Navigate to the [Ranu.js Security Advisories](https://github.com/hoslift/ranu.js/security/advisories/new) dashboard.
2. Click **"Report a vulnerability"**.
3. Fill in the advisory details, reproduction steps, and severity score.
4. Submit privately to the core maintenance team.

### Secondary Channel: Direct Security Email

If you cannot access GitHub Private Vulnerability Reporting, or wish to include encrypted proof-of-concept material, send an email directly to:

:envelope: **[security@hoslift.com](mailto:security@hoslift.com?subject=[SECURITY%20REPORT]%20Ranu.js%20Vulnerability)**

---

## What to Include in a Report

To help our security team investigate and remediate the issue efficiently, please include:

- **Description:** A concise explanation of the vulnerability and its potential impact.
- **Affected Component:** The specific package (e.g., `ranu`, `create-ranu`, `@ranu/adapter-vercel`) or runtime module.
- **Reproduction Steps:** Step-by-step instructions or a minimal proof-of-concept repository/script.
- **Environment:** Node.js version, operating system, and installed Ranu.js version (`npx ranu -v`).
- **Threat Model Assessment:** What an attacker could achieve (e.g., secret exfiltration, Denial of Service, path traversal).
- **Mitigation Suggestions:** Any suggested code fixes or temporary workarounds, if available.

---

## Response & Remediation SLA

We adhere to the following coordinated response schedule:

- **Initial Acknowledgment:** Within **72 hours** of report receipt.
- **Triage & Severity Confirmation:** Within **7 days** of acknowledgment.
- **Remediation & Patch Deployment:** Patches are prepared, tested, and released via private GitHub Advisories before public CVE issuance.
- **Coordinated Disclosure:** Release notes and researcher credits are published simultaneously with the patch release.

---

## Security Boundaries & Framework Scope

Ranu.js enforces specific architectural and compiler-level security guarantees:

1. **`server-only` Compiler Boundary:** Enforces compile-time isolation preventing server-only utilities, environment variables, or database credentials from leaking into client-side JavaScript bundles.
2. **ReDoS (Regular Expression Denial of Service) Protection:** Route matching and dynamic segment parsing operate within linear-time constraints to mitigate catastrophic backtracking.
3. **Filesystem & Traversal Guard:** Static asset streaming and route resolution strictly sanitize paths to block directory traversal attacks (`../`, `%2e%2e`) and sensitive dotfile exfiltration (`.env`, `.git`).
4. **XSS & State Serialization Safety:** Server-rendered stream payloads and hydrated state undergo strict escaping to neutralize script injection and prototype pollution vectors.
5. **Request Header & Body Safety:** Adapter boundaries enforce sensible default payload size ceilings to avoid memory exhaustion and DoS vectors.

---

## Safe Harbor Policy

We consider security research conducted in accordance with this policy to be authorized. We will **not** initiate legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction, and service interruption.
- Give the maintainers reasonable time to remediate vulnerabilities before public disclosure.
- Do not exploit vulnerabilities beyond what is strictly necessary to establish proof-of-concept.

---

## Researcher Recognition

We deeply value the contributions of the security research community. If you report a confirmed, actionable vulnerability following this responsible disclosure policy, we will gladly:

- Credit your name or handle in the official GitHub Security Advisory.
- Acknowledge your contribution in the public release changelog (unless you prefer to remain anonymous).

---

<div align="center">

**[Ranu.js](https://github.com/hoslift/ranu.js)** &bull; Maintained by **[Hoslift](https://github.com/hoslift)** &bull; Licensed under **[MIT](./LICENSE)**

</div>
