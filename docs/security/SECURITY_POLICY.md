# Security Policy & Vulnerability Management

Security is an essential foundation of the **Ranu.js** framework. We are committed to maintaining the integrity of applications built on Ranu.js, providing rapid remediation for reported vulnerabilities, and collaborating transparently with security researchers.

This policy defines our supported versions, private vulnerability disclosure processes, and remediation SLAs.

---

## 1. Supported Versions

Security fixes and maintenance patches are backported exclusively to the latest published release on npm.

| Release Tier | Security Support | Maintenance Status |
| :--- | :---: | :--- |
| **Latest Published (`@latest`)** | :white_check_mark: | **Active Maintenance** (Full security patches applied) |
| **Prior Versions** | :x: | Unsupported / End of Life |

> [!TIP]
> We recommend configuring automated dependency updates (e.g., Dependabot or Renovate) to keep `@ranujs/core` pinned to the latest release (`npm install @ranujs/core@latest`).

---

## 2. Reporting a Vulnerability

**Please do not report potential security vulnerabilities through public GitHub issues, discussions, or social media channels.**

Public disclosure exposes production systems to automated exploitation before an authorized fix can be tested and deployed.

### Primary Channel: GitHub Private Vulnerability Reporting (Preferred)
1. Go to the [Ranu.js Security Advisories](https://github.com/hoslift/ranu.js/security/advisories/new) page.
2. Select **"Report a vulnerability"**.
3. Complete the advisory report with vulnerability type, affected packages, proof-of-concept steps, and CVSS severity assessment.
4. Submit securely to the core maintainer team.

### Secondary Channel: Security Email
If you are unable to access GitHub Security Advisories, send an encrypted report directly to:

:envelope: **[security@hoslift.com](mailto:security@hoslift.com?subject=[SECURITY%20REPORT]%20Ranu.js%20Vulnerability)**

---

## 3. Vulnerability Response SLA

Our core engineering team adheres to the following coordinated response schedule:

* **Initial Acknowledgment:** Within **72 hours** of submission.
* **Triage & Severity Confirmation:** Within **7 calendar days** of acknowledgment.
* **Remediation & Patch Deployment:** Critical patches are prepared in private staging branches, tested across continuous integration harnesses, and released via private GitHub Advisories before public advisory publication.
* **Coordinated Disclosure:** Release announcements and researcher credits are published simultaneously with the patch release.

---

## 4. What to Include in Your Submission

To expedite investigation, provide:
1. **Description & Impact:** Clear technical analysis of the vulnerability and its potential exploit impact.
2. **Affected Packages:** The exact package (e.g., `@ranujs/core`, `create-ranujs`, `@ranujs/adapter-vercel`) or runtime component.
3. **Reproduction Steps:** Minimal proof-of-concept repository, script, or HTTP curl payload.
4. **Environment:** Node.js version, operating system, and framework version.
5. **Mitigation Suggestion:** Proposed code diff or temporary configuration workaround, if known.

---

## 5. Safe Harbor Guarantee

We consider security research conducted in accordance with this policy to be authorized. The project maintainers will **not** pursue legal action against researchers who:
* Exercise good-faith efforts to avoid privacy violations, data destruction, and service interruption.
* Provide reasonable time for maintainers to patch reported issues prior to public disclosure.
* Avoid accessing or exfiltrating user data beyond what is strictly necessary to establish a proof-of-concept.

---

## 6. Researcher Recognition

We deeply appreciate the vital contributions of the cybersecurity community. For confirmed, actionable reports submitted through our coordinated channels:
* You will be credited by name or handle in the official GitHub Security Advisory.
* You will receive permanent attribution in the release changelog.
